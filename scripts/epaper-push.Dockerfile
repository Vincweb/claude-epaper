# Image de la boucle push e-paper (Python) — à builder pour l'arch du Pi.
# Contexte de build = racine du repo :
#   docker buildx build -f scripts/epaper-push.Dockerfile .

# --- Récupère la lib Waveshare officielle (module waveshare_epd) ---
FROM python:3.12-slim-bookworm AS lib
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/waveshareteam/e-Paper.git /tmp/epaper

# --- Image finale ---
FROM python:3.12-slim-bookworm
WORKDIR /app

# Dépendances système pour Pillow + build des libs GPIO.
RUN apt-get update && apt-get install -y --no-install-recommends \
  libjpeg62-turbo zlib1g gcc python3-dev \
  && rm -rf /var/lib/apt/lists/*

# Dépendances Python. gpiozero + lgpio = backend recommandé sur Raspberry Pi OS
# Bookworm. Si ta version de la lib Waveshare exige RPi.GPIO, ajoute-le ici.
RUN pip install --no-cache-dir requests pillow spidev gpiozero lgpio rpi-lgpio

# Module waveshare_epd depuis la lib officielle.
COPY --from=lib /tmp/epaper/RaspberryPi_JetsonNano/python/lib/waveshare_epd /app/waveshare_epd
COPY scripts/epaper_push.py /app/epaper_push.py

ENV PYTHONPATH=/app
# Dans le réseau compose, l'app est joignable par son nom de service.
ENV RENDER_URL=http://claude-epaper:8787/api/render.png
ENV EPD_MODEL=epd2in13_V4
ENV POLL_SECONDS=30
ENV FULL_REFRESH_EVERY=30
ENV FULL_REFRESH_SECONDS=3600

CMD ["python3", "epaper_push.py"]
