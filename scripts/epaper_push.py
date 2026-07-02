#!/usr/bin/env python3
"""Pousse /api/render.png sur la dalle e-paper du Raspberry Pi.

Stratégie inspirée de Bjorn :
  - on tire le PNG à cadence rapide, mais on ne touche la dalle QUE si l'image
    a changé (l'e-ink limite le nombre d'écritures) ;
  - à chaque changement, on fait un **refresh partiel** (rapide, sans le
    clignotement noir/blanc) sur les dalles monochromes qui le supportent ;
  - de temps en temps (toutes les N mises à jour OU au bout de X secondes), on
    force un **refresh complet** pour effacer le ghosting résiduel du partiel.

Les dalles 3 couleurs (noir/blanc/rouge) ne gèrent pas le partiel : on retombe
automatiquement sur le refresh complet.

Config via variables d'environnement (toutes optionnelles) :
  RENDER_URL            URL du PNG            (def. http://localhost:8787/api/render.png)
  EPD_MODEL             module waveshare_epd  (def. epd2in13_V4)
  POLL_SECONDS          intervalle de tirage  (def. 30)
  FULL_REFRESH_EVERY    refresh complet tous les N partiels  (def. 30)
  FULL_REFRESH_SECONDS  refresh complet au moins tous les X s (def. 3600)

Lancement typique (sur le Pi, accès SPI/GPIO) :
  RENDER_URL=http://nas:8787/api/render.png python3 epaper_push.py
"""

import hashlib
import importlib
import io
import os
import sys
import time

import requests
from PIL import Image

# palette=bw : line-art noir & blanc (pas la version couleur du crabe qui
# devient une bouillie une fois convertie en 1-bit).
RENDER_URL = os.environ.get(
    "RENDER_URL", "http://localhost:8787/api/render.png?palette=bw"
)
EPD_MODEL = os.environ.get("EPD_MODEL", "epd2in13_V4")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "30"))
FULL_REFRESH_EVERY = int(os.environ.get("FULL_REFRESH_EVERY", "30"))
FULL_REFRESH_SECONDS = int(os.environ.get("FULL_REFRESH_SECONDS", "3600"))
# Le 1er rendu peut être lent au démarrage (Pi Zero) → timeout large.
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "20"))


def load_epd():
    """Importe waveshare_epd.<EPD_MODEL> et instancie l'écran."""
    mod = importlib.import_module(f"waveshare_epd.{EPD_MODEL}")
    epd = mod.EPD()
    supports_partial = hasattr(epd, "displayPartial") and hasattr(
        epd, "displayPartBaseImage"
    )
    return epd, supports_partial


def fetch_image(width, height):
    """Récupère le PNG et le convertit en 1-bit (seuil net, sans tramage).

    getbuffer() gère lui-même la rotation quand l'image est en (w,h) OU (h,w) :
    on laisse donc le rendu paysage tel quel et on ne redimensionne qu'en
    dernier recours (taille inattendue), sinon on écraserait le contenu.
    """
    png = requests.get(RENDER_URL, timeout=REQUEST_TIMEOUT).content
    digest = hashlib.md5(png).digest()
    img = Image.open(io.BytesIO(png)).convert("1", dither=Image.NONE)
    if img.size not in ((width, height), (height, width)):
        img = img.resize((height, width))
    return img, digest


def main():
    epd, supports_partial = load_epd()
    epd.init()
    epd.Clear(0xFF)

    last_digest = None
    base_set = False          # base image du refresh partiel établie ?
    partials_since_full = 0
    last_full = time.monotonic()

    mode = "partiel" if supports_partial else "complet uniquement"
    print(f"[epaper] {EPD_MODEL} {epd.width}x{epd.height} — mode {mode}", flush=True)

    while True:
        try:
            img, digest = fetch_image(epd.width, epd.height)
        except Exception as exc:  # réseau/serveur momentanément indispo
            print(f"[epaper] fetch KO: {exc}", flush=True)
            time.sleep(POLL_SECONDS)
            continue

        now = time.monotonic()
        changed = digest != last_digest
        due_full = (
            partials_since_full >= FULL_REFRESH_EVERY
            or (now - last_full) >= FULL_REFRESH_SECONDS
        )

        # Refresh complet : au 1er passage, périodiquement, ou si pas de partiel.
        if changed and (due_full or not supports_partial or not base_set):
            epd.init()
            epd.display(epd.getbuffer(img))
            if supports_partial:
                epd.displayPartBaseImage(epd.getbuffer(img))  # ré-arme le partiel
                base_set = True
            partials_since_full = 0
            last_full = now
            last_digest = digest
            print("[epaper] refresh complet", flush=True)

        # Refresh partiel : rapide, tant qu'on n'a pas atteint le quota.
        elif changed and supports_partial:
            epd.displayPartial(epd.getbuffer(img))
            partials_since_full += 1
            last_digest = digest
            print(f"[epaper] refresh partiel ({partials_since_full})", flush=True)

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[epaper] arrêt", flush=True)
        sys.exit(0)
