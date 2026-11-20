import { ANCHORS as A, QUARTER } from './clawd-grid.js';
import type { IdleFrame } from './idle.js';
import type { ClawdAccessory, ClawdEyes, ClawdOverhead } from './look.js';
import { bitmap, type Layer, type Mode, type Rect, type Ring, type Swatch } from './pixel.js';

/* ------------------------------------------------------------------------- *
 * Accessoires et chapeaux de Clawd, en pixel art (module isomorphe).
 * Toutes les positions partent des ANCRAGES de la grille (clawd-grid.ts) :
 * changer la grille ne casse pas les accessoires.
 *
 * N&B : les objets ont le liseré noir du sticker, leur trait `k` intérieur
 * reste noir ; les détails fins et flottants (Z, notes, pluie, vapeur, ficelle,
 * hampe, rayons, étincelles) sont en ENCRE et sans liseré (sinon ils
 * s'épaissiraient en pâté).
 * Animations : continues sur le web (`f.t`), pas à pas sur la dalle
 * (`f.step`). Boucles de 1, 2 ou 4 s (le GIF e-paper boucle sur 4 s).
 * ------------------------------------------------------------------------- */

export const PROP_PALETTE: Record<string, Swatch> = {
  k: { color: '#2A1E18', mono: 'ink' }, // trait sombre (dans les objets)
  w: { color: '#FFFFFF', mono: 'paper' },
  g: { color: '#D6D1C7', mono: 'paper' }, // gris clair
  G: { color: '#9A958B', mono: 'paper' }, // gris (antenne, manche, ficelle)
  d: { color: '#3F3D39', mono: 'ink' }, // écran (noir, code blanc)
  l: { color: '#8BC76F', mono: 'paper' }, // code vert
  y: { color: '#F2C14E', mono: 'paper' }, // jaune
  Y: { color: '#C98A1F', mono: 'ink' }, // or foncé
  r: { color: '#E0533C', mono: 'ink' }, // rouge
  p: { color: '#B38CF7', mono: 'paper' }, // violet Claude
  P: { color: '#8660DC', mono: 'ink' }, // violet foncé
  u: { color: '#4A86C8', mono: 'paper' }, // bleu
  U: { color: '#2F5E96', mono: 'ink' }, // bleu foncé
  c: { color: '#8FD0FF', mono: 'ink' }, // pluie
  n: { color: '#7A5236', mono: 'ink' }, // bois
  L: { color: '#C9B8FF', mono: 'ink' }, // Z, notes
  S: { color: '#EDE6DC', mono: 'ink' }, // vapeur
  o: { color: '#D97757', mono: 'paper' }, // orange Claude (déco)
  a: { color: '#E6F4FF', mono: 'paper' }, // verre de la loupe
  i: { color: '#6E6FD3', mono: 'ink' }, // cerclage et manche de la loupe (sticker détective)
  h: { color: '#8B6A4A', mono: 'paper' }, // ruban du chapeau de détective
};

/** Couches d'accessoires, avec leur ancrage (tête ou sol). */
export interface Props {
  /** Suivent le haut du corps (objets tenus). */
  head: Layer[];
  /** Au-dessus de la tête (chapeaux, bulles) : suivent le haut du corps, et
   * la tête décalée quand Clawd est de 3/4. */
  hat: Layer[];
  /** Restent au sol (skate, ballon). */
  ground: Layer[];
}

/** Accessoires qui font tourner Clawd de 3/4 (cf. `QUARTER`, clawd.ts). */
export const SIDE_ACCESSORIES: readonly ClawdAccessory[] = ['laptop-side', 'magnifier'];

/** Objets : même sticker que le corps (web : blanc 3 px ; dalle : liseré noir 2 px). */
const O: Partial<Record<Mode, readonly Ring[]>> = { color: [[3, 'paper']], mono: [[2, 'ink']] };
/** Bulle de pensée : contour de 2 px partout, sinon l'anneau blanc de 3 px du
 * web recollerait la petite bulle à la grande. */
const O_PUFF: Partial<Record<Mode, readonly Ring[]>> = { color: [[2, 'paper']], mono: [[2, 'ink']] };
/** Détails fins et flottants : léger contour blanc sur le web ; encre pleine sur la dalle. */
const O_THIN: Partial<Record<Mode, readonly Ring[]>> = { color: [[2, 'paper']] };

const frac = (v: number) => v - Math.floor(v);

function anim(mode: Mode, f: IdleFrame) {
  return {
    /** Phase 0→1 d'une boucle de `period` s : continue (web) ou pas à pas (dalle). */
    phase: (period: number, offset = 0) =>
      mode === 'mono' ? frac(Math.floor(f.step) / period + offset) : frac(f.t / period + offset),
    /** Image n°i d'une animation à `fps` images/s sur `count` images (pixel art). */
    frame: (count: number, fps = 1) => Math.floor((mode === 'mono' ? f.step : f.t) * fps) % count,
    mono: mode === 'mono',
  };
}

const layer = (rects: Rect[], outline = O): Layer =>
  outline === O_THIN ? { rects, outline, solid: { mono: 'ink' } } : { rects, outline };
const fade = (rects: Rect[], opacity: number) => rects.map((r) => ({ ...r, opacity }));

/* ------------------------------- objets tenus ------------------------------ */

const MUG = ['kkkkkk..', 'kwwwwk..', 'kwwwwkkk', 'kooook.k', 'kwwwwkkk', 'kwwwwk..', '.kkkk...'];
const WISP = ['.S', 'S.', '.S'];
const LAPTOP = [
  '.kkkkkkkkkkkkkk.',
  '.kddddddddddddk.',
  '.kdlllldddddddk.',
  '.kddddddddddddk.',
  '.kdlllllllldddk.',
  '.kddddddddddddk.',
  '.kddddddddddddk.', // ligne en cours de frappe (dessinée à part)
  '.kkkkkkkkkkkkkk.',
  'kGGGGGGGGGGGGGGk',
  'kkkkkkkkkkkkkkkk',
];
/** Ligne de code tapée sur l'ordinateur : longueur (en pixels ×2) à chaque image. */
const TYPED = [1, 3, 5, 7];
// Loupe 10×10 (×2) : cerclage `i` (indigo du sticker détective), verre `a`.
const LENS = [
  '...iiii...',
  '.iiaaaaii.',
  '.iaaaaaai.',
  'iaaaaaaaai',
  'iaaaaaaaai',
  'iaaaaaaaai',
  'iaaaaaaaai',
  '.iaaaaaai.',
  '.iiaaaaii.',
  '...iiii...',
];
const BALL = ['..kkk..', '.kwkwk.', 'kwkwkwk', 'kkwkwkk', 'kwkwkwk', '.kwkwk.', '..kkk..'];
const STAR = ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'];
const HEART = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];

function accessory(kind: ClawdAccessory | undefined, mode: Mode, f: IdleFrame, armR: number, eyes?: ClawdEyes): Omit<Props, 'hat'> {
  const a = anim(mode, f);
  const hand = A.armTop + armR; // haut de la main droite
  switch (kind) {
    case 'coffee': {
      const mug = bitmap(MUG, A.handR - 4, hand, 2);
      const steam = [0, 1].flatMap((i) => {
        const u = a.phase(2, i / 2);
        return fade(bitmap(WISP, A.handR - 2 + i * 6, Math.round(hand - 4 - 8 * u), 2), a.mono ? 1 : Math.sin(Math.PI * u));
      });
      return { head: [layer(mug), layer(steam, O_THIN)], ground: [] };
    }
    case 'laptop': {
      // La dernière ligne de code s'écrit mot à mot (dalle : un pas par seconde),
      // le curseur la suit (il clignote en plus sur le web).
      const x = A.cx - 16, y = A.bottom - 16;
      const len = TYPED[a.mono ? a.frame(4, 1) : a.frame(4, 2)];
      const typed: Rect[] = [{ x: x + 6, y: y + 12, w: 2 * len, h: 2, k: 'l' }];
      const cursor: Rect[] = a.mono || !a.frame(2, 4) ? [{ x: x + 8 + 2 * len, y: y + 12, w: 2, h: 2, k: 'l' }] : [];
      return { head: [layer([...bitmap(LAPTOP, x, y, 2), ...typed, ...cursor])], ground: [] };
    }
    case 'magnifier': {
      // Le sticker du détective : Clawd de 3/4, la loupe devant l'œil droit
      // (qui y paraît énorme), débordant de la face ; elle suit le regard, le
      // manche descend hors du corps, vers la main cachée.
      const r = (v: number) => (a.mono ? Math.round(v) : v);
      const lx = QUARTER.x + 43 + r(f.lookX), ly = QUARTER.top + 3 + r(f.lookY);
      const glass = bitmap(LENS, lx, ly, 2).map((g) => (g.k === 'a' && !a.mono ? { ...g, opacity: 0.75 } : g));
      // Œil grossi (10 px au lieu de 7), fermé si l'œil droit l'est ; il cligne avec l'autre.
      const closed = eyes === 'sleep' || eyes === 'wink';
      const lid = a.mono ? (f.blink >= 0.5 ? 1 : 0) : f.blink;
      const hh = closed ? 3 : Math.max(3, 10 * (1 - lid));
      const eye: Rect[] = [{ x: lx + 5, y: ly + (closed ? 11 : 5 + (10 - hh) / 2), w: 10, h: hh, k: 'k' }];
      const glint: Rect[] = a.mono ? [] : [{ x: lx + 3, y: ly + 6, w: 2, h: 4, k: 'w', opacity: 0.9 }];
      // Manche : quatre tronçons jointifs en diagonale, le dernier plus épais (la poignée).
      const handle: Rect[] = [0, 1, 2, 3].map((i) => ({
        x: lx + 17 + 3 * i,
        y: ly + 17 + 3 * i,
        w: i === 3 ? 4 : 3,
        h: i === 3 ? 4 : 3,
        k: 'i',
      }));
      return { head: [layer(handle), layer([...glass, ...eye, ...glint])], ground: [] };
    }
    case 'laptop-side': {
      // L'ordinateur du GIF officiel, posé au sol et vu de profil : un socle,
      // un écran incliné vers Clawd (qui se tourne de 3/4 pour taper dessus,
      // cf. clawd.ts). Un simple trait, comme dans le GIF : encre sur la dalle.
      const x = QUARTER.laptop, g = A.ground;
      const base: Rect = { x, y: g - 3, w: 22, h: 3, k: 'G' };
      const screen: Rect[] = [0, 1, 2, 3, 4].map((i) => ({ x: x + 19 + 3 * i, y: g - 6 - 3 * i, w: 4, h: 4, k: 'G' }));
      return { head: [], ground: [layer([base, ...screen], O_THIN)] };
    }
    case 'ball':
      return { head: [], ground: [layer(bitmap(BALL, A.handR - 3, A.ground - 14, 2))] };
    case 'wand': {
      const stick: Rect[] = [0, 1, 2, 3, 4].map((i) => ({ x: A.handR - 3 + 2 * i, y: hand - 2 - 2 * i, w: 3, h: 3, k: 'n' }));
      const star = bitmap(STAR, A.handR + 3, hand - 20, 2);
      const tw = a.frame(2, 2);
      const glints: Rect[] = [
        { x: tw ? A.handR : A.handR + 13, y: hand - (tw ? 22 : 4), w: 2, h: 2, k: 'y' },
        { x: tw ? A.handR + 12 : A.handR + 1, y: hand - (tw ? 26 : 8), w: 2, h: 2, k: 'w' },
      ];
      return { head: [layer(stick, O_THIN), layer(star), layer(glints, O_THIN)], ground: [] };
    }
    case 'heart': {
      // Cœur-ballon qui flotte au bout de sa ficelle, tenue par la main droite.
      const float = Math.round(a.mono ? (f.step % 2) * -2 : -2 * (0.5 - 0.5 * Math.cos(2 * Math.PI * a.phase(2))));
      const heart = bitmap(HEART, A.handR - 7, 14 + float, 2);
      const string: Rect[] = [{ x: A.handR, y: 26 + float, w: 1, h: hand - 26 - float, k: 'G' }];
      return { head: [layer(string, O_THIN), layer(heart)], ground: [] };
    }
    case 'skateboard': {
      const g = A.ground;
      const deck: Rect[] = [
        { x: 18, y: g, w: 82, h: 4, k: 'n' },
        { x: 15, y: g - 3, w: 4, h: 4, k: 'n' },
        { x: 99, y: g - 3, w: 4, h: 4, k: 'n' },
      ];
      const wheels: Rect[] = [26, 84].flatMap((x) => [
        { x, y: g + 4, w: 8, h: 6, k: 'y' },
        { x: x + 3, y: g + 6, w: 2, h: 2, k: 'Y' },
      ]);
      return { head: [], ground: [layer([...deck, ...wheels])] };
    }
    case 'flag': {
      // Le drapeau à damier du GIF officiel, tenu à bout de bras levé, qui ondule.
      const hx = A.flagHand.x + 5, top = 15 + Math.min(0, armR);
      const pole: Rect[] = [{ x: hx, y: top, w: 2, h: A.flagHand.y - top + Math.min(0, armR), k: 'G' }];
      const cloth: Rect[] = [];
      for (let c = 0; c < 7; c++) {
        const wave = a.mono ? [0, 1, 0, -1][(f.step + c) % 4] : Math.round(1.5 * Math.sin(2 * Math.PI * (f.t * 1.2) - c * 0.9));
        for (let r = 0; r < 5; r++) cloth.push({ x: hx + 2 + c * 2, y: top + r * 2 + wave, w: 2, h: 2, k: (c + r) % 2 ? 'k' : 'w' });
      }
      return { head: [layer(pole, O_THIN), layer(cloth)], ground: [] };
    }
    default:
      return { head: [], ground: [] };
  }
}

/* --------------------------------- chapeaux -------------------------------- */

// L'étincelle de Claude (✻), deux images qui alternent.
const SPARK_A = ['...p...', '.p.p.p.', '..ppp..', 'ppppppp', '..ppp..', '.p.p.p.', '...p...'];
const SPARK_B = ['.......', '...p...', '..ppp..', '.ppppp.', '..ppp..', '...p...', '.......'];
const CONE = ['....y....', '...yyy...', '...yry...', '..yyyyy..', '..yrrry..', '.yyyyyyy.', '.yyrrryy.', 'YYYYYYYYY'];
const Z = ['LLLL', '..L.', '.L..', 'LLLL'];
const SUN = ['.yyyy.', 'yyyyyy', 'yyyyyy', 'yyyyyy', 'yyyyyy', '.yyyy.'];
const NOTE = ['..LL', '..LL', '..L.', 'LLL.', 'LLL.'];
/** Mots de la bulle de parole : [x, y, largeur] relatifs à la bulle, dans l'ordre d'écriture. */
const SPEECH_WORDS = [
  [5, 5, 9],
  [16, 5, 9],
  [5, 11, 6],
  [13, 11, 11],
] as const;
const BULB = ['..yyy..', '.yyyyy.', 'yywyyyy', 'ywyyyyy', 'yyyyyyy', '.yyyyy.', '..ggg..', '..GGG..'];

/** Chapeaux et objets au-dessus de la tête (coordonnées : tête en haut à y = A.top). */
function overhead(kind: ClawdOverhead | undefined, mode: Mode, f: IdleFrame): Layer[] {
  const a = anim(mode, f);
  const cx = A.cx, top = A.top;
  switch (kind) {
    case 'sparkle-hat': {
      // Le chapeau officiel « Claude is wearing a hat today » : deux étages violets,
      // une antenne, l'étincelle au bout.
      const hat: Rect[] = [
        { x: cx - 15, y: top - 9, w: 30, h: 7, k: 'p' },
        { x: cx - 15, y: top - 2, w: 30, h: 2, k: 'P' }, // base foncée : détache le chapeau de la tête
        { x: cx - 9, y: top - 16, w: 18, h: 7, k: 'p' },
      ];
      const antenna: Rect[] = [{ x: cx - 1, y: top - 20, w: 2, h: 4, k: 'G' }];
      const spark = bitmap(a.frame(2, 2) ? SPARK_B : SPARK_A, cx - 3, top - 27, 1);
      return [layer(hat), layer([...antenna, ...spark], O_THIN)];
    }
    case 'detective': {
      // Chapeau de détective (sticker officiel « loupe ») : calotte pincée et
      // bord sombres, ruban brun (blanc sur la dalle).
      const hat: Rect[] = [
        { x: cx - 11, y: top - 16, w: 9, h: 3, k: 'd' }, // calotte pincée : deux bosses
        { x: cx + 2, y: top - 16, w: 9, h: 3, k: 'd' },
        { x: cx - 13, y: top - 13, w: 26, h: 6, k: 'd' },
        { x: cx - 13, y: top - 7, w: 26, h: 3, k: 'h' }, // ruban
        { x: cx - 22, y: top - 4, w: 44, h: 4, k: 'd' }, // bord
      ];
      return [layer(hat)];
    }
    case 'party': {
      const hop = a.frame(2, 2) ? -2 : 0; // le pompon sautille
      return [layer([...bitmap(CONE, cx - 9, top - 16, 2), { x: cx - 2, y: top - 19 + hop, w: 4, h: 3, k: 'r' }])];
    }
    case 'zzz': {
      // Trois Z qui s'envolent en grossissant (web) ; z, zZ, zZZ puis rien (dalle).
      if (a.mono) {
        const shown = [1, 2, 3, 0][f.step % 4];
        const pos = [[92, top - 2, 1], [99, top - 13, 2], [106, top - 28, 2]] as const;
        return [layer(pos.slice(0, shown).flatMap(([x, y, s]) => bitmap(Z, x, y, s)), O_THIN)];
      }
      const zs = [0, 1, 2].flatMap((i) => {
        const u = a.phase(2, i / 3);
        return fade(bitmap(Z, Math.round(90 + 18 * u), Math.round(top - 34 * u), u < 0.5 ? 1 : 2), Math.sin(Math.PI * u));
      });
      return [layer(zs, O_THIN)];
    }
    case 'sun': {
      // Cœur 12 px (anneau N&B jusqu'à 11 px du centre), rayons au-delà : visibles partout.
      const sx = 100, sy = 18;
      const rays: Rect[] =
        a.frame(2, 1) === 0
          ? [
              { x: sx - 1, y: sy - 17, w: 2, h: 4, k: 'y' },
              { x: sx - 1, y: sy + 13, w: 2, h: 4, k: 'y' },
              { x: sx - 17, y: sy - 1, w: 4, h: 2, k: 'y' },
              { x: sx + 13, y: sy - 1, w: 4, h: 2, k: 'y' },
            ]
          : [
              { x: sx - 13, y: sy - 13, w: 3, h: 3, k: 'y' },
              { x: sx + 10, y: sy - 13, w: 3, h: 3, k: 'y' },
              { x: sx - 13, y: sy + 10, w: 3, h: 3, k: 'y' },
              { x: sx + 10, y: sy + 10, w: 3, h: 3, k: 'y' },
            ];
      return [layer(bitmap(SUN, sx - 6, sy - 6, 2)), layer(rays, O_THIN)];
    }
    case 'umbrella': {
      const canopy: Rect[] = [
        { x: cx - 13, y: top - 24, w: 26, h: 4, k: 'u' },
        { x: cx - 23, y: top - 20, w: 46, h: 4, k: 'u' },
        { x: cx - 30, y: top - 16, w: 60, h: 5, k: 'u' },
        { x: cx - 36, y: top - 11, w: 72, h: 5, k: 'u' },
        { x: cx - 2, y: top - 24, w: 4, h: 18, k: 'U' }, // panneaux
        { x: cx - 19, y: top - 16, w: 4, h: 10, k: 'U' },
        { x: cx + 15, y: top - 16, w: 4, h: 10, k: 'U' },
      ];
      const shaft: Rect[] = [
        { x: cx - 1, y: top - 28, w: 2, h: 4, k: 'G' }, // pointe
        { x: cx - 1, y: top - 6, w: 2, h: 6, k: 'G' }, // manche
      ];
      const drops: Rect[] = [
        [12, top - 16],
        [104, top - 18],
        [10, top + 10],
        [108, top + 8],
      ].map(([x, y], i) => {
        const u = a.phase(1, i / 4);
        return { x, y: Math.round(y + 16 * u), w: 2, h: 4, k: 'c', opacity: a.mono ? 1 : Math.sin(Math.PI * u) };
      });
      return [layer(canopy), layer([...shaft, ...drops], O_THIN)];
    }
    case 'headphones': {
      const set: Rect[] = [
        { x: cx - 22, y: top - 9, w: 44, h: 3, k: 'U' },
        { x: cx - 27, y: top - 6, w: 5, h: 3, k: 'U' },
        { x: cx + 22, y: top - 6, w: 5, h: 3, k: 'U' },
        { x: cx - 30, y: top - 3, w: 3, h: 9, k: 'U' },
        { x: cx + 27, y: top - 3, w: 3, h: 9, k: 'U' },
        { x: cx - 35, y: top + 5, w: 9, h: 15, k: 'u' }, // coussinets
        { x: cx + 26, y: top + 5, w: 9, h: 15, k: 'u' },
        { x: cx - 33, y: top + 8, w: 3, h: 9, k: 'U' },
        { x: cx + 30, y: top + 8, w: 3, h: 9, k: 'U' },
      ];
      const notes = [0, 1].flatMap((i) => {
        const u = a.phase(2, i / 2);
        const op = a.mono ? (f.step % 2 === i ? 1 : 0) : Math.sin(Math.PI * u);
        return fade(bitmap(NOTE, i ? 102 : 8, Math.round(top - 4 - 20 * u), 2), op);
      });
      return [layer(set), layer(notes, O_THIN)];
    }
    case 'hardhat': {
      const hat: Rect[] = [
        { x: cx - 15, y: top - 14, w: 30, h: 4, k: 'y' },
        { x: cx - 21, y: top - 10, w: 42, h: 6, k: 'y' },
        { x: cx - 30, y: top - 4, w: 60, h: 4, k: 'Y' }, // rebord foncé : sépare le casque de la tête
        { x: cx - 2, y: top - 14, w: 4, h: 10, k: 'Y' }, // arête
      ];
      return [layer(hat)];
    }
    case 'lightbulb': {
      const on = a.mono ? f.step % 2 === 0 : Math.sin(2 * Math.PI * f.t) > -0.3;
      const bulb = bitmap(BULB, cx - 7, top - 28, 2);
      const glow: Rect[] = on
        ? [
            { x: cx - 15, y: top - 26, w: 4, h: 2, k: 'y' },
            { x: cx + 11, y: top - 26, w: 4, h: 2, k: 'y' },
            { x: cx - 17, y: top - 16, w: 4, h: 2, k: 'y' },
            { x: cx + 13, y: top - 16, w: 4, h: 2, k: 'y' },
          ]
        : [];
      return [layer(bulb), layer(glow, O_THIN)];
    }
    case 'bubble': {
      // Bulle de PENSÉE (comme le sticker officiel) : ronde, reliée à la tête
      // par une petite bulle détachée — rien à voir avec la bulle de parole,
      // rectangulaire et pointue. Les points y apparaissent un à un
      // (« Claude réfléchit… »). Assez bas pour garder l'anneau N&B dans le
      // cadre en plein saut.
      const x = 84, y = 7;
      const bubble: Rect[] = [
        { x: x + 6, y, w: 16, h: 16, k: 'w' },
        { x: x + 2, y: y + 2, w: 24, h: 12, k: 'w' },
        { x, y: y + 5, w: 28, h: 6, k: 'w' },
      ];
      // Petite bulle à l'écart (5 px d'air : les deux anneaux N&B ne se touchent pas).
      const puff: Rect[] = [
        { x: x + 5, y: y + 21, w: 5, h: 5, k: 'w' },
        { x: x + 4, y: y + 22, w: 7, h: 3, k: 'w' },
      ];
      const shown = [1, 2, 3, 0][a.frame(4, 1)];
      const dots: Rect[] = [0, 1, 2].slice(0, shown).map((i) => ({ x: x + 6 + i * 7, y: y + 7, w: 3, h: 3, k: 'k' }));
      return [layer([...bubble, ...dots], O_PUFF), layer(puff, O_PUFF)];
    }
    case 'speech': {
      // Bulle de parole, queue pointue vers Clawd : les mots s'y écrivent un à
      // un sur deux lignes, puis on recommence (dalle : un mot par seconde).
      const x = 82, y = 9;
      const bubble: Rect[] = [
        { x: x + 2, y, w: 26, h: 18, k: 'w' },
        { x, y: y + 2, w: 30, h: 14, k: 'w' },
        { x: x + 4, y: y + 18, w: 6, h: 2, k: 'w' }, // queue
        { x: x + 2, y: y + 20, w: 4, h: 2, k: 'w' },
        { x, y: y + 22, w: 2, h: 2, k: 'w' },
      ];
      const shown = (a.mono ? a.frame(4, 1) : a.frame(4, 2)) + 1;
      const words: Rect[] = SPEECH_WORDS.slice(0, shown).map(([dx, dy, w]) => ({ x: x + dx, y: y + dy, w, h: 2, k: 'k' }));
      return [layer([...bubble, ...words])];
    }
    default:
      return [];
  }
}

/** Tous les accessoires d'un look pour une image de la couche idle. `armR` =
 * décalage de la main droite (les objets tenus suivent le bras). */
export function propLayers(
  look: { accessory?: ClawdAccessory; overhead?: ClawdOverhead; eyes?: ClawdEyes },
  mode: Mode,
  f: IdleFrame,
  armR: number,
): Props {
  const acc = accessory(look.accessory, mode, f, armR, look.eyes);
  return { head: acc.head, hat: overhead(look.overhead, mode, f), ground: acc.ground };
}
