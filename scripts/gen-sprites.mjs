// Sprites e-paper par défaut : génère, pour chaque pose de base, son sprite
// ANIMÉ à partir de son look (couche idle continue, cf. server/src/idle.ts),
// avec le MÊME générateur que la galerie Humeurs :
//   server/sprites/epaper/<key>.gif  118×118, noir & blanc, 1 img/s (dalle 1:1)
// Boucle continue, sans pause. Une pose immobile sort en .png. Ces fichiers
// restent éditables (Aseprite/Piskel) ou remplaçables depuis la galerie.
// Pas de défauts web : le dashboard dessine Clawd en vectoriel live, et le PNG
// web (téléchargement, widget iOS) est généré à la demande en quelques ms.
// Relancer ce script écrase les défauts embarqués.
//   npm run build -w server && node scripts/gen-sprites.mjs
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateSprite } from '../server/dist/sprites.js';
import { ALL_POSES } from '../server/dist/mascot.js';

const SPRITES = fileURLToPath(new URL('../server/sprites/', import.meta.url));

for (const variant of ['epaper']) {
  mkdirSync(`${SPRITES}${variant}`, { recursive: true });
  for (const pose of ALL_POSES) {
    const t0 = Date.now();
    const { buf, type } = generateSprite(pose, variant);
    const ext = type === 'image/gif' ? 'gif' : 'png';
    // Une pose = un seul fichier : l'autre extension (ancien défaut) est retirée.
    rmSync(`${SPRITES}${variant}/${pose.key}.${ext === 'gif' ? 'png' : 'gif'}`, { force: true });
    writeFileSync(`${SPRITES}${variant}/${pose.key}.${ext}`, buf);
    console.log(`${variant}/${pose.key}.${ext}  ${(buf.length / 1024).toFixed(1)} Ko  ${Date.now() - t0} ms`);
  }
}
console.log(`OK — ${ALL_POSES.length} poses → server/sprites/epaper/`);
