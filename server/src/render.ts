import { clawdSvg, INK, MONO_FILTER, PAPER } from './clawd.js';
import { idleFrame } from './idle.js';
import { poller } from './poller.js';
import { loadConfig } from './config.js';
import type { Pose } from './mascot.js';
import { pixelTextWidth, rasterizeSvg } from './raster.js';
import { loadSprite, spriteFrame } from './sprites.js';

export { rasterizeSvg };

/** Carré mascotte du panneau e-paper : sprite 1:1 (fichier ou généré), animé en
 * continu au fil des secondes ; à défaut, vectoriel direct (même couche idle). */
function clawdSquare(pose: Pose, x: number, y: number, size: number, tick: number): string {
  const asset = loadSprite('epaper', pose);
  if (asset)
    return `<image href="${spriteFrame(asset, tick)}" x="${x}" y="${y}" width="${size}" height="${size}" image-rendering="pixelated"/>`;
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 -15 240 240">${clawdSvg(pose, true, idleFrame(pose.motion, tick, 1))}</svg>`;
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
  /** Des limites ont-elles déjà été lues ? Sinon : « -- » plutôt qu'un faux 0 %. */
  hasData: boolean;
  pose: Pose;
  five: number;
  /** Temps avant reset, tel qu'affiché (ex. « 2H45 », « 4J 2H »). */
  fiveReset: string;
  seven: number;
  sevenReset: string;
  level: number;
  age: string;
  repu: number;
  joie: number;
  /** Seconde courante (epoch) : anime le point online et la mascotte. */
  tick: number;
}

/** Temps avant reset, compact et en majuscules (les minuscules Tiny5 font 4 px). */
export function resetShort(resetsAt: string | null): string {
  if (!resetsAt) return '--';
  const min = Math.round((new Date(resetsAt).getTime() - Date.now()) / 60000);
  if (Number.isNaN(min) || min <= 0) return '--';
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)}J ${h % 24}H`;
  if (h > 0) return `${h}H${String(min % 60).padStart(2, '0')}`;
  return `${min}MIN`;
}

function gatherData(): PanelData {
  const st = poller.state;
  const snap = st.snapshot;
  const five = snap?.fiveHour ?? { utilization: 0, resetsAt: null };
  const seven = snap?.sevenDay ?? { utilization: 0, resetsAt: null };
  return {
    online: Boolean(st.snapshot) && st.authenticated && !st.lastError,
    hasData: Boolean(snap),
    pose: st.pose,
    five: Math.round(five.utilization),
    fiveReset: resetShort(five.resetsAt),
    seven: Math.round(seven.utilization),
    sevenReset: resetShort(seven.resetsAt),
    level: st.level,
    age: st.ageLabel,
    repu: st.stats.find((s) => s.key === 'repu')?.value ?? 0,
    joie: st.stats.find((s) => s.key === 'bonheur')?.value ?? 0,
    tick: Math.floor(Date.now() / 1000),
  };
}

/* ------------------------------ primitives -------------------------------- *
 * Tout est posé au pixel entier. Texte : Tiny5 uniquement à ×2 (16 px, capitales
 * de 10 px) ou ×3 (24 px, 15 px) — ses seules tailles nettes au-dessus de 8 —,
 * jamais de gras (la police n'a qu'une graisse : le gras synthétique bave).
 * -------------------------------------------------------------------------- */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Petits chiffres 4×5 maison, à la hauteur des capitales Tiny5 : ceux de la
 * police font 3 px de large et son « 8 » ressemble à un « $ ». */
const SMALL_DIGITS: Record<string, string[]> = {
  '0': ['.XX.', 'X..X', 'X..X', 'X..X', '.XX.'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX.', '...X', '.XX.', 'X...', 'XXXX'],
  '3': ['XXX.', '...X', '.XX.', '...X', 'XXX.'],
  '4': ['X..X', 'X..X', 'XXXX', '...X', '...X'],
  '5': ['XXXX', 'X...', 'XXX.', '...X', 'XXX.'],
  '6': ['.XX.', 'X...', 'XXX.', 'X..X', '.XX.'],
  '7': ['XXXX', '...X', '..X.', '.X..', '.X..'],
  '8': ['.XX.', 'X..X', '.XX.', 'X..X', '.XX.'],
  '9': ['.XX.', 'X..X', '.XXX', '...X', '.XX.'],
};
const charW = (ch: string) => (SMALL_DIGITS[ch] ? SMALL_DIGITS[ch][0].length + 1 : pixelTextWidth(ch));

/** Largeur VISIBLE d'un texte à l'échelle `k` (sans l'espacement final du dernier glyphe). */
function textW(text: string, k: number): number {
  let w = 0;
  for (const ch of text) w += charW(ch);
  return Math.max(0, w - 1) * k;
}

/** Texte net (lettres Tiny5 + chiffres 4×5) : `y` = ligne de base, `x` = bord
 * gauche, droit (`end`) ou centre. */
function txt(text: string, x: number, y: number, k: 2, align: 'start' | 'end' | 'middle' = 'start'): string {
  const w = textW(text, k);
  let cx = align === 'end' ? x - w : align === 'middle' ? Math.round(x - w / 2) : x;
  let out = '';
  let run = '';
  const flush = () => {
    if (!run) return;
    out += `<text x="${cx}" y="${y}" font-family="Tiny5" font-size="${8 * k}" fill="${INK}">${esc(run)}</text>`;
    cx += pixelTextWidth(run) * k;
    run = '';
  };
  for (const ch of text) {
    if (ch === ' ') {
      // Avance sans rien émettre : le SVG avalerait un espace en début de texte.
      flush();
      cx += charW(ch) * k;
    } else if (SMALL_DIGITS[ch]) {
      flush();
      out += icon(SMALL_DIGITS[ch], cx, y - 5 * k, k);
      cx += charW(ch) * k;
    } else run += ch;
  }
  flush();
  return out;
}

/** Icône pixel art (lignes de `X`), agrandie ×k, fusionnée en bandes horizontales. */
function icon(rows: string[], x: number, y: number, k = 2): string {
  let s = '';
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; ) {
      if (row[c] !== 'X') {
        c++;
        continue;
      }
      let e = c;
      while (row[e] === 'X') e++;
      s += `<rect x="${x + c * k}" y="${y + r * k}" width="${(e - c) * k}" height="${k}" fill="${INK}"/>`;
      c = e;
    }
  });
  return s;
}

// 5×5 à ×2 = 10 px : même hauteur que les capitales ×2.
const DOT = ['.XXX.', 'XXXXX', 'XXXXX', 'XXXXX', '.XXX.'];
const RING = ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'];
const CLOCK = ['.XXX.', 'X.X.X', 'X.XXX', 'X...X', '.XXX.'];
// 7×6 à ×2 : les stats Tamagotchi (joie, repu).
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const APPLE = ['....XX.', '...X...', '.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XX.XX.'];

/* Chiffres des pourcentages : police LCD 5×7 maison (affichée ×2 : 10×14 px,
 * traits de 2 px). Tiny5 ne fait que 3 px de large — son « 8 » ressemble à un
 * « $ » —, or c'est LA donnée qu'on lit de loin. */
const DIGITS: Record<string, string[]> = {
  '0': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  '1': ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  '2': ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'],
  '3': ['XXXXX', '...X.', '..X..', '...X.', '....X', 'X...X', '.XXX.'],
  '4': ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
  '5': ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
  '6': ['..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
  '7': ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
  '8': ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'],
  '9': ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'],
  '%': ['XX...', 'XX..X', '...X.', '..X..', '.X...', 'X..XX', '...XX'],
  '-': ['.....', '.....', '.....', 'XXXXX', '.....', '.....', '.....'],
};
const DIGIT_K = 2;
const digitsW = (t: string) => (t.length * 6 - 1) * DIGIT_K;

/** Nombre en chiffres LCD, aligné à droite sur `xr`, haut à `y` (14 px de haut). */
function bigNumber(text: string, xr: number, y: number): string {
  let x = xr - digitsW(text);
  let s = '';
  for (const ch of text) {
    s += icon(DIGITS[ch] ?? DIGITS['-'], x, y, DIGIT_K);
    x += 6 * DIGIT_K;
  }
  return s;
}

/** Barre : cadre 2 px, 1 px d'air, remplissage — lisible même en refresh partiel. */
function bar(x: number, y: number, w: number, h: number, v: number | null): string {
  const inner = w - 6;
  const fill = v === null ? 0 : Math.round((inner * Math.max(0, Math.min(100, v))) / 100);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${INK}"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="${PAPER}"/>${
    fill ? `<rect x="${x + 3}" y="${y + 3}" width="${fill}" height="${h - 6}" fill="${INK}"/>` : ''
  }`;
}

/** En-tête : point qui clignote + niveau · âge ; hors ligne : anneau + « HORS LIGNE ». */
function header(x: number, y: number, w: number, d: PanelData): string {
  if (!d.online) return `${icon(RING, x, y)}${txt('HORS LIGNE', x + 14, y + 10, 2)}`;
  const dot = d.tick % 2 === 0 ? icon(DOT, x, y) : ''; // 1 s plein / 1 s vide
  return `${dot}${txt(`NV.${d.level}`, x + 14, y + 10, 2)}${txt(d.age.toUpperCase(), x + w, y + 10, 2, 'end')}`;
}

/** Largeur de la colonne des pourcentages : « 100% » en chiffres LCD. */
const PCT_W = digitsW('100%');

/**
 * Une limite, sur deux lignes : « 5H ······ ⏱ 2H45 » (×2), puis le pourcentage
 * en gros chiffres LCD (aligné à droite de sa colonne) et sa barre. Hauteur : 29 px.
 */
function limit(x: number, y: number, w: number, label: string, v: number | null, reset: string): string {
  const r = reset.toUpperCase();
  const rw = textW(r, 2);
  return `${txt(label, x, y + 10, 2)}${icon(CLOCK, x + w - rw - 14, y)}${txt(r, x + w, y + 10, 2, 'end')}
    ${bigNumber(v === null ? '--' : `${v}%`, x + PCT_W, y + 15)}
    ${bar(x + PCT_W + 5, y + 16, w - PCT_W - 5, 12, v)}`;
}

/** Stats Tamagotchi : ♥ joie et 🍎 repu, icône + valeur (×2). Hauteur : 12 px. */
function stats(x: number, y: number, d: PanelData): string {
  // Icônes calées sur leur bas (la pomme a une queue, 2 px plus haute que le cœur).
  const one = (rows: string[], v: number, at: number) =>
    `${icon(rows, at, y + 12 - rows.length * 2)}${txt(String(v), at + 17, y + 11, 2)}`;
  return `${one(HEART, d.joie, x)}${one(APPLE, d.repu, x + 50)}`;
}

/** Horizontal 250×122 : mascotte 118×118 à gauche, infos à droite (x 128 → 244). */
export function buildHorizontal(d: PanelData, rotate: 0 | 180): string {
  const W = 250, H = 122, x = 129, w = 115;
  const five = d.hasData ? d.five : null;
  const seven = d.hasData ? d.seven : null;
  const inner = `
  ${clawdSquare(d.pose, 2, 2, 118, d.tick)}
  <rect x="121" y="8" width="2" height="106" fill="${INK}"/>
  ${header(x, 7, w, d)}
  ${limit(x, 25, w, '5H', five, d.fiveReset)}
  ${limit(x, 61, w, '7J', seven, d.sevenReset)}
  ${stats(x, 100, d)}`;
  return svgDoc(W, H, inner, rotate, 2);
}

/** Vertical 122×250 : en-tête, mascotte, limites, stats. */
export function buildVertical(d: PanelData, rotate: 0 | 180): string {
  const W = 122, H = 250, x = 6, w = 110;
  const five = d.hasData ? d.five : null;
  const seven = d.hasData ? d.seven : null;
  const inner = `
  ${header(x, 5, w, d)}
  ${clawdSquare(d.pose, 2, 20, 118, d.tick)}
  <rect x="${x}" y="143" width="${w}" height="2" fill="${INK}"/>
  ${limit(x, 151, w, '5H', five, d.fiveReset)}
  ${limit(x, 189, w, '7J', seven, d.sevenReset)}
  ${stats(x + 7, 229, d)}`;
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

/** Rastérise le panneau courant en PNG. `scale` agrandit (aperçu net). */
export function renderEpaperPng(opts: RenderOpts & { scale?: number } = {}): Buffer {
  const svg = buildEpaperSvg(opts);
  const layout = opts.layout ?? loadConfig().epaperLayout;
  const baseW = layout === 'vertical' ? 122 : 250;
  return rasterizeSvg(svg, Math.round(baseW * (opts.scale ?? 1)));
}
