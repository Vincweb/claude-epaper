# CLAUDE.md

Guide pour travailler sur **Claude e-paper** (dashboard web + rendu e-paper des
limites Claude Code, incarné par la mascotte Clawd). Déploiement **100 % natif**
(pas de Docker).

## Langue

UI, commentaires de code et messages de commit en **français** (accents inclus).

## Stack

- **Serveur** : Node 22 + TypeScript (ESM), Express 4. Rendu SVG→PNG via
  `@resvg/resvg-js` (police **pixel Tiny5 embarquée** dans `server/fonts/`, OFL —
  nette à petite taille sur l'e-ink ; `loadSystemFonts:false` → déterministe).
- **Web** : React 19 + Vite 6 + Tailwind v4, `react-router-dom`.
- **Auth** : WebAuthn (`@simplewebauthn/server` + `/browser`), passkey unique +
  code de récupération (QR via `qrcode`), session cookie signée (`cookie-parser`).
- **Boucle e-paper** : Python 3 (`epaper_push.py`) + lib Waveshare officielle,
  Pillow/requests/spidev/gpiozero/lgpio. Tourne sur le Raspberry Pi.
- **Déploiement** : `Makefile` (install/run/update/services) + unités `systemd`.

## Architecture (important)

**Le serveur est la source de vérité unique.** Le `UsagePoller`
(`server/src/poller.ts`) calcule et expose dans son état, poussé en **SSE**
(`/api/usage/stream`) : `snapshot` (limites), `pose`, `stats`, `level`,
`ageLabel`. Web **et** e-paper consomment ce même état → l'écran et la dalle
affichent toujours la même chose (pose, niveau, stats).

- `render.ts` : construit le SVG du panneau pour la dalle 2,13" —
  `buildHorizontal` 250×122 (carré mascotte 118×118 à gauche, infos à droite) /
  `buildVertical` 122×250 (online, carré, limites+stats) — et le rastérise,
  toujours en **noir & blanc**, **sans anti-aliasing** (`crispEdges`). Le rendu
  est **animé à la seconde** (`tick`) : point online clignotant (1 s plein /
  1 s absent ; offline = cercle vide statique) et poses GIF (1 image/s, pause
  de 10 s frame 0 entre les boucles).
- **Sprites de poses = fichiers** (source de vérité du dessin) :
  `server/sprites/{epaper,web}/<key>.png|.gif` (défauts embarqués, e-paper
  118×118 N&B affiché 1:1/pixelated, web ≥480×480 couleur HD affiché lissé) ;
  overrides utilisateur uploadés dans `CONFIG_DIR/sprites/` (galerie Humeurs). Fallback :
  rendu vectoriel `clawdSvg`. `scripts/gen-sprites.mjs` régénère les défauts.
- `mascot.ts` : logique de pose partagée, `selectPose`/`forcedPose`, pools,
  `ALL_POSES`/`SHUFFLE_POOL`/`SPECIAL_POSES`, stats, niveau.
- `poses.ts` : personnalisation persistée (`CONFIG_DIR/poses.json`) — renommage
  (`titles`) et humeurs de rotation ajoutées (`custom`) ; `withTitle`,
  `customPoses`, `rotationPoses`, `findPose` (base + perso).
- `auth.ts` : WebAuthn + code de récup (fichier `CONFIG_DIR/auth.json`),
  middleware `requireAuth` (bypass **boucle locale** pour la boucle e-paper).
- `routes/api.ts` : endpoints (voir ci-dessous).
- Web : `App.tsx` gère l'auth (Setup/Login) puis le `Layout` routé ; pages dans
  `web/src/pages/` (`ScreenPage`, `EpaperPage`, `HumeursPage`, `ConfigPage`).

## Endpoints clés (`/api`)

- `GET /render.png?layout=horizontal|vertical&rotate=&scale=` — PNG N&B de la
  dalle (auth ; boucle locale exemptée). L'aperçu web force `rotate=0` et se
  rafraîchit chaque seconde (animations). Anciennes valeurs de layout acceptées.
- `GET /poses` (liste + flags `special`/`userAdded`/animé/personnalisé) ·
  `GET|PUT|DELETE /poses/:variant/:key` (`variant` = `epaper`|`web`) — fichiers de
  poses ; `PUT` reçoit le PNG/GIF en corps brut (galerie Humeurs).
- `POST /poses` `{title}` (ajoute une humeur de rotation) · `PUT /poses/:key`
  `{title}` (renomme, base ou perso) · `DELETE /poses/:key` (supprime une perso).
  Persistées dans `CONFIG_DIR/poses.json` (`server/src/poses.ts`).
- `GET /usage/stream` (SSE), `GET /usage`, `GET /config`, `PUT /config`.
- `POST /pose/shuffle` · `POST /pose/reset` — pose manuelle.
- `POST /auth/register/{options,verify}` · `/auth/login/{options,verify}` ·
  `/auth/recover` · `/auth/logout` · `GET /auth/state` · `POST /auth/import`.
- `GET /system/version` · `GET /system/update-check` (git fetch + behind) ·
  `POST /system/update` (lance `scripts/self-update.sh` détaché).

## Commandes

```bash
make install     # deps (apt e-paper, Node 22, lib Waveshare), npm ci, build
make run         # app :8787 (+ boucle e-paper si /dev/spidev0.0)
make services    # unités systemd (user/chemins auto) + enable + restart
make update      # git pull + rebuild + resync services
make dev         # hot-reload (dev)
npm run dev      # web (Vite :5321) + API (:8787)
npm run build    # web + serveur
node scripts/gen-assets.mjs    # régénère les visuels docs/ (build serveur requis)
node scripts/gen-sprites.mjs   # régénère les sprites de poses par défaut
```

## Conventions & pièges

- **Bump de version** : à chaque changement destiné à être déployé, incrémenter
  la `version` du **`package.json` racine** (semver). C'est cette valeur qui
  s'affiche dans Config (`GET /system/version`) et qui alimente la bannière
  « mise à jour disponible » (`update-check` compare `origin/main:package.json`).
  Ne pas oublier, sinon le Pi ne « voit » pas la nouvelle version.
- **`npm ci`, pas `npm install`** : évite la réécriture du lockfile (deps natives
  ARM) qui bloquait `git pull` sur le Pi.
- **Systemd** : services en `Restart=always` + `KillMode=process` pour que
  `self-update.sh` survive au redémarrage qu'il déclenche (mise à jour sans sudo).
- **e-paper** : la boucle tire à **1 s** (suit les animations) mais ne pousse
  sur la dalle **que si l'image a changé** (md5) ; refresh **partiel** au
  changement, **complet** périodique (anti-ghosting), façon
  [Bjorn](https://github.com/infinition/Bjorn).
- **Rendu déterministe** : pour tester un rendu, appeler `rasterizeSvg` /
  `buildHorizontal`/`buildVertical` depuis `server/dist/render.js` avec un
  `tick` figé (cf. `gen-assets.mjs`).
- **Config** persistée dans `CONFIG_DIR` (défaut `~/.claude-epaper/`) :
  `config.json`, `credentials.json` (copie gérée), `auth.json`.
- **Auth** : passkey unique ; supprimer `auth.json` réinitialise. WebAuthn exige
  HTTPS ou `localhost`.

## Structure

```
server/src/  index · poller · render · mascot · auth · credentials · usage · config · routes/api
server/fonts/  Tiny5 (police pixel embarquée pour resvg, OFL)
web/src/     App · api · lib/usage · pages/* · components/*
scripts/     epaper_push.py · self-update.sh · gen-assets.mjs · *.service
Makefile · CLAUDE.md · README.md · ROADMAP.md
```
