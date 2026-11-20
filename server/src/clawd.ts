import { ANCHORS, BX, BY, C, QUARTER } from './clawd-grid.js';
import { PROP_PALETTE, SIDE_ACCESSORIES, propLayers } from './clawd-props.js';
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
  D: { color: '#BC664B', mono: 'paper' }, // flanc et bras lointain, de 3/4 (ombré)
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

/** Géométrie du visage, en px absolus : de face ou tourné de 3/4. */
interface Face {
  /** Coin haut-gauche des deux yeux (1 cellule chacun). */
  eyeL: number;
  eyeR: number;
  eyeY: number;
  /** Décalage de la bouche par rapport à sa place de face. */
  mouthDx: number;
  mouthDy: number;
  /** Joues (web). */
  cheekL: number;
  cheekR: number;
  cheekY: number;
}

const FRONT: Face = {
  eyeL: BX + 7,
  eyeR: BX + 42,
  eyeY: BY + 7,
  mouthDx: 0,
  mouthDy: 0,
  cheekL: BX + 2,
  cheekR: BX + 48,
  cheekY: BY + 16,
};

/** De 3/4 : yeux sur la face (le droit touche son bord), bouche entre les deux. */
const SIDE: Face = {
  eyeL: QUARTER.x + 21,
  eyeR: QUARTER.x + 49,
  eyeY: QUARTER.top + 9,
  mouthDx: QUARTER.x + 38 - (BX + 28),
  mouthDy: QUARTER.top + 9 - (BY + 7),
  cheekL: QUARTER.x + 17,
  cheekR: QUARTER.x + 49,
  cheekY: QUARTER.top + 18,
};

const ink = (x: number, y: number, w: number, h: number, k = 'E', opacity?: number): Rect => ({ x, y, w, h, k, opacity });

/** Œil carré officiel (1 cellule), fermé progressivement par la paupière : il
 * s'écrase autour de son centre jusqu'à un trait de 2 px (dalle : 0 ou 1). */
function dot(x: number, y: number, lid: number): Rect {
  const hh = Math.max(2, C * (1 - lid));
  return ink(x, y + (C - hh) / 2, C, hh);
}

/** Trait fermé (dodo, clin d'œil, œil plissé) : 1 cellule de large, 2 px, bas de l'œil. */
const bar = (x: number, y: number) => ink(x, y + 4, C, 2);

/** Arc « ⌒ » des yeux contents (GIF du drapeau) : 7 px, trait de 2 px. */
const ARC = ['.XXXXX.', 'XXXXXXX', 'XX...XX'];
const arc = (x: number, y: number) => bitmap(ARC, x, y + 2, 1).map((r) => ({ ...r, k: 'E' }));

/** Croix « × » (K.-O.) : 7×7, traits de 2-3 px. */
const X = ['XX...XX', 'XXX.XXX', '.XXXXX.', '..XXX..', '.XXXXX.', 'XXX.XXX', 'XX...XX'];
const cross = (x: number, y: number) => bitmap(X, x, y, 1).map((r) => ({ ...r, k: 'E' }));

function eyes(kind: ClawdEyes, lid: number, face: Face): Rect[] {
  const { eyeL: l, eyeR: r, eyeY: y } = face;
  switch (kind) {
    case 'happy':
      return [...arc(l, y), ...arc(r, y)];
    case 'sleep':
      return [bar(l, y), bar(r, y)];
    case 'wink':
      return [dot(l, y, lid), bar(r, y)];
    case 'peer':
      // L'œil gauche se plisse, le droit scrute (le détective et sa loupe).
      return [bar(l, y), dot(r, y, lid)];
    case 'cross':
      return [...cross(l, y), ...cross(r, y)];
    case 'shades':
      // Une barre noire d'un côté à l'autre, deux verres, un reflet.
      return [
        ink(l - 3, y, 14, 6),
        ink(r - 4, y, 14, 6),
        ink(l + 11, y + 1, r - l - 15, 2),
        ink(l - 1, y + 1, 3, 2, 'W', 0.6),
        ink(r - 2, y + 1, 3, 2, 'W', 0.6),
      ];
    default: // square — les yeux officiels
      return [dot(l, y, lid), dot(r, y, lid)];
  }
}

/** Syllabes de la bouche qui parle (o = ouverte, - = mi-close, _ = fermée).
 * Dalle : une par seconde ; web : ~6 par seconde, irrégulières. */
const TALK_STEP = ['o', '_', '-', '_'];
const TALK_WEB = ['o', '-', '_', 'o', '_', '-', 'o', '-', '_', '_'];

/** Bouches : minuscules, centrées sous les yeux (le Clawd officiel n'en a pas). */
function mouth(kind: ClawdMouth | undefined, f: IdleFrame, mono: boolean): Rect[] {
  if (kind === 'talk') {
    const s = mono ? TALK_STEP[f.step & 3] : TALK_WEB[Math.floor(f.t * 6) % TALK_WEB.length];
    return s === 'o' ? mouth('open', f, mono) : s === '-' ? [px(25, 22, 6, 3)] : mouth('line', f, mono);
  }
  if (kind === 'line') return [px(24, 23, 8, 2)];
  if (kind === 'open') return [px(25, 21, 6, 6), px(26, 25, 4, 2, 'T')];
  if (kind === 'kiss') return [px(30, 22, 4, 4)];
  return [];
}

/** Joues roses (web) pour les mines joyeuses ou tendres. */
function blush(look: Look, face: Face): Rect[] {
  if (!['happy', 'wink'].includes(look.eyes) && look.mouth !== 'kiss') return [];
  return [ink(face.cheekL, face.cheekY, 6, 3, 'H'), ink(face.cheekR, face.cheekY, 6, 3, 'H')];
}

/* ------------------------------- accessoires ------------------------------- */

/** Des accessoires s'animent-ils seuls (indépendamment du mouvement du corps) ?
 * Leurs boucles font 1, 2 ou 4 s ; le sprite boucle alors sur un multiple de 4 s. */
export function hasAnimatedExtras(look: Look): boolean {
  return (
    look.mouth === 'talk' ||
    ['zzz', 'sparkle-hat', 'sun', 'umbrella', 'party', 'headphones', 'lightbulb', 'bubble', 'speech'].includes(look.overhead ?? 'none') ||
    ['laptop', 'coffee', 'wand', 'heart', 'flag'].includes(look.accessory ?? 'none')
  );
}

/* ---------------------------------- corps ---------------------------------- */

/** Clawd de face : corps 8×6, un bras de chaque côté, 4 pattes droites. */
function frontBody(look: Look, f: IdleFrame, r: (v: number) => number) {
  // Pattes : partent de l'intérieur du corps (cachées dessous) → le tassement les raccourcit.
  const legs = [0, 2, 5, 7].map((c): Rect => ({ x: BX + c * C, y: BY + 5 * C, w: C, h: 3 * C, k: 'B' }));
  const armL = { ...cell(-2, 2, 2, 2), y: ANCHORS.armTop + r(f.armL) };
  // Drapeau : le bras droit se lève tout droit — une main posée au-dessus de la tête (GIF officiel).
  const armR =
    look.accessory === 'flag'
      ? { ...cell(6, -1, 1, 1), y: BY - C + Math.min(0, r(f.armR)) }
      : { ...cell(8, 2, 2, 2), y: ANCHORS.armTop + r(f.armR) };
  return { legs, torso: [armL, armR, cell(0, 0, 8, 6)], seam: [] as Rect[] };
}

/**
 * Clawd tourné de 3/4 vers la droite, d'après les visuels officiels : flanc
 * ombré (2 cellules) + face (6), corps de 5 cellules de haut, pieds tournés
 * vers l'arrière. Bras selon l'accessoire : au clavier (GIF officiel), les deux
 * côté droit (le lointain, ombré, derrière) qui tapent à tour de rôle ; à la
 * loupe (sticker du détective), le bras gauche dépasse du flanc et le droit,
 * caché, tient le manche. Dalle : flanc tramé.
 */
function sideBody(look: Look, f: IdleFrame, r: (v: number) => number) {
  const { x, top } = QUARTER;
  const g = ANCHORS.ground;
  const legs = [0, 2, 5, 7].flatMap((c, i): Rect[] => {
    const lx = x + c * C;
    const k = i === 0 ? 'D' : 'B';
    return [
      { x: lx, y: top + 4 * C, w: C, h: g - 4 - (top + 4 * C), k },
      { x: lx - 2, y: g - 4, w: C, h: 4, k }, // pied tourné vers l'arrière
    ];
  });
  const arms: Rect[] =
    look.accessory === 'laptop-side'
      ? [
          { x: x + 55, y: top + 30 + r(f.armL), w: 12, h: 8, k: 'D' }, // bras lointain
          { x: x + 56, y: top + 21 + r(f.armR), w: 10, h: 8, k: 'B' }, // bras proche
        ]
      : [{ x: x - 9, y: top + 12 + r(f.armL), w: 9, h: 10, k: 'D' }]; // bras gauche, côté flanc
  const torso: Rect[] = [
    ...arms,
    { x, y: top, w: 2 * C, h: 5 * C, k: 'D' }, // flanc
    { x: x + 2 * C, y: top, w: 6 * C, h: 5 * C, k: 'B' }, // face
  ];
  // Dalle : le flanc est ombré d'une trame (un pixel d'encre sur deux en
  // quinconce, une ligne sur deux) — du gris façon Game Boy, net en 1:1.
  const seam: Rect[] = [];
  for (let dy = 1; dy < 5 * C; dy += 2)
    for (let dx = (dy >> 1) & 1; dx < 2 * C - 1; dx += 2) seam.push(ink(x + dx, top + dy, 1, 1));
  return { legs, torso, seam };
}

/** Toutes les couches de Clawd pour une image de la couche idle. */
export function clawdLayers(look: Look, mode: Mode, f: IdleFrame = REST): Layer[] {
  const r = (v: number) => (mode === 'mono' ? Math.round(v) : v);
  const x = r(f.dx);
  const feet = r(f.bob);
  const torsoY = r(f.bob + f.squash); // le corps se tasse sur ses pattes
  // L'ordinateur de profil et la loupe font tourner Clawd de 3/4 (visuels officiels).
  const side = SIDE_ACCESSORIES.includes(look.accessory ?? 'none');
  const body = side ? sideBody(look, f, r) : frontBody(look, f, r);
  const face = side ? SIDE : FRONT;
  const lid = mode === 'mono' ? (f.blink >= 0.5 ? 1 : 0) : f.blink;
  const features = [
    ...(mode === 'color' ? blush(look, face) : []),
    ...(mode === 'mono' ? body.seam : []),
    ...shift(eyes(look.eyes, lid, face), r(f.lookX), r(f.lookY)),
    ...shift(mouth(look.mouth, f, mode === 'mono'), face.mouthDx, face.mouthDy),
  ];
  // Chapeaux et objets tenus suivent le haut du corps ; skate, ballon et
  // ordinateur de profil, le sol. De 3/4, les chapeaux suivent la tête décalée
  // (centrés sur le corps entier, flanc compris).
  const props = propLayers(look, mode, f, r(f.armR));
  const move = (layers: Layer[], dx: number, dy: number) => layers.map((l) => ({ ...l, rects: shift(l.rects, dx, dy) }));
  const [hx, hy] = side ? [QUARTER.x + 4 * C - ANCHORS.cx, QUARTER.top - ANCHORS.top] : [0, 0];
  return [
    { rects: shift(body.legs, x, feet), outline: STICKER },
    { rects: shift(body.torso, x, torsoY), outline: STICKER },
    { rects: shift(features, x, torsoY) },
    ...move(props.ground, x, feet),
    ...move(props.hat, x + hx, torsoY + hy),
    ...move(props.head, x, torsoY),
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
