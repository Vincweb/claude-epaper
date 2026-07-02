#!/bin/sh
# Lance l'app Node (process principal) + la boucle push e-paper (Python, en fond).
set -e

# Boucle e-paper : activée par défaut. Mets EPAPER_PUSH=0 pour la désactiver
# (ex. machine sans dalle : NAS, dev).
if [ "${EPAPER_PUSH:-1}" = "1" ]; then
  echo "[entrypoint] boucle e-paper activée"
  # En fond ; si le matériel manque, le script s'arrête sans tuer le conteneur.
  python3 /app/epaper_push.py &
else
  echo "[entrypoint] boucle e-paper désactivée (EPAPER_PUSH=0)"
fi

# Serveur Node = process principal → pilote le cycle de vie du conteneur.
exec node server/dist/index.js
