<div align="center">

<img src="docs/logo.png" width="130" alt="Clawd" />

# Claude e-paper

**Les limites de ton compte Claude Code, affichées par _Clawd_ la mascotte — sur ton navigateur et sur un écran e-paper de Raspberry Pi.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node-22%2B-3C873A?logo=node.js&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-Zero%202%20W-C51A4A?logo=raspberrypi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-CasaOS-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

<br/>

<em>Le rendu sur écran e-paper 2.13" — noir/blanc/rouge ou noir & blanc :</em>

<img src="docs/epaper-color.png" width="380" alt="Rendu e-paper couleur" />
<img src="docs/epaper-bw.png" width="380" alt="Rendu e-paper noir et blanc" />

</div>

---

## 🐾 C'est quoi ?

**Claude e-paper** récupère l'état de ton forfait **Claude Code** (fenêtres de limite 5 h et 7 j) et l'affiche de deux façons :

- un **dashboard web** installable (PWA) ;
- une **image e-paper** prête à être poussée sur un écran e-ink de Raspberry Pi.

Le tout est incarné par **Clawd**, la mascotte crabe de Claude Code, qui change d'humeur et d'activité selon l'heure, ton activité et même ton anniversaire. C'est un mélange de tableau de bord et de **Tamagotchi**.

## ✨ Fonctionnalités

- 📊 **Vraies limites** — interroge le même endpoint que la commande `/usage` de Claude Code (fenêtres 5 h & 7 j, heures de reset).
- 🦀 **Clawd, la mascotte** — une douzaine de poses (au travail, pause café le matin, dodo la nuit, anniversaire, bisou, au soleil, sous la pluie…), qui **tournent au fil de la journée**.
- 🎮 **Stats Tamagotchi** — Énergie, Forme, Repu, Bonheur + un **niveau** qui monte avec le temps *et* avec ton usage.
- 🖥️ **Rendu e-paper** — génère le PNG exact de la dalle (noir & blanc **ou** noir/blanc/rouge), via `GET /api/render.png`.
- 🌐 **Dashboard web + PWA** — jauges, personnage animé, page de config, installable avec icône.
- 🐳 **Docker / CasaOS** — image multi-stage prête à déployer.

## 🦀 Clawd & ses humeurs

<div align="center"><img src="docs/mascot-poses.png" width="760" alt="Les poses de Clawd" /></div>

Clawd ne se contente pas d'afficher un pourcentage : il **vit**. Sa pose est
choisie automatiquement selon le contexte (jamais selon le stress de la limite) :

- 🔄 **Rotation** — il change de pose au fil de la journée (intervalle réglable).
- ☕ **Pause café** — uniquement le matin.
- 😴 **Dodo** — la nuit, ou après un moment sans activité.
- 🎂 **Anniversaire** — la pose spéciale le jour J (date en config).
- ☀️/☔ **Au soleil / sous la pluie**, 😘 **bisou**, 🪄 **magie**… au gré de la rotation.

Chaque pose existe en **version couleur** (écran) et en **version noir & blanc**
distincte — un vrai line-art pour l'e-ink, pas une simple désaturation.

## 📐 Deux formats d'écran

Le rendu s'adapte à la taille de ta dalle (`epaperLayout` en config) :

**Compact — 2.13" (250×122)** _(voir le hero en haut)_ : Clawd, les jauges 5 h / 7 j
et des mini-stats Tamagotchi (Énergie, Repu, Joie).

**Grand — 7.5" (800×480)** : la version détaillée, avec stats complètes.

<div align="center"><img src="docs/epaper-full.png" width="620" alt="Rendu e-paper grand format 7.5 pouces" /></div>

## 🧩 Comment ça marche

La page `/usage` de Claude appelle un endpoint OAuth ; l'app fait la même chose :

```http
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <access_token>
anthropic-beta: oauth-2025-04-20
```

Elle réutilise le **token OAuth déjà présent** sur la machine (celui de Claude Code, lu depuis `~/.claude/.credentials.json` ou le trousseau macOS), le rafraîchit automatiquement, met en cache le résultat et le diffuse en temps réel (SSE) au dashboard et au moteur de rendu.

> [!WARNING]
> Cet endpoint **n'est pas une API publique documentée**. Réutiliser le token OAuth de Claude Code dans un outil tiers se situe en zone grise vis-à-vis des CGU d'Anthropic. Projet **personnel**, à utiliser à tes risques.

## 🛠️ Matériel

Cible de référence de ce projet :

- **Raspberry Pi Zero 2 W** (OS 64-bit) — quad-core ARMv8, compatible Node moderne + Docker.
- **Waveshare 2.13-inch e-Paper HAT** branché sur les broches GPIO (SPI).

> Le rendu par défaut vise une grande dalle (800×480). Un **layout compact optimisé pour le 2.13"** (250×122) est au programme — voir la [roadmap](ROADMAP.md).

## 🚀 Démarrage rapide

```bash
git clone git@github.com:Vincweb/claude-epaper.git
cd claude-epaper
npm install
npm run dev          # web (Vite) + API sur :8787
```

Ouvre le dashboard, puis **⚙︎ Config → Importer les credentials**. Sans credentials, l'app démarre en **mode démo** (curseurs).

## 🐳 Docker / CasaOS

```bash
docker compose up -d --build
```

Le dashboard est sur le port **8787**. Importe le `docker-compose.yml` dans CasaOS. Sur le Pi, décommente la section `devices` pour l'accès SPI/GPIO.

## 🖥️ Brancher l'e-paper

1. Active SPI : `sudo raspi-config` → *Interface* → *SPI*.
2. Installe la lib Waveshare de ton écran (Python officiel).
3. Le **Pi tire `/api/render.png`** à sa cadence et ne rafraîchit la dalle que si l'image a changé (l'e-ink limite les écritures) :

```python
import time, io, hashlib, requests
from waveshare_epd import epd2in13_V4      # adapte à ton modèle
from PIL import Image

epd = epd2in13_V4.EPD(); epd.init()
last = None
while True:
    png = requests.get("http://<hote>:8787/api/render.png").content
    h = hashlib.md5(png).digest()
    if h != last:                           # ne pousse que si ça a changé
        img = Image.open(io.BytesIO(png)).convert("1")
        epd.display(epd.getbuffer(img))
        last = h
    time.sleep(600)                         # toutes les 10 min
```

> Le conteneur/app peut tourner ailleurs (NAS, CasaOS) ; seule cette petite boucle doit tourner **sur le Pi** (accès SPI/GPIO).

## 📁 Structure

```
server/   API Node/TS : credentials + refresh + fetch usage + SSE + rendu PNG (resvg)
web/      Dashboard React/TS + Tailwind (jauges, Clawd animé, stats, config, PWA)
docs/     Visuels du README
scripts/  Génération des assets
Dockerfile · docker-compose.yml   déploiement (CasaOS / Raspberry Pi)
```

## 🗺️ Roadmap

Ce qui est prévu / en réflexion : **[ROADMAP.md](ROADMAP.md)**.

## 🙏 Crédits & mentions

- **Clawd** est la mascotte de Claude Code (Anthropic). Ce projet en propose une reconstruction pixel-art open source.
- Présentation inspirée du projet [Bjorn](https://github.com/infinition/Bjorn).
- Projet personnel, non affilié à Anthropic.

## 📄 Licence

[MIT](LICENSE).
