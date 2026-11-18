// Génère les icônes de l'app (PWA, écran d'accueil iPhone, onglet) à partir du
// VRAI Clawd (même `clawdSvg` que le dashboard) : web/public/*.
//   npm run build -w server && node scripts/gen-icons.mjs
//
// iOS : l'apple-touch-icon doit être CARRÉE, OPAQUE et SANS coins arrondis (iOS
// applique son propre masque ; une icône déjà arrondie sur fond transparent
// donne des coins noirs). 180×180 = taille native des iPhone récents.
import { writeFileSync } from 'node:fs';
import { rasterizeRgba, rasterizeSvg } from '../server/dist/raster.js';
import { CLAWD_VIEWBOX, clawdSvg } from '../server/dist/clawd.js';
import { REST } from '../server/dist/idle.js';

const OUT = 'web/public';
const LOOK = { eyes: 'square', motion: 'idle' };
const BG = '#1a1613';
const GLOW = '#d97757';

/** Boîte englobante de Clawd (contour sticker compris) dans le carré 118×118. */
function clawdBox() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CLAWD_VIEWBOX}" shape-rendering="crispEdges">${clawdSvg(LOOK, false, REST)}</svg>`;
  const { data, width, height } = rasterizeRgba(svg, 118);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
      }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const box = clawdBox();

/**
 * Icône 1024 unités. `fill` = part de la largeur occupée par Clawd ;
 * `radius` = coins arrondis (0 pour iOS / maskable, qui masquent eux-mêmes).
 */
function iconSvg({ fill, radius = 0 }) {
  const S = 1024;
  const w = S * fill;
  const h = (w * box.h) / box.w;
  const x = (S - w) / 2;
  // Légèrement au-dessus du centre optique (les pattes allègent le bas).
  const y = (S - h) / 2 - S * 0.015;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="46%" r="58%">
      <stop offset="0" stop-color="${GLOW}" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="${GLOW}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${radius}" fill="${BG}"/>
  <rect width="${S}" height="${S}" rx="${radius}" fill="url(#glow)"/>
  <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" shape-rendering="crispEdges">${clawdSvg(LOOK, false, REST)}</svg>
</svg>`;
}

// iPhone / Android « any » : Clawd bien présent (≈ 68 % de la largeur).
const full = iconSvg({ fill: 0.68 });
// Maskable (Android) : tout doit tenir dans le cercle de sécurité (80 %).
const maskable = iconSvg({ fill: 0.52 });
// Onglet du navigateur : pas de masque appliqué → coins arrondis, Clawd plus grand.
const favicon = iconSvg({ fill: 0.8, radius: 220 });

writeFileSync(`${OUT}/apple-touch-icon.png`, rasterizeSvg(full, 180));
writeFileSync(`${OUT}/icon-192.png`, rasterizeSvg(full, 192));
writeFileSync(`${OUT}/icon-512.png`, rasterizeSvg(full, 512));
writeFileSync(`${OUT}/icon-maskable-512.png`, rasterizeSvg(maskable, 512));
writeFileSync(`${OUT}/favicon-32.png`, rasterizeSvg(favicon, 32, true));
writeFileSync(`${OUT}/favicon.svg`, favicon);

console.log(`OK — icônes dans ${OUT}/ (Clawd ${box.w}×${box.h} u)`);
