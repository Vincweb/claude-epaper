import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { GifReader } from 'omggif';
import { PNG } from 'pngjs';
import { poller } from './poller.js';
import { getConfigDir, loadConfig } from './config.js';
import {
  formatReset,
  type ClawdAccessory,
  type ClawdEyes,
  type ClawdMouth,
  type ClawdOverhead,
  type Pose,
} from './mascot.js';

// Police embarquée (server/fonts) → rendu identique partout, sans dépendre des
// polices système. Tiny5 = police PIXEL/bitmap (OFL) : nette à petite taille sur
// l'e-ink, là où une police vectorielle (DejaVu) casse sous ~9 px. Chemin résolu
// depuis dist/ comme depuis src/.
const FONT_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));
const FONT_FAMILY = 'Tiny5';
const FONT_FILES = [`${FONT_DIR}Tiny5-Regular.ttf`];

const INK = '#000000';
const PAPER = '#ffffff';
const RED = '#d81e28';
const PURPLE = '#a273f0';
const SPARKLE = '#9b7cf0';
const STEEL = '#8a857c';

/* ------------------------------------------------------------------------- *
 * Sprite vectoriel Clawd (viewBox 0 0 240 210, mêmes coordonnées que le web).
 * Sert à générer les sprites fichiers (scripts/gen-sprites.mjs) et de secours
 * quand un fichier de pose manque.
 * ------------------------------------------------------------------------- */

function eyesSvg(eyes: ClawdEyes): string {
  switch (eyes) {
    case 'wide':
      return `<rect x="87" y="54" width="18" height="20" fill="${INK}"/><rect x="135" y="54" width="18" height="20" fill="${INK}"/>`;
    case 'sleep':
      return `<rect x="88" y="64" width="16" height="5" fill="${INK}"/><rect x="136" y="64" width="16" height="5" fill="${INK}"/>`;
    case 'happy':
      return `<g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M89 58 L103 66 L89 74"/><path d="M151 58 L137 66 L151 74"/></g>`;
    case 'spiral': {
      const spiral = (cx: number, cy: number) => {
        let d = `M${cx} ${cy}`;
        for (let i = 1; i <= 26; i++) {
          const t = i / 26;
          const a = t * 2.2 * 2 * Math.PI;
          const r = t * 9;
          d += ` L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
        }
        return d;
      };
      return `<g fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"><path d="${spiral(96, 66)}"/><path d="${spiral(144, 66)}"/></g>`;
    }
    case 'wink':
      return `<rect x="89" y="58" width="14" height="16" fill="${INK}"/><path d="M137 62 Q144 71 151 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    case 'cross':
      return `<g stroke="${INK}" stroke-width="6" stroke-linecap="round"><path d="M87 57 l16 16 M103 57 l-16 16"/><path d="M135 57 l16 16 M151 57 l-16 16"/></g>`;
    case 'shades':
      return `<rect x="82" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="134" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="104" y="62" width="30" height="4" fill="${INK}"/>`;
    default: // square
      return `<rect x="89" y="58" width="14" height="16" fill="${INK}"/><rect x="137" y="58" width="14" height="16" fill="${INK}"/>`;
  }
}

function mouthSvg(mouth?: ClawdMouth): string {
  if (mouth === 'line') return `<rect x="104" y="98" width="32" height="4" rx="1" fill="${INK}"/>`;
  if (mouth === 'open') return `<rect x="108" y="92" width="24" height="16" rx="4" fill="${INK}"/>`;
  if (mouth === 'kiss') return `<ellipse cx="114" cy="100" rx="5" ry="4" fill="${INK}"/>`;
  return '';
}

function sparkleSvg(cx: number, cy: number, color: string, len = 12): string {
  let s = '';
  for (let i = 0; i < 8; i++)
    s += `<rect x="${cx - 2}" y="${cy - len}" width="4" height="${len}" rx="2" fill="${color}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
  return `${s}<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`;
}

const HEART_GRID = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
function pixelHeartSvg(x: number, y: number, px: number, fill: string): string {
  let s = '';
  HEART_GRID.forEach((row, r) =>
    row.split('').forEach((c, col) => {
      if (c === 'X') s += `<rect x="${x + col * px}" y="${y + r * px}" width="${px}" height="${px}" fill="${fill}"/>`;
    }),
  );
  return s;
}

/** Accessoires tenus/posés (miroir mono/couleur de la version web). */
function accessorySvg(kind: ClawdAccessory | undefined, mono: boolean): string {
  if (!kind || kind === 'none') return '';
  const surf = (c: string) => (mono ? PAPER : c);
  switch (kind) {
    case 'laptop':
      return `<rect x="78" y="138" width="84" height="10" fill="${surf('#8f8a80')}" stroke="${INK}" stroke-width="2"/><rect x="86" y="104" width="68" height="36" fill="${surf('#c7c2b8')}" stroke="${INK}" stroke-width="2"/><rect x="90" y="108" width="60" height="28" fill="${mono ? PAPER : '#3f3d39'}" stroke="${INK}" stroke-width="1.5"/><rect x="94" y="113" width="26" height="3" fill="${mono ? INK : '#7fb96b'}"/><rect x="94" y="120" width="38" height="3" fill="${mono ? INK : '#cfc9bd'}"/><rect x="94" y="127" width="20" height="3" fill="${mono ? INK : '#cfc9bd'}"/>`;
    case 'coffee':
      return `
        <ellipse cx="190" cy="105" rx="22" ry="4" fill="${surf('#cfc9bd')}" stroke="${INK}" stroke-width="1.5"/>
        <rect x="174" y="80" width="30" height="22" rx="3" fill="${surf('#b7b1a6')}" stroke="${INK}" stroke-width="2"/>
        <line x1="175" y1="87" x2="203" y2="87" stroke="${INK}" stroke-width="1.5"/>
        <path d="M204 84 q10 1 10 7 q0 6 -10 7" fill="none" stroke="${INK}" stroke-width="2"/>
        <g fill="none" stroke="${mono ? INK : '#cfc9bd'}" stroke-width="1.5" stroke-linecap="round">
          <path d="M182 76 q3 -4 0 -8"/><path d="M190 76 q3 -4 0 -8"/><path d="M198 76 q3 -4 0 -8"/>
        </g>`;
    case 'ball':
      return `<circle cx="172" cy="156" r="18" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><polygon points="172,147 180,153 177,163 167,163 164,153" fill="${INK}"/><path d="M158 150 l4 5 M186 150 l-4 5 M166 170 l3 -4 M178 170 l-3 -4" stroke="${INK}" stroke-width="2"/>`;
    case 'wand': {
      // Manche diagonal + étoile 5 branches à la pointe + 2 petites étincelles.
      const star = '223,38 227,50 238,50 229,58 233,70 223,62 213,70 217,58 208,50 219,50';
      return `
        <rect x="194" y="64" width="6" height="40" rx="3" fill="${INK}" transform="rotate(38 197 84)"/>
        <polygon points="${star}" fill="${mono ? PAPER : '#e0b34a'}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="208" cy="40" r="2.5" fill="${mono ? INK : '#e0b34a'}"/>
        <circle cx="236" cy="66" r="2" fill="${mono ? INK : '#e0b34a'}"/>`;
    }
    case 'heart':
      return pixelHeartSvg(200, 62, 5, mono ? INK : '#e0533c');
    case 'skateboard': {
      const deck = mono ? PAPER : '#5a2d2a';
      const wheel = mono ? PAPER : '#e0b34a';
      return `
        <rect x="60" y="156" width="120" height="10" rx="5" fill="${deck}" stroke="${INK}" stroke-width="2"/>
        <rect x="80" y="166" width="6" height="5" fill="${INK}"/><rect x="154" y="166" width="6" height="5" fill="${INK}"/>
        <rect x="70" y="169" width="20" height="16" rx="3" fill="${wheel}" stroke="${INK}" stroke-width="2"/>
        <rect x="150" y="169" width="20" height="16" rx="3" fill="${wheel}" stroke="${INK}" stroke-width="2"/>
        <path d="M72 171 l16 12 M88 171 l-16 12 M152 171 l16 12 M168 171 l-16 12" stroke="${INK}" stroke-width="1.5"/>`;
    }
    default:
      return '';
  }
}

/** Objets au-dessus de la tête — dessinés pour tenir dans la viewBox standard. */
function overheadSvg(kind: ClawdOverhead | undefined, mono: boolean): string {
  if (!kind || kind === 'none') return '';
  const S = mono ? INK : 'none';
  const sw = mono ? 2 : 0;
  const surf = (c: string) => (mono ? PAPER : c);
  if (kind === 'zzz')
    return `<g fill="${INK}" font-family="monospace" font-weight="bold"><text x="158" y="54" font-size="14">z</text><text x="170" y="40" font-size="18">Z</text><text x="186" y="24" font-size="24">Z</text></g>`;
  if (kind === 'sparkle-hat')
    return `<rect x="90" y="34" width="60" height="8" fill="${surf(PURPLE)}" stroke="${S}" stroke-width="${sw}"/><rect x="100" y="20" width="40" height="14" fill="${surf(PURPLE)}" stroke="${S}" stroke-width="${sw}"/><rect x="110" y="10" width="20" height="10" fill="${surf(PURPLE)}" stroke="${S}" stroke-width="${sw}"/>${sparkleSvg(120, 7, mono ? INK : SPARKLE, 6)}`;
  if (kind === 'party')
    return `<polygon points="120,4 102,44 138,44" fill="${surf('#e0b34a')}" stroke="${INK}" stroke-width="2"/><circle cx="120" cy="4" r="5" fill="${mono ? INK : '#e0533c'}"/><circle cx="114" cy="22" r="3" fill="${mono ? INK : '#fff'}"/><circle cx="125" cy="32" r="3" fill="${mono ? INK : '#e0533c'}"/>`;
  if (kind === 'sun') {
    const cx = 200, cy = 26, r = 13;
    let s = '';
    for (let i = 0; i < 8; i++)
      s += `<rect x="${cx - 1.5}" y="${cy - r - 8}" width="3" height="7" rx="1.5" fill="${mono ? INK : '#f2c14e'}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
    return `${s}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${surf('#f2c14e')}" stroke="${S}" stroke-width="${sw}"/>`;
  }
  if (kind === 'umbrella') {
    const cx = 120, base = 42, r = 40;
    return `<path d="M${cx - r} ${base} A${r} ${r} 0 0 1 ${cx + r} ${base} Z" fill="${surf('#4a86c8')}" stroke="${INK}" stroke-width="2"/><path d="M${cx} ${base - r} L${cx - r} ${base} M${cx} ${base - r} L${cx} ${base} M${cx} ${base - r} L${cx + r} ${base}" stroke="${mono ? INK : '#2f6aa0'}" stroke-width="2"/><rect x="${cx - 1.5}" y="${base}" width="3" height="8" fill="${mono ? INK : STEEL}"/><g stroke="${mono ? INK : '#7cc4ff'}" stroke-width="3" stroke-linecap="round"><path d="M64 26 l0 7"/><path d="M176 24 l0 7"/><path d="M74 40 l0 7"/><path d="M170 12 l0 7"/></g>`;
  }
  return '';
}

function clawdSvg(pose: Pose, mono: boolean): string {
  const body = mono ? PAPER : RED;
  const bodyShapes = `
    <rect x="60" y="40" width="120" height="88" fill="${body}"/>
    <rect x="42" y="80" width="18" height="26" fill="${body}"/>
    <rect x="180" y="80" width="18" height="26" fill="${body}"/>
    <rect x="88" y="128" width="12" height="22" fill="${body}"/>
    <rect x="140" y="128" width="12" height="22" fill="${body}"/>
    ${eyesSvg(pose.eyes)}${mouthSvg(pose.mouth)}`;
  const filter = mono ? ' filter="url(#mono)"' : '';
  // Accessoires & objets rendus HORS du filtre mono : line-art net et fin, non
  // épaissi par la dilatation qui donne au corps son contour « sticker ».
  const extras = `${overheadSvg(pose.overhead, mono)}${accessorySvg(pose.accessory, mono)}`;
  return `<g${filter}>${bodyShapes}</g>${extras}`;
}

// radius élevé : à petite taille le contour resterait trop fin pour l'e-ink.
const MONO_FILTER = `<filter id="mono" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/><feFlood flood-color="${INK}" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/** Clawd seul dans un canvas CARRÉ (fond transparent) — base des sprites fichiers. */
export function clawdStandaloneSvg(pose: Pose, mono: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -15 240 240" shape-rendering="crispEdges" text-rendering="optimizeSpeed"><defs>${MONO_FILTER}</defs>${clawdSvg(pose, mono)}</svg>`;
}

/* ------------------------------------------------------------------------- *
 * Sprites fichiers (source de vérité du dessin des poses).
 *   server/sprites/<variant>/<key>.png|.gif   → défauts embarqués (repo)
 *   CONFIG_DIR/sprites/<variant>/<key>.…      → overrides utilisateur (upload)
 * PNG = pose statique. GIF = pose animée : l'e-paper lit 1 image/seconde puis
 * marque une pause de 10 s (frame 0) entre chaque boucle.
 * Taille conseillée : e-paper 118×118 (affiché 1:1), web 236×236.
 * ------------------------------------------------------------------------- */

export type SpriteVariant = 'epaper' | 'web';
const EMBED_SPRITES = fileURLToPath(new URL('../sprites/', import.meta.url));
const PAUSE_SECONDS = 10; // pause entre deux boucles d'animation

interface SpriteAsset {
  animated: boolean;
  /** Data-URIs PNG : une entrée par frame (une seule pour un PNG statique). */
  frames: string[];
}

const spriteCache = new Map<string, SpriteAsset | null>();

function userSpriteDir(variant: SpriteVariant): string {
  return path.join(getConfigDir(), 'sprites', variant);
}

/** Fichier de pose actif : override utilisateur d'abord, sinon défaut embarqué. */
function spriteFile(variant: SpriteVariant, key: string): { file: string; custom: boolean } | null {
  const dirs = [
    { dir: userSpriteDir(variant), custom: true },
    { dir: path.join(EMBED_SPRITES, variant), custom: false },
  ];
  for (const { dir, custom } of dirs) {
    for (const ext of ['.gif', '.png']) {
      const file = path.join(dir, key + ext);
      if (fs.existsSync(file)) return { file, custom };
    }
  }
  return null;
}

/** Décode un GIF en frames PNG (data-URIs). Gère les deux modes de disposal
 * courants : superposition (do-not-dispose) et retour au fond (disposal 2). */
function gifToPngFrames(buf: Buffer): string[] {
  const gif = new GifReader(buf);
  const rgba = Buffer.alloc(gif.width * gif.height * 4);
  const frames: string[] = [];
  for (let i = 0; i < gif.numFrames(); i++) {
    if (i > 0 && gif.frameInfo(i - 1).disposal === 2) rgba.fill(0);
    gif.decodeAndBlitFrameRGBA(i, rgba);
    const png = new PNG({ width: gif.width, height: gif.height });
    rgba.copy(png.data);
    frames.push(`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`);
  }
  return frames;
}

function loadSprite(variant: SpriteVariant, key: string): SpriteAsset | null {
  const cacheKey = `${variant}/${key}`;
  const hit = spriteCache.get(cacheKey);
  if (hit !== undefined) return hit;
  let asset: SpriteAsset | null = null;
  const found = spriteFile(variant, key);
  if (found) {
    try {
      const buf = fs.readFileSync(found.file);
      asset = found.file.endsWith('.gif')
        ? { animated: true, frames: gifToPngFrames(buf) }
        : { animated: false, frames: [`data:image/png;base64,${buf.toString('base64')}`] };
    } catch {
      asset = null;
    }
  }
  spriteCache.set(cacheKey, asset);
  return asset;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
}

/** Métadonnées d'une pose pour la galerie web. */
export function poseAssetInfo(variant: SpriteVariant, key: string): { animated: boolean; custom: boolean } {
  const found = spriteFile(variant, key);
  return { animated: Boolean(found?.file.endsWith('.gif')), custom: Boolean(found?.custom) };
}

/** Fichier brut d'une pose (galerie/aperçu web). Généré du vectoriel si absent. */
export function readPoseAsset(
  variant: SpriteVariant,
  pose: Pose,
): { buf: Buffer; type: 'image/png' | 'image/gif' } {
  const found = spriteFile(variant, pose.key);
  if (found) {
    return { buf: fs.readFileSync(found.file), type: found.file.endsWith('.gif') ? 'image/gif' : 'image/png' };
  }
  const mono = variant === 'epaper';
  const svg = clawdStandaloneSvg(pose, mono);
  // e-paper = 118 (1:1 dalle) ; web = 480 (HD, affiché lissé sur le dashboard).
  return { buf: rasterizeSvg(svg, mono ? 118 : 480, true), type: 'image/png' };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const GIF_MAGIC = Buffer.from('GIF8');

/** Enregistre un override utilisateur (PNG ou GIF, détecté par magic bytes). */
export function savePoseAsset(variant: SpriteVariant, key: string, buf: Buffer): { animated: boolean } {
  const isPng = buf.subarray(0, 4).equals(PNG_MAGIC);
  const isGif = buf.subarray(0, 4).equals(GIF_MAGIC);
  if (!isPng && !isGif) throw new Error('format non supporté (PNG ou GIF attendu)');
  if (isGif) gifToPngFrames(buf); // valide le GIF avant d'accepter
  const dir = userSpriteDir(variant);
  fs.mkdirSync(dir, { recursive: true });
  // Une pose = un seul fichier : on remplace l'autre extension si présente.
  fs.rmSync(path.join(dir, `${key}.png`), { force: true });
  fs.rmSync(path.join(dir, `${key}.gif`), { force: true });
  fs.writeFileSync(path.join(dir, key + (isGif ? '.gif' : '.png')), buf);
  clearSpriteCache();
  return { animated: isGif };
}

/** Supprime l'override utilisateur (retour au défaut embarqué). */
export function deletePoseAsset(variant: SpriteVariant, key: string): void {
  const dir = userSpriteDir(variant);
  fs.rmSync(path.join(dir, `${key}.png`), { force: true });
  fs.rmSync(path.join(dir, `${key}.gif`), { force: true });
  clearSpriteCache();
}

/** Frame courante d'une pose : cycle = N frames à 1 img/s + pause de 10 s (frame 0). */
function spriteFrame(asset: SpriteAsset, tick: number): string {
  if (!asset.animated || asset.frames.length <= 1) return asset.frames[0];
  const cycle = asset.frames.length + PAUSE_SECONDS;
  const idx = tick % cycle;
  return idx < asset.frames.length ? asset.frames[idx] : asset.frames[0];
}

/** Carré mascotte du panneau e-paper : sprite fichier 1:1, sinon vectoriel. */
function clawdSquare(pose: Pose, x: number, y: number, size: number, tick: number): string {
  const asset = loadSprite('epaper', pose.key);
  if (asset)
    return `<image href="${spriteFrame(asset, tick)}" x="${x}" y="${y}" width="${size}" height="${size}" image-rendering="pixelated"/>`;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 -15 240 240">${clawdSvg(pose, true)}</svg>`;
}

/* ------------------------------------------------------------------------- *
 * Panneaux e-paper — dalle unique Waveshare 2,13″ : 250×122 (horizontal) ou
 * 122×250 (vertical). Rendu noir & blanc uniquement.
 * ------------------------------------------------------------------------- */

/** Enveloppe SVG : fond, contenu, cadre, rotation. crispEdges = pas d'anti-
 * aliasing, chaque pixel sort déjà noir ou blanc (binarisation e-ink fidèle). */
function svgDoc(W: number, H: number, inner: string, rotate: 0 | 180, border: number): string {
  const frame = `<rect x="${border / 2}" y="${border / 2}" width="${W - border}" height="${H - border}" fill="none" stroke="${INK}" stroke-width="${border}"/>`;
  const content = `${inner}${frame}`;
  const body = rotate === 180 ? `<g transform="rotate(180 ${W / 2} ${H / 2})">${content}</g>` : content;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" text-rendering="optimizeSpeed"><defs>${MONO_FILTER}</defs><rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;
}

export interface PanelData {
  online: boolean; // usage réel récupéré (credentials OK, pas d'erreur)
  pose: Pose;
  five: number;
  fiveReset: string;
  seven: number;
  sevenReset: string;
  level: number;
  age: string;
  repu: number;
  joie: number;
  /** Seconde courante (epoch) : anime le point online et les poses GIF. */
  tick: number;
}

function gatherData(): PanelData {
  const st = poller.state;
  const snap = st.snapshot;
  const five = snap?.fiveHour ?? { utilization: 0, resetsAt: null };
  const seven = snap?.sevenDay ?? { utilization: 0, resetsAt: null };
  return {
    online: Boolean(st.snapshot) && st.authenticated && !st.lastError,
    pose: st.pose,
    five: Math.round(five.utilization),
    fiveReset: formatReset(five.resetsAt),
    seven: Math.round(seven.utilization),
    sevenReset: formatReset(seven.resetsAt),
    level: st.level,
    age: st.ageLabel,
    repu: st.stats.find((s) => s.key === 'repu')?.value ?? 0,
    joie: st.stats.find((s) => s.key === 'bonheur')?.value ?? 0,
    tick: Math.floor(Date.now() / 1000),
  };
}

/** Statut : « online » avec point qui CLIGNOTE (1 s plein / 1 s absent) ;
 * « offline » avec cercle vide, statique. Centré sur cx. */
function statusSvg(cx: number, y: number, online: boolean, tick: number, fs = 9): string {
  const label = online ? 'Online' : 'Offline';
  const r = fs * 0.42;
  const textCx = cx + r; // décale le texte pour loger le point à sa gauche
  const dotCx = textCx - (label.length * fs * 0.62) / 2 - r - 1;
  const cy = y - fs * 0.32;
  const dot = online
    ? tick % 2 === 0
      ? `<circle cx="${dotCx}" cy="${cy}" r="${r}" fill="${INK}"/>`
      : ''
    : `<circle cx="${dotCx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>`;
  return `${dot}<text x="${textCx}" y="${y}" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="${fs}" fill="${INK}">${label}</text>`;
}

/** Ligne limite : « 5 H (47%) », barre, reset à droite. `big` = format horizontal. */
function barRow(x: number, y: number, w: number, label: string, v: number, reset: string, big = false): string {
  const lf = big ? 12 : 9; // label
  const pf = big ? 8 : 7; // pourcentage
  const bh = big ? 9 : 7; // hauteur de barre
  const rf = big ? 8 : 7; // reset
  return `
    <text x="${x}" y="${y}" font-family="monospace" font-weight="bold" font-size="${lf}" fill="${INK}">${label} <tspan font-weight="normal" font-size="${pf}">(${v}%)</tspan></text>
    <rect x="${x}" y="${y + 4}" width="${w}" height="${bh}" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="${x + 2}" y="${y + 6}" width="${(w - 4) * (v / 100)}" height="${bh - 4}" fill="${INK}"/>
    <text x="${x + w}" y="${y + bh + 13}" text-anchor="end" font-family="monospace" font-size="${rf}" fill="${INK}">reset ${reset}</text>`;
}

/** Mini-stat : label + barre de progression continue. */
function statMini(x: number, y: number, label: string, value: number, barW = 26): string {
  const bx = x + 22;
  return `<text x="${x}" y="${y + 6}" font-family="monospace" font-weight="bold" font-size="8" fill="${INK}">${label}</text>
    <rect x="${bx}" y="${y}" width="${barW}" height="7" fill="${PAPER}" stroke="${INK}" stroke-width="1"/>
    <rect x="${bx + 1}" y="${y + 1}" width="${(barW - 2) * (value / 100)}" height="5" fill="${INK}"/>`;
}

/** Horizontal 250×122 : carré mascotte pleine hauteur à gauche, infos à droite. */
export function buildHorizontal(d: PanelData, rotate: 0 | 180): string {
  const W = 250, H = 122;
  const rx = 132, rw = 108, rcx = rx + rw / 2;
  const inner = `
  ${clawdSquare(d.pose, 2, 2, 118, d.tick)}
  <rect x="122" y="16" width="2" height="90" fill="${INK}"/>
  ${statusSvg(rcx, 13, d.online, d.tick, 11)}
  ${barRow(rx, 32, rw, '5 H', d.five, d.fiveReset, true)}
  ${barRow(rx, 66, rw, '7 J', d.seven, d.sevenReset, true)}
  <rect x="${rx}" y="94" width="${rw}" height="2" fill="${INK}"/>
  <text x="${rcx}" y="105" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="10" fill="${INK}">Nv.${d.level} · ${d.age}</text>
  ${statMini(rx, 110, 'REP', d.repu, 24)}${statMini(rx + 56, 110, 'JOI', d.joie, 24)}`;
  return svgDoc(W, H, inner, rotate, 2);
}

/** Vertical 122×250 : online en haut, carré mascotte, limites et stats dessous. */
export function buildVertical(d: PanelData, rotate: 0 | 180): string {
  const W = 122, H = 250, cx = W / 2, x = 8, w = W - 2 * x;
  const inner = `
  ${statusSvg(cx, 12, d.online, d.tick, 11)}
  ${clawdSquare(d.pose, 2, 16, 118, d.tick)}
  <text x="${cx}" y="146" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="11" fill="${INK}">Nv.${d.level} · ${d.age}</text>
  <rect x="${x}" y="150" width="${w}" height="2" fill="${INK}"/>
  ${barRow(x, 166, w, '5 H', d.five, d.fiveReset, true)}
  ${barRow(x, 200, w, '7 J', d.seven, d.sevenReset, true)}
  <rect x="${x}" y="224" width="${w}" height="2" fill="${INK}"/>
  ${statMini(x, 228, 'REP', d.repu)}${statMini(cx + 4, 228, 'ENE', 100 - d.five)}
  ${statMini(x, 240, 'JOI', d.joie)}${statMini(cx + 4, 240, 'FOR', 100 - d.seven)}`;
  return svgDoc(W, H, inner, rotate, 2);
}

export type EpaperLayout = 'horizontal' | 'vertical';

/** Accepte aussi les anciennes valeurs de config/API (compact, full, tall…). */
export function normalizeLayout(v: unknown): EpaperLayout | undefined {
  if (v === 'horizontal' || v === 'compact' || v === 'full') return 'horizontal';
  if (v === 'vertical' || v === 'compact-tall' || v === 'tall') return 'vertical';
  return undefined;
}

export interface RenderOpts {
  layout?: EpaperLayout;
  rotate?: 0 | 180;
}

export function buildEpaperSvg(opts: RenderOpts = {}): string {
  const cfg = loadConfig();
  const layout = opts.layout ?? cfg.epaperLayout;
  const rotate = opts.rotate ?? cfg.epaperRotate ?? 0;
  const data = gatherData();
  return layout === 'vertical' ? buildVertical(data, rotate) : buildHorizontal(data, rotate);
}

/** Rastérise un SVG avec la police embarquée (rendu déterministe partout). */
export function rasterizeSvg(svg: string, widthPx: number, transparent = false): Buffer {
  const resvg = new Resvg(svg, {
    ...(transparent ? {} : { background: PAPER }),
    fitTo: { mode: 'width', value: widthPx },
    // La police générique "monospace" du SVG est mappée sur Tiny5 (pixel).
    // loadSystemFonts:false = rendu déterministe + init plus rapide (Pi Zero).
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: FONT_FAMILY,
      monospaceFamily: FONT_FAMILY,
    },
  });
  return Buffer.from(resvg.render().asPng());
}

/** Rastérise le panneau courant en PNG. `scale` agrandit (aperçu net). */
export function renderEpaperPng(opts: RenderOpts & { scale?: number } = {}): Buffer {
  const svg = buildEpaperSvg(opts);
  const layout = opts.layout ?? loadConfig().epaperLayout;
  const baseW = layout === 'vertical' ? 122 : 250;
  return rasterizeSvg(svg, Math.round(baseW * (opts.scale ?? 1)));
}
