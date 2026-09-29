import { ANCHORS, BX, BY, C } from './clawd-grid.js';
import { PROP_PALETTE, propLayers } from './clawd-props.js';
import { REST, type IdleFrame } from './idle.js';
import type { ClawdEyes, ClawdMouth, Look } from './look.js';
import { INK, PAPER, bitmap, renderLayers, shift, type Layer, type Mode, type Rect, type Ring, type Swatch } from './pixel.js';

/* ------------------------------------------------------------------------- *
 * Clawd en PIXEL ART, sur la grille des GIF officiels de Claude Code (le Clawd
 * qui jongle, agite le drapeau, se tourne vers son outil) :
 *   corps 8×6 cellules · yeux 1×1 (colonnes 1 et 6, ligne 1)
 *   bras 2×2 (lignes 2-3) · 4 pattes 1×2 (colonnes 0, 2, 5, 7)
 * Une cellule = 7 px de dalle : de gros pixels, lisibles sur l'e-ink.
 * Module ISOMORPHE : la dalle (N&B) et le web (couleur, 60 img/s) dessinent
 * avec CE code, seule la palette change. Chaque dessin reçoit une image de la
 * couche idle (`idle.ts`). Unités : px de dalle ; en N&B tout est arrondi.
 *
 * N&B = Clawd blanc cerné d'un liseré noir, façon Tamagotchi, sur le papier.
 * Web = orange Claude + contour sticker blanc.
 * ------------------------------------------------------------------------- */

export { ANCHORS, INK, PAPER };

/** Le carré mascotte : 118×118 px de dalle, 1 unité = 1 px. */
export const CLAWD_VIEWBOX = '0 0 118 118';

/** Palette : clé → teinte web + rendu N&B. */
export const PALETTE: Record<string, Swatch> = {
  B: { color: '#D97757', mono: 'paper' }, // corps (orange Claude)
  E: { color: '#1C1714', mono: 'ink' }, // yeux, bouche
  H: { color: '#F09A86', mono: null }, // joues (web seulement)
  T: { color: '#E8685C', mono: null }, // langue (web seulement)
  W: { color: '#FFFFFF', mono: 'paper' }, // reflet, blanc
  ...PROP_PALETTE, // accessoires (clawd-props.ts)
};

/** Contour sticker : web = blanc 3 px ; dalle = liseré noir 2 px (il laisse
 * 3 px d'air entre les pattes, espacées d'une cellule). */
export const STICKER: Partial<Record<Mode, readonly Ring[]>> = {
  color: [[3, 'paper']],
  mono: [[2, 'ink']],
};

/** Rectangle en cellules du corps (origine = coin haut-gauche du corps). */
const cell = (cx: number, cy: number, w = 1, h = 1, k = 'B'): Rect => ({
  x: BX + cx * C,
  y: BY + cy * C,
  w: w * C,
  h: h * C,
  k,
});
/** Rectangle en px, relatif au coin du corps (détails plus fins qu'une cellule). */
const px = (x: number, y: number, w: number, h: number, k = 'E', opacity?: number): Rect => ({
  x: BX + x,
  y: BY + y,
  w,
  h,
  k,
  opacity,
});

/* --------------------------------- visage --------------------------------- *
 * Minimaliste, comme les GIF : des points, des traits, des arcs. Les deux yeux
 * sont dans les cellules (1, 1) et (6, 1) : x 7→14 et 42→49, y 7→14.
 * -------------------------------------------------------------------------- */

const EYE_L = 7;
const EYE_R = 42;
const EYE_Y = 7;

/** Œil carré officiel (1 cellule), fermé progressivement par la paupière : il
 * s'écrase autour de son centre jusqu'à un trait de 2 px (dalle : 0 ou 1). */
function dot(x: number, lid: number): Rect {
  const hh = Math.max(2, C * (1 - lid));
  return px(x, EYE_Y + (C - hh) / 2, C, hh);
}

/** Trait fermé (dodo, clin d'œil) : 1 cellule de large, 2 px, bas de l'œil. */
const bar = (x: number) => px(x, EYE_Y + 4, C, 2);

/** Arc « ⌒ » des yeux contents (GIF du drapeau) : 7 px, trait de 2 px. */
const ARC = ['.XXXXX.', 'XXXXXXX', 'XX...XX'];
const arc = (x: number) => bitmap(ARC, BX + x, BY + EYE_Y + 2, 1).map((r) => ({ ...r, k: 'E' }));

/** Croix « × » (K.-O.) : 7×7, traits de 2-3 px. */
const X = ['XX...XX', 'XXX.XXX', '.XXXXX.', '..XXX..', '.XXXXX.', 'XXX.XXX', 'XX...XX'];
const cross = (x: number) => bitmap(X, BX + x, BY + EYE_Y, 1).map((r) => ({ ...r, k: 'E' }));

function eyes(kind: ClawdEyes, lid: number): Rect[] {
  switch (kind) {
    case 'happy':
      return [...arc(EYE_L), ...arc(EYE_R)];
    case 'sleep':
      return [bar(EYE_L), bar(EYE_R)];
    case 'wink':
      return [dot(EYE_L, lid), bar(EYE_R)];
    case 'cross':
      return [...cross(EYE_L), ...cross(EYE_R)];
    case 'shades':
      // Une barre noire d'un côté à l'autre, deux verres, un reflet.
      return [px(4, EYE_Y, 14, 6), px(38, EYE_Y, 14, 6), px(18, EYE_Y + 1, 20, 2), px(6, EYE_Y + 1, 3, 2, 'W', 0.6), px(40, EYE_Y + 1, 3, 2, 'W', 0.6)];
    default: // square — les yeux officiels
      return [dot(EYE_L, lid), dot(EYE_R, lid)];
  }
}

/** Bouches : minuscules, centrées sous les yeux (le Clawd officiel n'en a pas). */
function mouth(kind: ClawdMouth | undefined): Rect[] {
  if (kind === 'line') return [px(24, 23, 8, 2)];
  if (kind === 'open') return [px(25, 21, 6, 6), px(26, 25, 4, 2, 'T')];
  if (kind === 'kiss') return [px(30, 22, 4, 4)];
  return [];
}

/** Joues roses (web) pour les mines joyeuses ou tendres. */
function blush(look: Look): Rect[] {
  if (!['happy', 'wink'].includes(look.eyes) && look.mouth !== 'kiss') return [];
  return [px(2, 16, 6, 3, 'H'), px(48, 16, 6, 3, 'H')];
}

/* ------------------------------- accessoires ------------------------------- */

/** Des accessoires s'animent-ils seuls (indépendamment du mouvement du corps) ?
 * Leurs boucles font 1, 2 ou 4 s ; le sprite boucle alors sur un multiple de 4 s. */
export function hasAnimatedExtras(look: Look): boolean {
  return (
    ['zzz', 'sparkle-hat', 'sun', 'umbrella', 'party', 'headphones', 'lightbulb', 'bubble'].includes(look.overhead ?? 'none') ||
    ['laptop', 'coffee', 'wand', 'heart', 'flag'].includes(look.accessory ?? 'none')
  );
}

/* ---------------------------------- corps ---------------------------------- */

/** Toutes les couches de Clawd pour une image de la couche idle. */
export function clawdLayers(look: Look, mode: Mode, f: IdleFrame = REST): Layer[] {
  const r = (v: number) => (mode === 'mono' ? Math.round(v) : v);
  const x = r(f.dx);
  const feet = r(f.bob);
  const torsoY = r(f.bob + f.squash); // le corps se tasse sur ses pattes
  // Pattes : partent de l'intérieur du corps (cachées dessous) → le tassement les raccourcit.
  const legs = [0, 2, 5, 7].map((c): Rect => ({ x: BX + c * C, y: BY + 5 * C, w: C, h: 3 * C, k: 'B' }));
  const armL = { ...cell(-2, 2, 2, 2), y: ANCHORS.armTop + r(f.armL) };
  // Drapeau : le bras droit se lève tout droit — une main posée au-dessus de la tête (GIF officiel).
  const armR =
    look.accessory === 'flag'
      ? { ...cell(6, -1, 1, 1), y: BY - C + Math.min(0, r(f.armR)) }
      : { ...cell(8, 2, 2, 2), y: ANCHORS.armTop + r(f.armR) };
  const torso = [armL, armR, cell(0, 0, 8, 6)];
  const lid = mode === 'mono' ? (f.blink >= 0.5 ? 1 : 0) : f.blink;
  const face = [
    ...(mode === 'color' ? blush(look) : []),
    ...shift(eyes(look.eyes, lid), r(f.lookX), r(f.lookY)),
    ...mouth(look.mouth),
  ];
  // Chapeaux et objets tenus suivent le haut du corps ; skate et ballon, le sol.
  const props = propLayers(look, mode, f, r(f.armR));
  const move = (layers: Layer[], dy: number) => layers.map((l) => ({ ...l, rects: shift(l.rects, x, dy) }));
  return [
    { rects: shift(legs, x, feet), outline: STICKER },
    { rects: shift(torso, x, torsoY), outline: STICKER },
    { rects: shift(face, x, torsoY) },
    ...move(props.ground, feet),
    ...move(props.head, torsoY),
  ];
}

/** Clawd dans une image de la couche idle : N&B (dalle) ou couleur (web). */
export function clawdSvg(look: Look, mono: boolean, f: IdleFrame = REST): string {
  const mode: Mode = mono ? 'mono' : 'color';
  return renderLayers(clawdLayers(look, mode, f), PALETTE, mode);
}

/** Clawd seul dans le carré 118×118, fond transparent — base des sprites.
 * `crispEdges` : c'est du pixel art. */
export function clawdStandaloneSvg(look: Look, mono: boolean, f: IdleFrame = REST): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CLAWD_VIEWBOX}" shape-rendering="crispEdges">${clawdSvg(look, mono, f)}</svg>`;
}
