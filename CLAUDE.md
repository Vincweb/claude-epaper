# CLAUDE.md

Guide pour travailler sur **Claude e-paper** (dashboard web + rendu e-paper des
limites Claude Code, incarné par la mascotte Clawd). Déploiement **100 % natif**
(pas de Docker).

## Langue

UI, commentaires de code et messages de commit en **français** (accents inclus).

## Stack

- **Serveur** : Node 22 + TypeScript (ESM), Express 4. Rendu SVG→PNG via
  `@resvg/resvg-js` (police **DejaVu Sans Mono embarquée** dans `server/fonts/`,
  `loadSystemFonts:false` → rendu déterministe).
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

- `render.ts` : construit le SVG du panneau (`buildCompact` 250×122 / `buildFull`
  800×480) et le rastérise. **Sans anti-aliasing** (`shape-rendering=crispEdges`)
  pour que la binarisation e-ink ne ronge pas les glyphes. `clawdSvg` dessine la
  mascotte (yeux + bouche + accessoires + objets), miroir de `ClaudeCharacter`.
- `mascot.ts` : logique de pose partagée (miroir de `web/src/lib/usage.ts`),
  `selectPose`/`forcedPose`, pools, stats, niveau.
- `auth.ts` : WebAuthn + code de récup (fichier `CONFIG_DIR/auth.json`),
  middleware `requireAuth` (bypass **boucle locale** pour la boucle e-paper).
- `routes/api.ts` : endpoints (voir ci-dessous).
- Web : `App.tsx` gère l'auth (Setup/Login) puis le `Layout` routé ; pages dans
  `web/src/pages/` (`ScreenPage`, `EpaperPage`, `HumeursPage`, `ConfigPage`).

## Endpoints clés (`/api`)

- `GET /render.png?layout=&palette=&rotate=&scale=` — PNG de la dalle (auth ;
  boucle locale exemptée). L'aperçu web force `rotate=0`.
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
node scripts/gen-assets.mjs   # régénère les visuels docs/ (build serveur requis)
```

## Conventions & pièges

- **`npm ci`, pas `npm install`** : évite la réécriture du lockfile (deps natives
  ARM) qui bloquait `git pull` sur le Pi.
- **Systemd** : services en `Restart=always` + `KillMode=process` pour que
  `self-update.sh` survive au redémarrage qu'il déclenche (mise à jour sans sudo).
- **e-paper** : la boucle ne pousse sur la dalle **que si l'image a changé**
  (md5) ; refresh **partiel** au changement, **complet** périodique
  (anti-ghosting), façon [Bjorn](https://github.com/infinition/Bjorn).
- **Rendu déterministe** : pour tester un rendu, appeler `rasterizeSvg` /
  `buildCompact` depuis `server/dist/render.js` (cf. `gen-assets.mjs`).
- **Config** persistée dans `CONFIG_DIR` (défaut `~/.claude-epaper/`) :
  `config.json`, `credentials.json` (copie gérée), `auth.json`.
- **Auth** : passkey unique ; supprimer `auth.json` réinitialise. WebAuthn exige
  HTTPS ou `localhost`.

## Structure

```
server/src/  index · poller · render · mascot · auth · credentials · usage · config · routes/api
server/fonts/  DejaVu Sans Mono (embarquée pour resvg)
web/src/     App · api · lib/usage · pages/* · components/*
scripts/     epaper_push.py · self-update.sh · gen-assets.mjs · *.service
Makefile · CLAUDE.md · README.md · ROADMAP.md
```
