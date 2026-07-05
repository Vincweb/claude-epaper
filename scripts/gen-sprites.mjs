// Bootstrap des sprites de poses : rasterise le rendu vectoriel de chaque pose
// en fichiers éditables, qui deviennent la SOURCE de vérité du dessin.
//   server/sprites/epaper/<key>.png  118×118, noir & blanc (affiché 1:1 sur la dalle)
//   server/sprites/web/<key>.png     236×236, couleur (dashboard web)
//   sleep.gif                        démo de pose ANIMÉE (1 img/s + pause 10 s)
// Édite ensuite ces fichiers à la main (Aseprite/Piskel) ou remplace-les depuis
// la galerie Humeurs. Relancer ce script écrase les défauts embarqués.
//   node scripts/gen-sprites.mjs   (build serveur requis avant)
import { Resvg } from '@resvg/resvg-js';
import { GifWriter } from 'omggif';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clawdStandaloneSvg } from '../server/dist/render.js';
import { ALL_POSES } from '../server/dist/mascot.js';

const SPRITES = fileURLToPath(new URL('../server/sprites/', import.meta.url));
const FONT_DIR = fileURLToPath(new URL('../server/fonts/', import.meta.url));
const font = {
  loadSystemFonts: false,
  fontFiles: [`${FONT_DIR}DejaVuSansMono.ttf`, `${FONT_DIR}DejaVuSansMono-Bold.ttf`],
  defaultFontFamily: 'DejaVu Sans Mono',
  monospaceFamily: 'DejaVu Sans Mono',
};

// Résolution native par variante : e-paper = taille d'affichage exacte (1:1).
const VARIANTS = { epaper: { size: 118, mono: true }, web: { size: 236, mono: false } };

function rasterize(pose, { size, mono }) {
  const svg = clawdStandaloneSvg(pose, mono);
  // pas de background → fond transparent
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size }, font }).render().asPng());
}

/** Encode des frames PNG (RGBA) en GIF : palette exacte, index 0 transparent. */
function toGif(pngBufs, delaysCs) {
  const { width, height } = PNG.sync.read(pngBufs[0]);
  const colors = [0xff00ff]; // index 0 : transparent (couleur sentinelle)
  const colorIndex = new Map();
  const frames = pngBufs.map((buf) => {
    const png = PNG.sync.read(buf);
    const idx = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      if (png.data[i * 4 + 3] < 128) continue; // transparent → index 0
      const rgb = (png.data[i * 4] << 16) | (png.data[i * 4 + 1] << 8) | png.data[i * 4 + 2];
      let ci = colorIndex.get(rgb);
      if (ci === undefined) {
        ci = colors.length;
        colors.push(rgb);
        colorIndex.set(rgb, ci);
      }
      idx[i] = ci;
    }
    return idx;
  });
  let n = 2;
  while (n < colors.length) n *= 2; // taille de palette GIF : puissance de 2
  while (colors.length < n) colors.push(0);
  const out = Buffer.alloc(width * height * pngBufs.length + 8192);
  const gw = new GifWriter(out, width, height, { loop: 0 });
  frames.forEach((px, i) =>
    gw.addFrame(0, 0, width, height, px, { palette: colors, transparent: 0, delay: delaysCs[i], disposal: 2 }),
  );
  return out.subarray(0, gw.end());
}

for (const [variant, opts] of Object.entries(VARIANTS)) {
  mkdirSync(`${SPRITES}${variant}`, { recursive: true });
  for (const pose of ALL_POSES) {
    writeFileSync(`${SPRITES}${variant}/${pose.key}.png`, rasterize(pose, opts));
  }
  // Démo animée : Dodo — les Z apparaissent/disparaissent, puis pause 10 s.
  const sleep = ALL_POSES.find((p) => p.key === 'sleep');
  const noZ = { ...sleep, overhead: 'none' };
  const frames = [sleep, noZ, sleep].map((p) => rasterize(p, opts));
  writeFileSync(`${SPRITES}${variant}/sleep.gif`, toGif(frames, [100, 100, 1000]));
}
console.log(`OK — ${ALL_POSES.length} poses × 2 variantes + sleep.gif → server/sprites/{epaper,web}/`);
