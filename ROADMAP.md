# 🗺️ Roadmap

État d'avancement et pistes d'amélioration pour **Claude e-paper**.

## ✅ Fait

- Récupération des limites (endpoint OAuth `/usage`) + refresh automatique du token.
- Lecture des credentials depuis `~/.claude/.credentials.json` **et** le trousseau macOS.
- Dashboard web (React + Tailwind) : jauges 5 h / 7 j, compte à rebours de reset, SSE temps réel, PWA.
- **Auth passkey** (WebAuthn) + code de récupération (QR).
- Mascotte **Clawd** : rotation dans la journée, café le matin, dodo (nuit / inactivité), anniversaire, bisou, soleil, pluie, magie, foot…
- **Humeurs de stress** selon la jauge la plus contrainte (seuils config) : sous pression → stressé → cramé.
- **Poses = fichiers** (source de vérité) : `server/sprites/{epaper,web}/<key>.png|.gif`, overrides utilisateur dans `CONFIG_DIR`. **PNG** (fixe) ou **GIF** (animé, 1 img/s + pause 10 s sur la dalle).
- **Galerie Humeurs** : deux volets e-paper (N&B) / web (couleur) ; par pose → remplacer (upload), télécharger, réinitialiser, **renommer**, **ajouter** (rotation) et **retirer/supprimer** (rotation seulement).
- **Rendu e-paper** : dalle 2,13" unique, orientations **horizontale** (250×122) et **verticale** (122×250), carré mascotte 118×118 affiché 1:1, **police pixel Tiny5** (net à petite taille), point online **clignotant** (1 s).
- **Boucle Python** `epaper_push.py` : cadence 1 s alignée sur l'horloge (animations fluides), refresh partiel type Bjorn + complet périodique (anti-ghosting).
- **Installation native packagée** : `Makefile` (install/run/update/services) + unités `systemd` + auto-update depuis le dashboard.
- **Clé d'API + app iOS** : `GET|POST|DELETE /api/auth/token` (clé Bearer générée dans Config, QR d'appairage) ; `requireAuth` accepte `Authorization: Bearer`. App iPhone + **widget** natif (`MacOS/ClawdWidget`) qui affiche l'état (mascotte, jauges, stats, niveau) via `/api/usage`.

## 🎯 Priorités

- [ ] **Robustesse du token OAuth** — la rotation du refresh token (quand Claude Code tourne en parallèle) invalide la copie stockée ; lire le token « vivant » à la demande plutôt que garder une copie, et gérer proprement l'expiration/ré-import.
- [ ] **Auto-update & systemd** — l'auto-update ne réinstalle pas les unités systemd (sudo) ; trouver un moyen d'appliquer les changements de `.service` sans `make services` manuel (ex. `systemd --user`, ou un watcher).

## 🔌 Multi-appareils : plugin Claude Code → events temps réel

**Idée** — un plugin Claude Code installé sur mes autres machines : via des **hooks**,
chaque session Claude Code notifie le serveur claude-epaper d'events (activité,
début/fin de tâche, usage) → Clawd réagit en direct (pose « au travail » dès qu'une
session tourne quelque part, réveil, XP/stats).

**Faisable ? Oui.** Points techniques à retenir pour quand on s'y mettra :

- **Hooks** : Claude Code expose `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `Stop`, `Notification`, `SessionEnd`… configurables dans
  `settings.json` ; chacun lance une commande. Un **plugin** peut packager ces hooks
  + un petit script d'envoi, installable en un geste sur chaque appareil.
- **Transport** : les hooks sont des commandes **ponctuelles** (one-shot) — elles ne
  tiennent pas de connexion ouverte. → un **POST HTTP** vers un endpoint d'ingestion
  (`POST /api/events`) est le plus simple et robuste. Un vrai **WebSocket persistant**
  n'a de sens que pour un *agent résident* séparé (pas un hook) ; côté serveur→écran,
  le temps réel existe déjà (SSE). Donc : **hooks → POST HTTP** ; option WS plus tard
  pour un daemon dédié.
- **Auth** : les appareils ne sont pas en boucle locale → **token API** (clé secrète
  générée dans Config), pas WebAuthn (navigateur/humain). À inclure dans le plugin.
  → **déjà en place** : `/api/auth/token` + `Authorization: Bearer` (voir « Fait »),
  réutilisable tel quel par le plugin.
- **Serveur** : endpoint d'ingestion → alimente le poller (marquer `lastActivityAt`,
  forcer temporairement une pose, incrémenter l'XP…), sans casser la source de vérité
  unique.
- **À creuser** : quels events (confidentialité — n'envoyer que des **signaux**, jamais
  le contenu des prompts), throttling, mapping event → pose, découverte du serveur
  (IP fixe / mDNS), file d'attente si le serveur est hors-ligne.

## 💡 Idées / envies

- [ ] **Météo** — poses « soleil » / « pluie » selon le temps réel (ville en config).
- [ ] Quotas par modèle (Opus / Sonnet) et champ `severity` exposés par l'API.
- [ ] Historique de conso (petit graphe sur le dashboard).
- [ ] Éditeur de scènes / règles (quelle pose selon quel contexte).
- [ ] Sons / notifications quand une fenêtre se réinitialise.
- [ ] Thèmes de dashboard (clair / sombre / e-ink).
- [ ] Bouton physique (GPIO) pour changer d'écran / de vue sur le Pi.
- [ ] Multi-comptes (basculer entre plusieurs credentials).
- [ ] Éditeur pixel art intégré (dessiner une pose directement dans la galerie).
