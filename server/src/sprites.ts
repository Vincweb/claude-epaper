import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GifReader, GifWriter } from 'omggif';
import { PNG } from 'pngjs';
import { clawdStandaloneSvg, hasAnimatedExtras } from './clawd.js';
import { getConfigDir } from './config.js';
import { idleFrame, motionLoop } from './idle.js';
import type { Look, Pose } from './mascot.js';
import { hasLookOverride } from './poses.js';
import { rasterizeRgba, rasterizeSvg } from './raster.js';

/* ------------------------------------------------------------------------- *
 * Sprites de poses. Pour chaque variante, par ordre de priorité :
 *   1. CONFIG_DIR/sprites/<variant>/<key>.png|.gif  → fichier uploadé (galerie)
 *   2. look enregistré par l'utilisateur            → sprite GÉNÉRÉ (éditeur)
 *   3. server/sprites/<variant>/<key>.png|.gif      → défaut embarqué (repo)
 *   4. look de la pose                              → sprite GÉNÉRÉ
 * e-paper : GIF 118×118 N&B à 1 img/s, lu EN CONTINU par la dalle (délais
 * respectés, arrondis à la seconde). web : PNG 480×480 couleur, fixe — le
 * dashboard, lui, dessine Clawd en vectoriel live à 60 img/s (même code,
 * `clawd.ts`) ; ce PNG sert au téléchargement et au widget iOS.
 * ------------------------------------------------------------------------- */

export type SpriteVariant = 'epaper' | 'web';
type AssetType = 'image/png' | 'image/gif';
export type SpriteSource = 'upload' | 'generated' | 'default';

const EMBED_SPRITES = fileURLToPath(new URL('../sprites/', import.meta.url));
export const SPRITE_SIZE: Record<SpriteVariant, number> = { epaper: 118, web: 480 };
/** Extras animés (Zzz, vapeur…) : boucles de 1, 2 ou 4 s. */
const EXTRAS_LOOP = 4;

interface SpriteAsset {
  /** Data-URIs PNG : une entrée par frame (une seule pour un PNG statique). */
  frames: string[];
  /** Durée de chaque frame sur la dalle, en secondes entières (≥ 1). */
  delays: number[];
}

/* ------------------------------ génération ------------------------------- */

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Longueur de boucle d'un look (s) : mouvement du corps × extras animés. */
export function lookLoop(look: Look): number {
  const body = motionLoop(look.motion);
  const extras = hasAnimatedExtras(look) ? EXTRAS_LOOP : 1;
  return (body * extras) / gcd(body, extras);
}

interface RgbaFrame {
  data: Buffer;
  delayCs: number;
}

/** Rastérise la boucle e-paper complète, une image par seconde ; les images
 * identiques consécutives sont fusionnées (délais additionnés) → GIF léger, et
 * la dalle ne se rafraîchit que quand quelque chose bouge vraiment. */
function renderLoop(look: Look, size: number): { frames: RgbaFrame[]; width: number; height: number } {
  const count = lookLoop(look);
  const cs = 100;
  const frames: RgbaFrame[] = [];
  let width = size;
  let height = size;
  for (let i = 0; i < count; i++) {
    const img = rasterizeRgba(clawdStandaloneSvg(look, true, idleFrame(look.motion, i, 1)), size);
    ({ width, height } = img);
    const prev = frames[frames.length - 1];
    if (prev?.data.equals(img.data)) prev.delayCs += cs;
    else frames.push({ data: img.data, delayCs: cs });
  }
  return { frames, width, height };
}

/** Encode des frames RGBA en GIF : palette exacte (rendu sans anti-aliasing,
 * peu de couleurs), index 0 transparent, boucle infinie. */
function encodeGif(frames: RgbaFrame[], width: number, height: number): Buffer {
  const colors = [0xff00ff]; // index 0 : transparent (couleur sentinelle)
  const colorIndex = new Map<number, number>();
  const nearest = (rgb: number) => {
    // Garde-fou > 256 couleurs : couleur la plus proche déjà en palette.
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < colors.length; i++) {
      const c = colors[i];
      const d = ((c >> 16) - (rgb >> 16)) ** 2 + (((c >> 8) & 255) - ((rgb >> 8) & 255)) ** 2 + ((c & 255) - (rgb & 255)) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    return best;
  };
  const indexed = frames.map(({ data }) => {
    const idx = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] < 128) continue; // transparent → index 0
      const rgb = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
      let ci = colorIndex.get(rgb);
      if (ci === undefined) {
        ci = colors.length < 256 ? colors.push(rgb) - 1 : nearest(rgb);
        colorIndex.set(rgb, ci);
      }
      idx[i] = ci;
    }
    return idx;
  });
  let n = 2;
  while (n < colors.length) n *= 2; // taille de palette GIF : puissance de 2
  const palette = [...colors, ...Array(n - colors.length).fill(0)];
  const out = Buffer.alloc(width * height * frames.length * 2 + 8192);
  const gw = new GifWriter(out, width, height, { loop: 0 });
  indexed.forEach((px, i) =>
    // Les types d'omggif annoncent number[], mais il indexe un Uint8Array sans souci (et sans copie).
    gw.addFrame(0, 0, width, height, px as unknown as number[], {
      palette,
      transparent: 0,
      delay: frames[i].delayCs,
      disposal: 2,
    }),
  );
  return Buffer.from(out.subarray(0, gw.end()));
}

function encodePng({ data }: RgbaFrame, width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png);
}

// Cache par look : un sprite généré ne change que si son look change.
const generatedCache = new Map<string, { buf: Buffer; type: AssetType }>();

/** Génère le sprite d'un look. e-paper : GIF animé en boucle continue (PNG s'il
 * ne bouge pas). web : PNG couleur fixe (pose de repos), anti-aliasé. */
export function generateSprite(look: Look, variant: SpriteVariant, size = SPRITE_SIZE[variant]): { buf: Buffer; type: AssetType } {
  const cacheKey = `${variant}/${size}/${JSON.stringify(look)}`;
  const hit = generatedCache.get(cacheKey);
  if (hit) return hit;
  let asset: { buf: Buffer; type: AssetType };
  if (variant === 'web') {
    asset = { buf: rasterizeSvg(clawdStandaloneSvg(look, false), size, true), type: 'image/png' };
  } else {
    const { frames, width, height } = renderLoop(look, size);
    asset =
      frames.length > 1
        ? { buf: encodeGif(frames, width, height), type: 'image/gif' }
        : { buf: encodePng(frames[0], width, height), type: 'image/png' };
  }
  if (generatedCache.size > 64) generatedCache.clear();
  generatedCache.set(cacheKey, asset);
  return asset;
}

/* -------------------------------- fichiers -------------------------------- */

function userSpriteDir(variant: SpriteVariant): string {
  return path.join(getConfigDir(), 'sprites', variant);
}

function findFile(dir: string, key: string): string | null {
  for (const ext of ['.gif', '.png']) {
    const file = path.join(dir, key + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

type Resolved = { source: SpriteSource; file: string | null };

/** Source active d'une pose pour une variante (cf. priorités en tête de fichier). */
function resolve(variant: SpriteVariant, key: string): Resolved {
  const upload = findFile(userSpriteDir(variant), key);
  if (upload) return { source: 'upload', file: upload };
  if (!hasLookOverride(key)) {
    const embedded = findFile(path.join(EMBED_SPRITES, variant), key);
    if (embedded) return { source: 'default', file: embedded };
  }
  return { source: 'generated', file: null };
}

/** Fichier brut d'une pose (galerie, écran web, dalle). */
export function readPoseAsset(variant: SpriteVariant, pose: Pose): { buf: Buffer; type: AssetType } {
  const { file } = resolve(variant, pose.key);
  if (file) return { buf: fs.readFileSync(file), type: file.endsWith('.gif') ? 'image/gif' : 'image/png' };
  return generateSprite(pose, variant);
}

/** Métadonnées d'une pose pour la galerie web. */
export function poseAssetInfo(
  variant: SpriteVariant,
  pose: Pose,
): { animated: boolean; custom: boolean; source: SpriteSource } {
  const { source, file } = resolve(variant, pose.key);
  // Web généré = PNG fixe (l'animation vit dans le rendu vectoriel live du dashboard).
  const animated = file ? file.endsWith('.gif') : variant === 'epaper' && lookLoop(pose) > 1;
  return { animated, custom: source === 'upload', source };
}

/** Décode un GIF en frames PNG (data-URIs) + délais. Gère les deux modes de
 * disposal courants : superposition (do-not-dispose) et retour au fond (2). */
function decodeGif(buf: Buffer): SpriteAsset {
  const gif = new GifReader(buf);
  const rgba = Buffer.alloc(gif.width * gif.height * 4);
  const frames: string[] = [];
  const delays: number[] = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    if (i > 0 && gif.frameInfo(i - 1).disposal === 2) rgba.fill(0);
    gif.decodeAndBlitFrameRGBA(i, rgba);
    const png = new PNG({ width: gif.width, height: gif.height });
    rgba.copy(png.data);
    frames.push(`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`);
    // Délai GIF en centièmes → secondes entières pour la dalle (1 img/s mini).
    delays.push(Math.max(1, Math.round(gif.frameInfo(i).delay / 100)));
  }
  return { frames, delays };
}

function toAsset({ buf, type }: { buf: Buffer; type: AssetType }): SpriteAsset {
  if (type === 'image/gif') return decodeGif(buf);
  return { frames: [`data:image/png;base64,${buf.toString('base64')}`], delays: [1] };
}

const spriteCache = new Map<string, SpriteAsset | null>();

/** Sprite prêt à incruster dans le panneau e-paper (frames décodées, en cache). */
export function loadSprite(variant: SpriteVariant, pose: Pose): SpriteAsset | null {
  const cacheKey = `${variant}/${pose.key}/${JSON.stringify(pose)}`;
  const hit = spriteCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let asset: SpriteAsset | null;
  try {
    asset = toAsset(readPoseAsset(variant, pose));
  } catch {
    asset = null;
  }
  if (spriteCache.size > 64) spriteCache.clear();
  spriteCache.set(cacheKey, asset);
  return asset;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
}

/** Frame courante : pure fonction du temps (tick = seconde epoch), boucle
 * continue qui respecte les délais — aucune pause imposée entre deux boucles. */
export function spriteFrame(asset: SpriteAsset, tick: number): string {
  if (asset.frames.length <= 1) return asset.frames[0];
  const cycle = asset.delays.reduce((a, b) => a + b, 0);
  let t = tick % cycle;
  for (let i = 0; i < asset.frames.length; i++) {
    if (t < asset.delays[i]) return asset.frames[i];
    t -= asset.delays[i];
  }
  return asset.frames[0];
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const GIF_MAGIC = Buffer.from('GIF8');

/** Enregistre un override utilisateur (PNG ou GIF, détecté par magic bytes). */
export function savePoseAsset(variant: SpriteVariant, key: string, buf: Buffer): { animated: boolean } {
  const isPng = buf.subarray(0, 4).equals(PNG_MAGIC);
  const isGif = buf.subarray(0, 4).equals(GIF_MAGIC);
  if (!isPng && !isGif) throw new Error('format non supporté (PNG ou GIF attendu)');
  if (isGif) decodeGif(buf); // valide le GIF avant d'accepter
  const dir = userSpriteDir(variant);
  fs.mkdirSync(dir, { recursive: true });
  // Une pose = un seul fichier : on remplace l'autre extension si présente.
  fs.rmSync(path.join(dir, `${key}.png`), { force: true });
  fs.rmSync(path.join(dir, `${key}.gif`), { force: true });
  fs.writeFileSync(path.join(dir, key + (isGif ? '.gif' : '.png')), buf);
  clearSpriteCache();
  return { animated: isGif };
}

/** Supprime l'override utilisateur (retour au look généré ou au défaut embarqué). */
export function deletePoseAsset(variant: SpriteVariant, key: string): void {
  const dir = userSpriteDir(variant);
  fs.rmSync(path.join(dir, `${key}.png`), { force: true });
  fs.rmSync(path.join(dir, `${key}.gif`), { force: true });
  clearSpriteCache();
}
