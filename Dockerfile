# Multi-stage — image finale légère pour Raspberry Pi (ARM64) ou x86.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
# Polices pour le rendu du texte de l'e-paper (resvg).
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=8787
ENV CONFIG_DIR=/data
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server/dist/index.js"]
