#!/usr/bin/env bash
# Build les deux images pour l'architecture du Pi et les pousse sur un registry.
#
# Prérequis : être connecté au registry (`docker login` — déjà fait pour Docker Hub).
#
# Usage :
#   ./scripts/build-and-push.sh                 # Docker Hub, arm64, tag latest
#   TAG=v1 PLATFORMS=linux/arm64,linux/amd64 ./scripts/build-and-push.sh
#   IMAGE_PREFIX=ghcr.io/vincweb ./scripts/build-and-push.sh   # vers GHCR à la place
#
# Le Pi Zero 2 W = linux/arm64 (OS 64 bits) ou linux/arm/v7 (OS 32 bits).
set -euo pipefail
cd "$(dirname "$0")/.."

# Préfixe d'image = registry + namespace. Docker Hub par défaut.
IMAGE_PREFIX="${IMAGE_PREFIX:-docker.io/vincweb}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/arm64}"
REGISTRY="$IMAGE_PREFIX"

echo "==> Build ${PLATFORMS} -> ${REGISTRY}/{claude-epaper,claude-epaper-push}:${TAG}"
echo "    (registry courant : ${IMAGE_PREFIX})"

# Builder buildx dédié (multi-arch), créé au besoin.
if ! docker buildx inspect claude-epaper >/dev/null 2>&1; then
  docker buildx create --name claude-epaper --driver docker-container --bootstrap
fi
docker buildx use claude-epaper

# App (serveur TS + web).
docker buildx build --platform "$PLATFORMS" \
  -t "${REGISTRY}/claude-epaper:${TAG}" \
  -f Dockerfile --push .

# Boucle push e-paper (Python).
docker buildx build --platform "$PLATFORMS" \
  -t "${REGISTRY}/claude-epaper-push:${TAG}" \
  -f scripts/epaper-push.Dockerfile --push .

echo "==> OK. Sur le Pi : docker compose pull && docker compose up -d"
