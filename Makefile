# Claude e-paper — installation & exploitation en natif (Pi ou Mac).
#   make install    installe ce qui manque (idempotent)
#   make run        lance l'app (+ boucle e-paper si dalle branchée)
#   make update     git pull + réinstalle/rebuild ce qui a changé
#   make services   unités systemd adaptées au user/chemins courants (boot)
#   make dev        hot-reload (développement)
SHELL := /bin/bash
.DEFAULT_GOAL := help

UNAME := $(shell uname -s)
PORT ?= 8787
NODE_MIN := 22
WAVESHARE_DIR ?= $(HOME)/e-Paper
EPD_LIB := $(WAVESHARE_DIR)/RaspberryPi_JetsonNano/python/lib
APT_PKGS := git python3-pil python3-requests python3-spidev python3-gpiozero python3-lgpio python3-rpi-lgpio
SRC := $(shell find server/src web/src server/fonts web/index.html -type f 2>/dev/null)

.PHONY: help install update run dev services check-node system-deps waveshare build

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: check-node system-deps waveshare build ## Installe tout ce qui manque (idempotent)
	@echo "✅ install OK — lance : make run (ou make services pour le boot)"

check-node: ## Node >= 22 (installé via NodeSource sur le Pi)
	@if command -v node >/dev/null 2>&1 && [ "$$(node -p 'parseInt(process.versions.node)')" -ge $(NODE_MIN) ]; then \
		echo "✓ node $$(node -v)"; \
	elif [ "$(UNAME)" = "Linux" ]; then \
		echo "→ installation de Node $(NODE_MIN) (NodeSource)…"; \
		curl -fsSL https://deb.nodesource.com/setup_$(NODE_MIN).x | sudo -E bash - && sudo apt-get install -y nodejs; \
	else \
		echo "✗ Node $(NODE_MIN)+ requis (macOS : brew install node)"; exit 1; \
	fi

system-deps: ## Paquets apt pour l'e-paper (Linux uniquement)
	@if [ "$(UNAME)" != "Linux" ]; then echo "✓ (macOS) deps système e-paper ignorées"; exit 0; fi; \
	missing=""; \
	for p in $(APT_PKGS); do dpkg -s $$p >/dev/null 2>&1 || missing="$$missing $$p"; done; \
	if [ -n "$$missing" ]; then echo "→ apt install$$missing"; sudo apt-get update && sudo apt-get install -y $$missing; \
	else echo "✓ paquets apt OK"; fi

waveshare: ## Lib Waveshare officielle (~/e-Paper, Linux uniquement)
	@if [ "$(UNAME)" != "Linux" ]; then echo "✓ (macOS) lib Waveshare ignorée"; exit 0; fi; \
	if [ -d "$(EPD_LIB)/waveshare_epd" ]; then echo "✓ lib Waveshare présente"; \
	else git clone --depth 1 https://github.com/waveshareteam/e-Paper.git "$(WAVESHARE_DIR)"; fi

# npm ci = installation déterministe depuis le lockfile, SANS jamais le
# réécrire (contrairement à npm install) → pas de churn qui bloque `git pull`
# sur le Pi. Fallback sur npm install si le lockfile est désynchronisé.
# --include=dev : le build a besoin des devDeps (tsc, vite, tailwind) ; sans
# ça, sous NODE_ENV=production (service systemd), npm les omet → `tsc: not found`.
#
# On jalonne l'install sur un MARQUEUR (node_modules/.install-stamp) plutôt que
# sur le dossier node_modules lui-même : un déploiement installé jadis sans
# devDeps a bien un node_modules « récent » (donc considéré à jour par make) mais
# incomplet. Le marqueur, absent dans ce cas, force une réinstallation.
NODE_STAMP := node_modules/.install-stamp
$(NODE_STAMP): package.json package-lock.json server/package.json web/package.json
	npm ci --include=dev || npm install --include=dev
	@touch $(NODE_STAMP)

.make-build.stamp: $(NODE_STAMP) $(SRC)
	npm run build
	@touch $@

build: .make-build.stamp ## Compile serveur + web (seulement si les sources ont changé)

run: build ## Lance l'app :8787 (+ boucle e-paper si /dev/spidev0.0 présent)
	@if [ "$(UNAME)" = "Linux" ] && [ -e /dev/spidev0.0 ]; then \
		echo "→ app + boucle e-paper (Ctrl-C pour tout arrêter)"; \
		trap 'kill 0' INT TERM; \
		PORT=$(PORT) NODE_ENV=production node server/dist/index.js & \
		sleep 3; \
		PYTHONPATH="$(EPD_LIB)" RENDER_URL="http://localhost:$(PORT)/api/render.png?palette=bw" python3 scripts/epaper_push.py & \
		wait; \
	else \
		PORT=$(PORT) NODE_ENV=production node server/dist/index.js; \
	fi

update: ## git pull + réinstalle/rebuild ce qui a changé (+ resync services)
	@# Le lockfile est régénérable (npm) et suivi en amont : on jette toute
	@# modif locale qui bloquerait le fast-forward.
	@git checkout -- package-lock.json 2>/dev/null || true
	git pull --ff-only
	@$(MAKE) install
	@# Si les services sont déjà installés, on re-synchronise les unités
	@# (chemins/env peuvent avoir changé) au lieu d'un simple restart.
	@if [ "$(UNAME)" = "Linux" ] && systemctl is-enabled claude-epaper.service >/dev/null 2>&1; then \
		echo "→ re-synchronisation des services systemd"; $(MAKE) services; \
	fi

services: build ## Installe/actualise + active les unités systemd (user/chemins adaptés)
	@if [ "$(UNAME)" != "Linux" ]; then echo "✗ systemd : sur le Pi uniquement"; exit 1; fi
	@for u in claude-epaper epaper-push; do \
		sed -e 's|^User=.*|User=$(USER)|' \
		    -e 's|/home/pi/claude-epaper|$(CURDIR)|g' \
		    -e 's|/home/pi/e-Paper|$(WAVESHARE_DIR)|g' \
		    scripts/$$u.service | sudo tee /etc/systemd/system/$$u.service >/dev/null; \
		echo "✓ /etc/systemd/system/$$u.service (User=$(USER), $(CURDIR))"; \
	done
	sudo systemctl daemon-reload
	sudo systemctl enable claude-epaper epaper-push
	sudo systemctl restart claude-epaper epaper-push
	@echo "✅ services à jour & actifs — logs : journalctl -u claude-epaper -f · journalctl -u epaper-push -f"

dev: node_modules ## Hot-reload serveur + web (développement, Mac/PC)
	npm run dev
