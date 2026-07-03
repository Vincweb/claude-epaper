# 🗺️ Roadmap

État d'avancement et pistes d'amélioration pour **Claude e-paper**.

## ✅ Fait

- Récupération des limites (endpoint OAuth `/usage`) + refresh automatique du token.
- Lecture des credentials depuis `~/.claude/.credentials.json` **et** le trousseau macOS.
- Dashboard web (React + Tailwind) : jauges 5 h / 7 j, compte à rebours de reset, SSE temps réel.
- Mascotte **Clawd** paramétrable : yeux, accessoires, objets ; contour sticker.
- Poses contextuelles : rotation dans la journée, café le matin, dodo (nuit / inactivité), anniversaire (date en config).
- Poses supplémentaires : bisou + cœur, lunettes + soleil, parapluie.
- Deux versions distinctes par pose : **couleur** et **noir & blanc** (line-art).
- Stats **Tamagotchi** (Énergie, Forme, Repu, Bonheur) + **niveau** (temps + usage).
- **Rendu PNG serveur** (resvg, sans anti-aliasing) : palettes N&B et N/B/rouge, `GET /api/render.png`.
- **Layout compact 2.13"** (250×122) + rotation 180° réglable.
- **Auth passkey** (WebAuthn) + code de récupération (QR).
- **Installation native packagée** : `Makefile` (install/run/update/services) + unités `systemd` + boucle Python `epaper_push.py` (refresh partiel type Bjorn, anti-ghosting).
- PWA : manifest + icônes.

## 🎯 Priorités

- [ ] **Robustesse du token OAuth** — la rotation du refresh token (quand Claude Code tourne en parallèle) invalide la copie stockée ; lire le token « vivant » à la demande plutôt que garder une copie, et gérer proprement l'expiration/ré-import.

## 💡 Idées / envies

- [ ] **Météo** — poses « soleil » / « pluie » selon le temps réel (ville en config).
- [ ] **Push serveur** vers l'e-paper (timer de re-rendu) en plus du modèle « pull ».
- [ ] Quotas par modèle (Opus / Sonnet) et champ `severity` exposés par l'API.
- [ ] Historique de conso (petit graphe sur le dashboard).
- [ ] Plus de poses Clawd + éditeur de scènes / règles.
- [ ] Sons / notifications quand une fenêtre se réinitialise.
- [ ] Thèmes de dashboard (clair / sombre / e-ink).
- [ ] Bouton physique (GPIO) pour changer d'écran / de vue sur le Pi.
- [ ] Multi-comptes (basculer entre plusieurs credentials).

## 🐛 Connu

- Le fichier `epaper.png` n'est réécrit que sur changement de conso ; les poses qui dépendent de l'heure se rafraîchissent via le modèle « pull » (`/api/render.png` recalcule à chaque appel).
