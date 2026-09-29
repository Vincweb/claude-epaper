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
  `buildHorizontal` 250×122 (carré mascotte 118×118 à gauche ; à droite en-tête
  niveau/âge, limites 5H/7J, stats ♥ joie / 🍎 repu) / `buildVertical` 122×250
  (en-tête, carré, limites, stats) — et le rastérise, toujours
  en **noir & blanc**, **sans anti-aliasing** (`crispEdges`). Hiérarchie : gros
  pourcentages, reset avec icône horloge ; sans données → « -- » (jamais un faux
  0 %) et en-tête « HORS LIGNE ». Le rendu est **animé à la seconde** (`tick`) :
  point online clignotant (1 s plein / 1 s absent ; offline = anneau statique) et
  mascotte animée **en continu** (GIF lu en boucle, délais arrondis à la seconde).
- **Texte de la dalle — règles de netteté** : Tiny5 est dessinée sur une grille
  de 1/8 d'em → **uniquement 16 px (×2)**, jamais d'autre taille ni de
  `font-weight` (gras synthétique = pixels qui bavent), positions entières
  calculées via `pixelTextWidth` (chasses lues dans le TTF) plutôt que
  `text-anchor`. Les chiffres sont des bitmaps maison (4×5 dans le texte, LCD 5×7
  ×2 pour les pourcentages) : ceux de Tiny5 font 3 px de large. Icônes = pixel art
  (`icon()`), barres = cadre 2 px + 1 px d'air + remplissage.
- **Mascotte animée façon [blobatar](https://github.com/Alain00/blobatar)** :
  une pose = un **look** (`Look` : yeux, bouche, accessoire, objet au-dessus,
  animation `motion`) sur les mêmes pièces, pas un dessin à part.
  **Code de dessin ISOMORPHE**, partagé serveur ↔ web (le web l'importe via
  `web/src/lib/clawd.ts`) — ne jamais y importer de module Node :
  - `look.ts` : types, catalogue `LOOK_PARTS`, `sanitizeLook`, `lookFromName`.
  - `idle.ts` : couche idle, **fonction pure du temps** (`idleFrame(motion, t, dt)` :
    saut, tassement, regard, bras, paupière). Une valeur clé par seconde = ce
    que voit la dalle ; en dessous (dt < 0,5) le web relie ces valeurs par
    Catmull-Rom (corps), saccades rapides (regard), paupière progressive,
    tremblement sinusoïdal. ⚠ Toute courbe doit PASSER par les valeurs aux
    secondes entières (un changement de timeline ne doit pas bouger la dalle).
  - `pixel.ts` : moteur de sprites pixel — rectangles + clés de palette (teinte
    web ET rendu N&B encre/papier/rien), `bitmap()`, contour « sticker »
    géométrique en NIVEAUX (rectangles agrandis tracés dessous, du plus large au
    plus étroit, toutes couches confondues : pas de filtre SVG).
  - `clawd-grid.ts` + `clawd.ts` : **Clawd officiel en pixel art**, grille des
    GIF officiels (corps 8×6 cellules, yeux 1×1 col. 1/6 ligne 1, bras 2×2
    lignes 2-3, 4 pattes 1×2 col. 0/2/5/7 ; 1 cellule = 7 px de dalle, carré
    `0 0 118 118`). Un seul dessin, deux palettes : web orange `#D97757` +
    contour sticker blanc ; dalle = Clawd blanc cerné d'un liseré noir 2 px,
    façon Tamagotchi. Expressions minimalistes (points, traits, arcs).
    `ANCHORS` = points d'accroche.
  - `clawd-props.ts` : accessoires et chapeaux en bitmaps, placés depuis
    `ANCHORS` (trait `k` intégré, animés via `frame.t` / `frame.step`, boucles
    1/2/4 s). Détails fins et flottants (Z, notes, pluie…) : couche `O_THIN`,
    encre pleine sur la dalle (`solid`), sans liseré.
  ⚠ `LOOK_PARTS` : retirer une pièce = lui donner un alias dans `LEGACY`
  (`look.ts`) — les looks enregistrés ne doivent pas retomber sur le défaut.
  Côté serveur : `sprites.ts` = génération + cache (`generateSprite`),
  `raster.ts` = resvg + police.
- **Web = rendu vectoriel LIVE** (`components/ClawdLive.tsx`) : un seul
  `requestAnimationFrame` partagé, `idleFrame(Date.now()/1000)` → en phase avec
  la dalle, `innerHTML` mis à jour seulement si l'image change, regard qui suit
  le pointeur (`gaze`), `prefers-reduced-motion` respecté. Utilisé par l'écran,
  la connexion, la galerie (volet web) et l'aperçu de l'éditeur.
- **Sprites de poses = toujours GÉNÉRÉS depuis le look** (look composé dans
  l'éditeur, sinon celui de la pose) — plus d'import de fichiers ni de défauts
  embarqués. e-paper : GIF 118×118 N&B 1 img/s (1:1/pixelated). web : PNG
  480×480 couleur fixe (téléchargement, widget iOS). Quelques ms, cache par look.
- `mascot.ts` : logique de pose partagée, `selectPose`/`forcedPose`, stats,
  niveau. **Aucune pose de rotation codée** : `SHUFFLE_POOL` est vide, la rotation
  vient des humeurs perso. `SPECIAL_POSES` = poses de base (Tranquille par défaut
  `DEFAULT_POSE`, stress alert/worried/panic, dodo, anniversaire).
- `poses.ts` : personnalisation persistée (`CONFIG_DIR/poses.json`) — renommage
  (`titles`, spéciale ou perso), humeurs de rotation (`custom`, = toute la
  rotation) et looks composés (`looks`) ; `resolvePose`, `customPoses`,
  `rotationPoses`, `findPose`. Une humeur perso sans look prend un look
  **déterministe tiré de son nom** (`lookFromName`, graine `seed` figée à la création).
- `auth.ts` : WebAuthn + code de récup (fichier `CONFIG_DIR/auth.json`),
  middleware `requireAuth` (bypass **boucle locale** pour la boucle e-paper).
- `routes/api.ts` : endpoints (voir ci-dessous).
- Web : `App.tsx` gère l'auth (Setup/Login) puis le `Layout` routé ; pages dans
  `web/src/pages/` (`ScreenPage`, `EpaperPage`, `HumeursPage`, `ConfigPage`).

## Endpoints clés (`/api`)

- `GET /render.png?layout=horizontal|vertical&rotate=&scale=` — PNG N&B de la
  dalle (auth ; boucle locale exemptée). L'aperçu web force `rotate=0` et se
  rafraîchit chaque seconde (animations). Anciennes valeurs de layout acceptées.
- `GET /poses` (liste + look + flags `special`/`userAdded`/`lookCustom`/animé,
  catalogue des pièces) · `GET /poses/:variant/:key` (`variant` = `epaper`|`web`)
  — sprite généré (téléchargement, widget iOS ; route publique).
- `POST /poses` `{title}` (ajoute une humeur de rotation) · `PUT /poses/:key`
  `{title}` (renomme, base ou perso) · `DELETE /poses/:key` (supprime une perso).
  Persistées dans `CONFIG_DIR/poses.json` (`server/src/poses.ts`).
- `GET /poses/preview?variant=&eyes=&mouth=&accessory=&overhead=&motion=&size=`
  (aperçu généré, rien d'enregistré) · `PUT /poses/:key/look` `{look}` (enregistre
  le look) · `DELETE /poses/:key/look`. ⚠ Ces routes sont déclarées **avant**
  `GET /poses/:variant/:key` (même forme d'URL).
- `GET /usage/stream` (SSE), `GET /usage`, `GET /config`, `PUT /config`.
- `POST /pose/shuffle` · `POST /pose/reset` — pose manuelle.
- `POST /auth/register/{options,verify}` · `/auth/login/{options,verify}` ·
  `/auth/recover` · `/auth/logout` · `GET /auth/state` · `POST /auth/import`.
- `GET|POST|DELETE /auth/token` — clé d'API (Bearer) pour l'**app iOS / widget**
  (projet séparé `MacOS/ClawdWidget`). `requireAuth` accepte en plus `Authorization: Bearer <clé>`
  (ou `X-API-Key`). `POST`/`GET` renvoient aussi un deep-link `clawd://setup?base=&key=`
  + son QR (appairage sans recopie). Clé stockée dans `auth.json` (`apiToken`).
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
server/src/  index · poller · render · look · idle · pixel · clawd-grid · clawd · clawd-props · sprites · raster · mascot · poses · auth · credentials · usage · config · routes/api
server/fonts/  Tiny5 (police pixel embarquée pour resvg, OFL)
web/src/     App · api · lib/{usage,clawd} · pages/* · components/* (dont ClawdLive, PoseEditor)
scripts/     epaper_push.py · self-update.sh · gen-assets.mjs · *.service
Makefile · CLAUDE.md · README.md · ROADMAP.md
```
