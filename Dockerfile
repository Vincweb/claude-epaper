# Image unique : app Node/TS (dashboard + rendu PNG) + boucle push e-paper (Python).
# Un seul conteneur à déployer sur le Raspberry Pi.

# --- Build de l'app Node ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install
COPY . .
RUN npm run build

# --- Récupère la lib Waveshare officielle (module python waveshare_epd) ---
FROM node:22-bookworm-slim AS waveshare
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/waveshareteam/e-Paper.git /tmp/epaper

# --- Image finale ---
FROM node:22-bookworm-slim
WORKDIR /app

# Node : polices pour resvg. Python : runtime + libs SPI/GPIO + deps Pillow.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-dejavu-core \
      python3 python3-pip python3-dev \
      gcc libjpeg62-turbo zlib1g \
  && rm -rf /var/lib/apt/lists/*
# gpiozero + lgpio = backend recommandé sur Raspberry Pi OS Bookworm.
RUN pip3 install --no-cache-dir --break-system-packages \
      requests pillow spidev gpiozero lgpio rpi-lgpio

ENV NODE_ENV=production
ENV PORT=8787
ENV CONFIG_DIR=/data
ENV PYTHONPATH=/app
# Boucle e-paper : activée, lit le PNG en local. EPAPER_PUSH=0 pour la couper.
ENV EPAPER_PUSH=1
ENV RENDER_URL=http://localhost:8787/api/render.png?palette=bw
ENV EPD_MODEL=epd2in13_V4
ENV POLL_SECONDS=30
ENV FULL_REFRESH_EVERY=30
ENV FULL_REFRESH_SECONDS=3600

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=waveshare /tmp/epaper/RaspberryPi_JetsonNano/python/lib/waveshare_epd /app/waveshare_epd
COPY scripts/epaper_push.py /app/epaper_push.py
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8787
VOLUME ["/data"]
CMD ["/app/entrypoint.sh"]
