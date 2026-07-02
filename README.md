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

Le Pi Zero 2 W est lent à builder. On **construit l'image ici** (Mac/CI) et on la pousse sur **Docker Hub** ; **le Pi ne fait plus que `pull`**. Un **seul conteneur** embarque l'app Node **et** la boucle push e-paper (Python).

**1. Sur ta machine — build + push** (il faut être connecté : `docker login`) :

```bash
./scripts/build-and-push.sh                    # Docker Hub, arm64, tag latest
```

> Pour utiliser GHCR à la place : `IMAGE_PREFIX=ghcr.io/vincweb ./scripts/build-and-push.sh`.

**2a. Sur le Pi en ligne de commande** :

```bash
docker compose pull && docker compose up -d
```

Pour l'e-paper, décommente `privileged` + `devices` dans le [docker-compose.yml](docker-compose.yml).

**2b. Ou via l'interface CasaOS** (*App personnalisée → Installer manuellement*) :

| Champ | Valeur |
|---|---|
| **Image Docker** | `vincweb/claude-epaper` — **Tag** `latest` |
| **Titre** | Claude ePaper |
| **URL de l'icône** | `https://github.com/Vincweb/claude-epaper/blob/main/docs/logo.png?raw=true` |
| **Web UI** | `http://` · port `8787` · `/` |
| **Ports** | `8787` (hôte) → `8787` (conteneur), TCP |
| **Volumes** | `/DATA/AppData/claude-epaper` → `/data` |
| | `/home/vincweb/.claude` → `/root/.claude` (**lecture seule**) |
| **Variables d'env.** | `EPD_MODEL=epd2in13_V4`, `POLL_SECONDS=30`, `FULL_REFRESH_EVERY=30`, `FULL_REFRESH_SECONDS=3600` (option : `EPAPER_PUSH=0` si pas de dalle) |
| **Périphériques** | `/dev/spidev0.0` → `/dev/spidev0.0` |
| | `/dev/gpiochip0` → `/dev/gpiochip0` |
| **Privilège** | active **le mode privilégié** (nécessaire pour le GPIO) |

Le dashboard est ensuite sur le port **8787**. Le conteneur lance le serveur Node + la boucle e-paper.

> Machine sans dalle (NAS/dev) : `EPAPER_PUSH=0` pour ne lancer que l'app (et ignore Périphériques / Privilège).

## 🖥️ Brancher l'e-paper

Le conteneur tire son propre PNG (`/api/render.png` en local) à cadence rapide mais **ne touche la dalle que si l'image a changé**. À la façon de [Bjorn](https://github.com/infinition/Bjorn) :

- **refresh partiel** à chaque changement (rapide, sans clignotement) sur les dalles monochromes qui le supportent ;
- **refresh complet périodique** (tous les `FULL_REFRESH_EVERY` partiels ou toutes les `FULL_REFRESH_SECONDS`) pour effacer le ghosting ;
- les dalles 3 couleurs (noir/blanc/rouge) retombent automatiquement sur le refresh complet.

**Sur le Pi :**

1. Active SPI : `sudo raspi-config` → *Interface* → *SPI*.
2. Le conteneur a besoin des périphériques `/dev/spidev0.0` + `/dev/gpiochip0` et du **mode privilégié** (voir l'étape 2 ci-dessus). Ajuste `EPD_MODEL` et les cadences via les variables d'environnement.

Réglages (variables d'environnement du service) :

| Variable | Défaut | Rôle |
|---|---|---|
| `EPAPER_PUSH` | `1` | `0` pour désactiver la boucle (machine sans dalle) |
| `EPD_MODEL` | `epd2in13_V4` | module `waveshare_epd` de ta dalle |
| `POLL_SECONDS` | `30` | intervalle de tirage |
| `FULL_REFRESH_EVERY` | `30` | refresh complet tous les N partiels |
| `FULL_REFRESH_SECONDS` | `3600` | refresh complet au moins toutes les X s |
| `RENDER_URL` | `http://localhost:8787/api/render.png` | URL du PNG (local au conteneur) |

### Alternative : sans Docker (natif + systemd)

Si tu préfères lancer la boucle directement sur l'hôte (l'app pouvant tourner ailleurs) :

```bash
pip install requests pillow                 # + la lib Waveshare (waveshare_epd)
RENDER_URL=http://<hote>:8787/api/render.png python3 scripts/epaper_push.py
```

Pour un démarrage au boot, installe le service fourni ([scripts/epaper-push.service](scripts/epaper-push.service)) — adapte `User`, chemins et variables :

```bash
sudo cp scripts/epaper-push.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now epaper-push.service
journalctl -u epaper-push.service -f        # logs (refresh partiel/complet)
```

## 📁 Structure

```
server/   API Node/TS : credentials + refresh + fetch usage + SSE + rendu PNG (resvg)
web/      Dashboard React/TS + Tailwind (jauges, Clawd animé, stats, config, PWA)
docs/     Visuels du README
scripts/  gen-assets.mjs · epaper_push.py (boucle e-paper) · entrypoint.sh
          build-and-push.sh (Docker Hub) · epaper-push.service (systemd, natif)
Dockerfile                         image unique (Node + Python + lib Waveshare)
docker-compose.yml                 déploiement (1 service) — CLI ou CasaOS
```

## 🗺️ Roadmap

Ce qui est prévu / en réflexion : **[ROADMAP.md](ROADMAP.md)**.

## 🙏 Crédits & mentions

- **Clawd** est la mascotte de Claude Code (Anthropic). Ce projet en propose une reconstruction pixel-art open source.
- Présentation inspirée du projet [Bjorn](https://github.com/infinition/Bjorn).
- Projet personnel, non affilié à Anthropic.

## 📄 Licence

[MIT](LICENSE).
