#!/usr/bin/env bash
# Build les deux images pour l'architecture du Pi et les pousse sur GHCR.
#
# Prérequis (une fois) :
#   echo "$GHCR_TOKEN" | docker login ghcr.io -u <ton-user-github> --password-stdin
#   ($GHCR_TOKEN = Personal Access Token avec le scope write:packages)
#
# Usage :
#   ./scripts/build-and-push.sh                 # arm64, tag latest
#   TAG=v1 PLATFORMS=linux/arm64,linux/amd64 ./scripts/build-and-push.sh
#
# Le Pi Zero 2 W = linux/arm64 (OS 64 bits) ou linux/arm/v7 (OS 32 bits).
set -euo pipefail
cd "$(dirname "$0")/.."

OWNER="${GHCR_OWNER:-vincweb}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/arm64}"
REGISTRY="ghcr.io/${OWNER}"

echo "==> Build ${PLATFORMS} -> ${REGISTRY}/{claude-epaper,claude-epaper-push}:${TAG}"

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
