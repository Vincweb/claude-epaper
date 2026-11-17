#!/bin/sh
# Mise à jour déclenchée depuis le dashboard (bouton Config → Système).
# Tourne détaché du serveur ; à la fin, tue les process principaux → systemd
# (Restart=always, KillMode=process) les relance avec le nouveau build.
# Aucun sudo requis. Sortie dans CONFIG_DIR/update.log.
#
# Garde-fous :
#  - verrou : un double clic ne lance pas deux mises à jour en parallèle ;
#  - retour arrière : si les dépendances ou le build échouent, on revient au
#    commit d'avant et on reconstruit l'ancienne version (le service en cours
#    n'est pas redémarré : l'app reste utilisable).
cd "$(dirname "$0")/.." || exit 1
CONF="${CONFIG_DIR:-$HOME/.claude-epaper}"
mkdir -p "$CONF"
LOG="$CONF/update.log"
LOCK="$CONF/update.lock"

# Verrou portable (mkdir est atomique). Un verrou de plus de 30 min est périmé
# (mise à jour interrompue par une coupure de courant) : on le reprend.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rm -rf "$LOCK" && mkdir "$LOCK" || exit 1
  else
    echo "=== $(date) : mise à jour déjà en cours, ignorée ===" >>"$LOG"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK"' EXIT INT TERM

build() {
  # --include=dev : le build a besoin des devDeps (tsc, vite, tailwind) ; sous
  # NODE_ENV=production (service systemd) npm les omettrait → build en échec.
  (npm ci --include=dev || npm install --include=dev) && npm run build
}

{
  echo "=== update $(date) ==="
  OLD=$(git rev-parse HEAD)
  git checkout -- package-lock.json 2>/dev/null || true
  git pull --ff-only || { echo "✗ git pull (rien n'a changé)"; exit 1; }
  NEW=$(git rev-parse HEAD)
  echo "$OLD → $NEW"

  if ! build; then
    echo "✗ build en échec — retour à $OLD"
    git reset --keep "$OLD"
    if build; then
      echo "=== ancienne version reconstruite, service inchangé ==="
    else
      echo "✗✗ reconstruction de l'ancienne version en échec : intervention manuelle (make update)"
    fi
    exit 1
  fi

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
