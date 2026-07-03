<div align="center">

<img src="docs/logo.png" width="130" alt="Clawd" />

# Claude e-paper

**Les limites de ton compte Claude Code, affichées par _Clawd_ la mascotte — sur ton navigateur et sur un écran e-paper de Raspberry Pi.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node-22%2B-3C873A?logo=node.js&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-Zero%202%20W-C51A4A?logo=raspberrypi&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

<br/>

<em>Le rendu sur écran e-paper 2.13" — noir/blanc/rouge ou noir & blanc :</em>

<img src="docs/epaper-color.png" width="380" alt="Rendu e-paper couleur" />
<img src="docs/epaper-bw.png" width="380" alt="Rendu e-paper noir et blanc" />

</div>

---

## 🐾 C'est quoi ?

**Claude e-paper** récupère l'état de ton forfait **Claude Code** (fenêtres de limite 5 h et 7 j) et l'affiche de deux façons :

- un **dashboard web** (protégé par passkey) ;
- une **image e-paper** poussée sur un écran e-ink de Raspberry Pi.

Le tout est incarné par **Clawd**, la mascotte crabe de Claude Code, qui change d'humeur et d'activité selon l'heure, ton activité et même ton anniversaire. C'est un mélange de tableau de bord et de **Tamagotchi**.

## ✨ Fonctionnalités

- 📊 **Vraies limites** — interroge le même endpoint que la commande `/usage` de Claude Code (fenêtres 5 h & 7 j, heures de reset).
- 🦀 **Clawd, la mascotte** — une douzaine de poses (au travail, pause café le matin, dodo la nuit, anniversaire, bisou, au soleil, sous la pluie…), qui **tournent au fil de la journée**.
- 🎮 **Stats Tamagotchi** — Énergie, Forme, Repu, Bonheur + un **niveau** qui monte avec le temps *et* avec ton usage.
- 🖥️ **Rendu e-paper fidèle** — génère le PNG exact de la dalle (N&B **ou** N/B/rouge), sans anti-aliasing ; l'aperçu web montre pixel pour pixel ce que reçoit la dalle.
- 🔐 **Auth passkey** — dashboard protégé par WebAuthn + code de récupération.
- ⚙️ **Installation en une commande** — `make install` (Node, libs, build) puis `make run`, ou en service `systemd` au boot.

## 🦀 Clawd & ses humeurs

<div align="center"><img src="docs/mascot-poses.png" width="760" alt="Les poses de Clawd" /></div>

Clawd ne se contente pas d'afficher un pourcentage : il **vit**. Sa pose est
choisie automatiquement selon le contexte (jamais selon le stress de la limite) :

- 🔄 **Rotation** — il change de pose au fil de la journée (intervalle réglable).
- ☕ **Pause café** — uniquement le matin.
- 😴 **Dodo** — la nuit, ou après un moment sans activité.
- 🎂 **Anniversaire** — la pose spéciale le jour J (date en config).
- ☀️/☔ **Au soleil / sous la pluie**, 😘 **bisou**, 🪄 **magie**… au gré de la rotation.
- 🎲 **Bouton shuffle** — force une pose au hasard depuis le dashboard.

La pose est calculée **côté serveur** : l'écran web et l'e-paper affichent donc
toujours exactement la même mascotte (en couleur sur le web, en line-art N&B sur l'e-ink).

## 📐 Deux formats d'écran

Le rendu s'adapte à la taille de ta dalle (`epaperLayout` en config) :

**Compact — 2.13" (250×122)** _(voir le hero en haut)_ : Clawd, les jauges 5 h / 7 j
et des mini-stats Tamagotchi.

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

- **Raspberry Pi Zero 2 W** (OS 64-bit) — quad-core ARMv8.
- **Waveshare 2.13-inch e-Paper HAT** branché sur les broches GPIO (SPI).

## 🚀 Installation (Raspberry Pi, sans Docker)

Tout passe par un **Makefile idempotent** : chaque cible vérifie et n'installe /
ne rebuild que ce qui manque.

```bash
sudo raspi-config       # Interface → SPI → activer (une fois)
git clone https://github.com/Vincweb/claude-epaper.git && cd claude-epaper
make install            # apt (libs e-paper), Node 22, lib Waveshare, npm install, build
make run                # app :8787 + boucle e-paper si la dalle est branchée (Ctrl-C stoppe tout)
```

| Cible | Rôle |
|---|---|
| `make install` | installe **ce qui manque** : paquets apt, Node 22 (NodeSource), lib Waveshare (`~/e-Paper`), `npm install`, build |
| `make run` | lance l'app ; si `/dev/spidev0.0` existe, lance aussi la boucle e-paper |
| `make services` | installe + active les unités `systemd` (user & chemins auto-détectés) → **démarre au boot** |
| `make update` | `git pull` + réinstalle/rebuild ce qui a changé + **re-synchronise les unités systemd** si elles sont installées (chemins/env à jour) — aussi accessible depuis le dashboard (**Config → Système → Mettre à jour l'app**) |
| `make dev` | hot-reload serveur + web (développement) |

**Première connexion :** le dashboard te demande de créer une **passkey**
(Touch ID / Face ID / clé de sécurité) et affiche un **code de récupération** (en
QR) à sauvegarder. Ensuite, **Config → Importer les credentials** pour brancher
tes limites Claude Code.

**Au boot :**

```bash
make services
journalctl -u claude-epaper -f     # logs de l'app
journalctl -u epaper-push -f       # logs de la dalle (refresh partiel/complet)
```

> Zero 2 W à court de RAM au build ? Builde sur ta machine (`npm run build`), copie
> `server/dist/` + `web/dist/` + `server/fonts/` sur le Pi, puis
> `npm install --omit=dev -w server` (express + resvg, binaires ARM précompilés).

## 🖥️ Brancher l'e-paper

La boucle [`epaper_push.py`](scripts/epaper_push.py) tire `/api/render.png` en local
à cadence rapide mais **ne touche la dalle que si l'image a changé**. À la façon de
[Bjorn](https://github.com/infinition/Bjorn) :

- **refresh partiel** à chaque changement (rapide, sans clignotement) sur les dalles monochromes ;
- **refresh complet périodique** (tous les `FULL_REFRESH_EVERY` partiels ou toutes les `FULL_REFRESH_SECONDS`) pour effacer le ghosting ;
- les dalles 3 couleurs (N/B/rouge) retombent sur le refresh complet.

Réglages (variables d'environnement, dans [`epaper-push.service`](scripts/epaper-push.service)) :

| Variable | Défaut | Rôle |
|---|---|---|
| `EPD_MODEL` | `epd2in13_V4` | module `waveshare_epd` de ta dalle |
| `POLL_SECONDS` | `5` | intervalle de vérification (n'écrit que si l'image a changé) |
| `FULL_REFRESH_EVERY` | `20` | refresh complet tous les N partiels (anti-ghosting) |
| `FULL_REFRESH_SECONDS` | `1800` | refresh complet au moins toutes les X s |
| `EPAPER_THRESHOLD` | `160` | seuil de binarisation 0-255 (sous le seuil → noir) |
| `REQUEST_TIMEOUT` | `20` | timeout (s) du fetch du PNG |
| `RENDER_URL` | `http://localhost:8787/api/render.png?palette=bw` | URL du PNG |

> Le rendu est généré **sans anti-aliasing** : l'onglet **e-paper** du dashboard
> montre exactement ce que reçoit la dalle. Dalle montée à l'envers ? Coche
> **Rotation 180°** dans ⚙︎ Config (l'aperçu web, lui, reste à l'endroit).

## 💻 Développement

```bash
npm install
npm run dev      # web (Vite :5321) + API (:8787), hot-reload
```

Sur macOS, `make install` saute les étapes matérielles (apt, Waveshare).

## 🔐 Sécurité

Le dashboard est protégé par une **passkey WebAuthn**. Si tu perds ta passkey,
connecte-toi avec le **code de récupération**. Les passkeys exigent un accès
**HTTPS** (ton domaine) ou `localhost` ; sur une IP LAN en HTTP, utilise le code
de récupération. L'auth (credential + code haché) vit dans `CONFIG_DIR/auth.json` :
un accès direct à la machine permet de la réinitialiser en supprimant ce fichier.
Les requêtes en **boucle locale** (la boucle e-paper sur le Pi) ne sont pas
soumises à l'auth.

## 📁 Structure

```
server/   API Node/TS : credentials + auth passkey + fetch usage + SSE + rendu PNG (resvg)
web/      Dashboard React/TS + Tailwind (react-router : Écran, e-paper, Humeurs, Config)
docs/     Visuels du README
scripts/  epaper_push.py (boucle e-paper) · gen-assets.mjs (visuels)
          claude-epaper.service · epaper-push.service (systemd) · self-update.sh
Makefile  install / run / update / services / dev
```

## 🗺️ Roadmap

Ce qui est prévu / en réflexion : **[ROADMAP.md](ROADMAP.md)**.

## 🙏 Crédits & mentions

- **Clawd** est la mascotte de Claude Code (Anthropic). Ce projet en propose une reconstruction pixel-art open source.
- Refresh e-paper inspiré du projet [Bjorn](https://github.com/infinition/Bjorn).
- Projet personnel, non affilié à Anthropic.

## 📄 Licence

[MIT](LICENSE).
