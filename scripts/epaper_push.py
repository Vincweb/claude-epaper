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

Le serveur anime le rendu (point online clignotant, poses GIF à 1 image/s) :
la boucle tire donc à cadence 1 s par défaut et pousse en refresh partiel ;
le md5 évite de toucher la dalle quand l'image n'a pas bougé.

Robustesse : une erreur matérielle (SPI) ne fait plus planter le script (on
réinitialise la dalle et on continue) ; à l'arrêt (SIGTERM de systemd), la
dalle est mise en veille proprement. Les journaux sont agrégés : un résumé
périodique plutôt qu'une ligne par seconde (carte SD, journald).

Config via variables d'environnement (toutes optionnelles) :
  RENDER_URL            URL du PNG            (def. http://localhost:8787/api/render.png)
  RENDER_API_KEY        clé d'API (Config → Application iOS) si le serveur
                        n'est PAS sur la même machine (sinon inutile)
  EPD_MODEL             module waveshare_epd  (def. epd2in13_V4)
  POLL_SECONDS          intervalle de tirage  (def. 1 — anime à 1 img/s)
  FULL_REFRESH_EVERY    refresh complet tous les N partiels  (def. 1800)
  FULL_REFRESH_SECONDS  refresh complet au moins tous les X s (def. 1800)
  EPAPER_THRESHOLD      seuil de binarisation 0-255          (def. 160)
  REQUEST_TIMEOUT       timeout du fetch en s                (def. 20)
  LOG_EVERY_SECONDS     résumé d'activité dans le journal    (def. 3600)

Lancement typique (sur le Pi, accès SPI/GPIO) :
  RENDER_URL=http://nas:8787/api/render.png RENDER_API_KEY=… python3 epaper_push.py
"""

import hashlib
import importlib
import io
import os
import signal
import sys
import time

import requests
from PIL import Image

# Le rendu serveur est déjà en noir & blanc (dalle unique 2,13" N&B).
RENDER_URL = os.environ.get("RENDER_URL", "http://localhost:8787/api/render.png")
RENDER_API_KEY = os.environ.get("RENDER_API_KEY", "").strip()
EPD_MODEL = os.environ.get("EPD_MODEL", "epd2in13_V4")
# 1 s : suit les animations du serveur (point online, poses GIF).
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "1"))
# À 1 img/s, les deux garde-fous tombent ensemble : un refresh complet (flash)
# toutes les ~30 min pour effacer le ghosting du partiel.
FULL_REFRESH_EVERY = int(os.environ.get("FULL_REFRESH_EVERY", "1800"))
FULL_REFRESH_SECONDS = int(os.environ.get("FULL_REFRESH_SECONDS", "1800"))
# Le 1er rendu peut être lent au démarrage (Pi Zero) → timeout large.
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "20"))
# Seuil de binarisation (0-255) : sous le seuil → noir. Le rendu serveur est
# déjà sans anti-aliasing ; 160 absorbe les rares gris restants (filtre).
THRESHOLD = int(os.environ.get("EPAPER_THRESHOLD", "160"))
LOG_EVERY_SECONDS = int(os.environ.get("LOG_EVERY_SECONDS", "3600"))
# Erreurs matérielles d'affilée avant d'abandonner (systemd relance le script).
MAX_HW_ERRORS = 5


def log(msg):
    print(f"[epaper] {msg}", flush=True)


class Stop(BaseException):
    """Arrêt demandé (SIGTERM / SIGINT). BaseException : jamais avalé par un `except Exception`."""


def _on_signal(signum, _frame):
    raise Stop(signal.Signals(signum).name)


def load_epd():
    """Importe waveshare_epd.<EPD_MODEL> et instancie l'écran."""
    mod = importlib.import_module(f"waveshare_epd.{EPD_MODEL}")
    epd = mod.EPD()
    supports_partial = hasattr(epd, "displayPartial") and hasattr(
        epd, "displayPartBaseImage"
    )
    return mod, epd, supports_partial


def make_session():
    """Connexion HTTP réutilisée (keep-alive) + clé d'API éventuelle."""
    s = requests.Session()
    if RENDER_API_KEY:
        s.headers["Authorization"] = f"Bearer {RENDER_API_KEY}"
    return s


def fetch_png(session):
    """Récupère le PNG brut et son empreinte (sans le décoder)."""
    r = session.get(RENDER_URL, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.content, hashlib.md5(r.content).digest()


def to_bitmap(png, width, height):
    """PNG → image 1-bit (seuil net, sans tramage).

    getbuffer() gère lui-même la rotation quand l'image est en (w,h) OU (h,w) :
    on laisse donc le rendu paysage tel quel et on ne redimensionne qu'en
    dernier recours (taille inattendue), sinon on écraserait le contenu.
    """
    gray = Image.open(io.BytesIO(png)).convert("L")
    img = gray.point(lambda p: 255 if p >= THRESHOLD else 0).convert(
        "1", dither=Image.NONE
    )
    if img.size not in ((width, height), (height, width)):
        img = img.resize((height, width))
    return img


def sleep_until_next_tick():
    # Cadence ALIGNÉE sur l'horloge murale : le serveur anime selon
    # floor(time / POLL_SECONDS). Si on dormait POLL_SECONDS après un cycle
    # de durée variable (fetch + refresh e-ink), l'échantillonnage dériverait
    # et le clignotement sauterait/doublerait des secondes. On dort donc
    # jusqu'à juste après la prochaine frontière → une frame par seconde, net.
    period = max(1, POLL_SECONDS)
    time.sleep(period - (time.time() % period) + 0.02)


def main():
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    mod, epd, supports_partial = load_epd()
    epd.init()
    epd.Clear(0xFF)
    session = make_session()

    last_digest = None
    base_set = False          # base image du refresh partiel établie ?
    partials_since_full = 0
    last_full = time.monotonic()
    hw_errors = 0
    fetch_failing = False     # pour ne journaliser que les transitions
    stats = {"partiels": 0, "complets": 0, "fetch_ko": 0}
    last_report = time.monotonic()

    mode = "partiel" if supports_partial else "complet uniquement"
    log(f"{EPD_MODEL} {epd.width}x{epd.height} — mode {mode}")

    try:
        while True:
            try:
                png, digest = fetch_png(session)
                if fetch_failing:
                    log("serveur de nouveau joignable")
                    fetch_failing = False
            except Exception as exc:  # réseau/serveur momentanément indispo
                stats["fetch_ko"] += 1
                if not fetch_failing:
                    log(f"fetch KO: {exc} (silence jusqu'au retour du serveur)")
                    fetch_failing = True
                sleep_until_next_tick()
                continue

            now = time.monotonic()
            changed = digest != last_digest
            due_full = (
                partials_since_full >= FULL_REFRESH_EVERY
                or (now - last_full) >= FULL_REFRESH_SECONDS
            )

            if changed:
                try:
                    # Décodage seulement si l'image a changé (md5 calculé sur le PNG brut).
                    img = to_bitmap(png, epd.width, epd.height)
                    buf = epd.getbuffer(img)
                    # Refresh complet : au 1er passage, périodiquement, ou si pas de partiel.
                    if due_full or not supports_partial or not base_set:
                        epd.init()
                        epd.display(buf)
                        if supports_partial:
                            epd.displayPartBaseImage(buf)  # ré-arme le partiel
                            base_set = True
                        partials_since_full = 0
                        last_full = now
                        stats["complets"] += 1
                    else:
                        # Refresh partiel : rapide, tant qu'on n'a pas atteint le quota.
                        epd.displayPartial(buf)
                        partials_since_full += 1
                        stats["partiels"] += 1
                    last_digest = digest
                    hw_errors = 0
                except Stop:
                    raise
                except Exception as exc:
                    # Erreur SPI/GPIO : on réinitialise la dalle sans effacer
                    # l'écran (pas de flash) et on retente au tick suivant.
                    hw_errors += 1
                    log(f"erreur dalle ({hw_errors}/{MAX_HW_ERRORS}): {exc}")
                    if hw_errors >= MAX_HW_ERRORS:
                        raise
                    base_set = False
                    try:
                        epd.init()
                    except Exception as exc2:
                        log(f"réinitialisation KO: {exc2}")
                    time.sleep(2)

            if now - last_report >= LOG_EVERY_SECONDS:
                log(
                    f"bilan {int((now - last_report) / 60)} min : "
                    f"{stats['partiels']} partiels, {stats['complets']} complets, "
                    f"{stats['fetch_ko']} fetch KO"
                )
                stats = dict.fromkeys(stats, 0)
                last_report = now

            sleep_until_next_tick()
    finally:
        # Arrêt (systemd, Ctrl-C) ou erreur fatale : dalle en veille, l'image
        # reste affichée (e-ink) sans que le contrôleur reste alimenté.
        try:
            epd.sleep()
        except Exception:
            pass
        try:
            mod.epdconfig.module_exit(cleanup=True)
        except TypeError:
            mod.epdconfig.module_exit()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Stop as stop:
        log(f"arrêt ({stop})")
        sys.exit(0)
