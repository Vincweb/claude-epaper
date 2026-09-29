// Génère les visuels du README (docs/*.png) : panneaux e-paper + planche des poses.
// Tout vient du vrai moteur (build serveur requis avant) : panneaux = ce que la
// dalle reçoit, planche = le Clawd couleur du dashboard (même `clawdSvg`).
//   npm run build -w server && node scripts/gen-assets.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildHorizontal, buildVertical, rasterizeSvg } from '../server/dist/render.js';
import { CLAWD_VIEWBOX, clawdSvg } from '../server/dist/clawd.js';
import { idleFrame } from '../server/dist/idle.js';

/* ------------------------------ panneau e-paper ------------------------------ */
// Les panneaux viennent du vrai moteur de rendu (server/dist/render.js) : les
// visuels du README sont exactement ce que la dalle reçoit.

function demoData(extra = {}) {
  return {
    online: true,
    hasData: true,
    pose: { key: 'working', title: 'Au travail', eyes: 'square', accessory: 'skateboard' },
    five: 47, fiveReset: '2H45',
    seven: 63, sevenReset: '4J 2H',
    level: 3, age: '18 j', repu: 92, joie: 80,
    tick: 0, // frame figée (point online plein) pour un visuel stable
    ...extra,
  };
}

/* ------------------------------ planche des poses ------------------------------ */

const POSES = [
  { title: 'Tranquille', eyes: 'square' },
  { title: 'Au travail', eyes: 'square', accessory: 'laptop' },
  { title: 'Pause café', eyes: 'square', accessory: 'coffee' },
  { title: 'Content', eyes: 'happy' },
  { title: 'Magie', eyes: 'square', accessory: 'wand' },
  { title: 'Bisou', eyes: 'wink', mouth: 'kiss', accessory: 'heart' },
  { title: 'Au soleil', eyes: 'shades', overhead: 'sun' },
  { title: 'Sous la pluie', eyes: 'square', overhead: 'umbrella' },
  { title: 'Dodo', eyes: 'sleep', overhead: 'zzz', motion: 'sleep' },
  { title: 'Anniversaire', eyes: 'happy', overhead: 'sparkle-hat', motion: 'bounce' },
  { title: 'Victoire', eyes: 'happy', accessory: 'flag', motion: 'bounce' },
  { title: 'Réfléchit', eyes: 'square', overhead: 'bubble' },
];

function posesSheet() {
  const cols = 4, cell = 210, cardH = 230, top = 20;
  const rows = Math.ceil(POSES.length / cols);
  const W = cols * cell, H = top + rows * cardH;
  let cells = '';
  POSES.forEach((p, i) => {
    const cx = (i % cols) * cell;
    const cy = top + Math.floor(i / cols) * cardH;
    // Instant figé (t = 0,5 s) : yeux ouverts, accessoires en cours d'animation.
    const f = idleFrame(p.motion ?? 'idle', 0.5, 1 / 60);
    cells += `<g transform="translate(${cx} ${cy})">
      <rect x="8" y="8" width="${cell - 16}" height="${cardH - 16}" rx="18" fill="#ffffff08" stroke="#ffffff14"/>
      <svg x="${(cell - 160) / 2}" y="16" width="160" height="160" viewBox="${CLAWD_VIEWBOX}" shape-rendering="crispEdges">${clawdSvg(p, false, f)}</svg>
      <text x="${cell / 2}" y="196" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="#f5f0e8">${p.title}</text>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d0b09"/>${cells}</svg>`;
}

/* --------------------------------- rendu --------------------------------- */

mkdirSync('docs', { recursive: true });

// Aperçus e-paper 2,13" N&B (rendus en x3 pour la netteté du README).
writeFileSync('docs/epaper-horizontal.png', rasterizeSvg(buildHorizontal(demoData(), 0), 750));
writeFileSync(
  'docs/epaper-vertical.png',
  rasterizeSvg(
    buildVertical(
      demoData({
        pose: { key: 'sleep', title: 'Dodo', eyes: 'sleep', overhead: 'zzz' },
        five: 8, fiveReset: '3H10', seven: 22, sevenReset: '5J 6H', repu: 40, joie: 66,
      }),
      0,
    ),
    366,
  ),
);
writeFileSync('docs/mascot-poses.png', rasterizeSvg(posesSheet(), 900));

console.log('OK — docs/epaper-{horizontal,vertical}.png, docs/mascot-poses.png');
