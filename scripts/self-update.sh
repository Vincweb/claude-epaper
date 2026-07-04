#!/bin/sh
# Mise à jour déclenchée depuis le dashboard (bouton Config → Système).
# Tourne détaché du serveur ; à la fin, tue les process principaux → systemd
# (Restart=always, KillMode=process) les relance avec le nouveau build.
# Aucun sudo requis. Sortie dans CONFIG_DIR/update.log.
cd "$(dirname "$0")/.." || exit 1
LOG="${CONFIG_DIR:-$HOME/.claude-epaper}/update.log"
{
  echo "=== update $(date) ==="
  git checkout -- package-lock.json 2>/dev/null || true
  git pull --ff-only || { echo "✗ git pull"; exit 1; }
  # --include=dev : le build a besoin des devDeps (tsc, vite, tailwind) ; sous
  # NODE_ENV=production (service systemd) npm les omettrait → build en échec.
  (npm ci --include=dev || npm install --include=dev) || { echo "✗ npm"; exit 1; }
  npm run build || { echo "✗ build"; exit 1; }
  echo "=== build OK — redémarrage ==="
  pkill -f 'epaper_push.py' || true
  # le serveur en dernier : systemd le relance avec le nouveau code
  if [ -n "$NODE_PID" ]; then
    kill "$NODE_PID" 2>/dev/null || true
  else
    pkill -f 'server/dist/index.js' || true
  fi
  echo "=== terminé $(date) ==="
} >>"$LOG" 2>&1
