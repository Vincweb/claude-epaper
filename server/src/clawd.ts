import { clawdColor } from './clawd-color.js';
import { REST, type IdleFrame } from './idle.js';
import type { ClawdAccessory, ClawdEyes, ClawdMouth, ClawdOverhead, Look } from './look.js';

/* ------------------------------------------------------------------------- *
 * Sprite vectoriel Clawd (viewBox 0 -15 240 240) — module ISOMORPHE : le serveur
 * s'en sert pour la dalle et les sprites générés, le web pour le rendu live.
 * Chaque dessin reçoit une image de la couche idle (`idle.ts`) : c'est ce qui
 * l'anime. Ce fichier = version N&B (dalle) ; couleur → `clawd-color.ts`.
 * ------------------------------------------------------------------------- */

export const INK = '#000000';
export const PAPER = '#ffffff';

/** Un pixel du carré mascotte e-paper (118 px) en unités de viewBox (240 de large). */
export const PX = 240 / 118;

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

/** Yeux fermés d'un clignement — seuls les yeux « ouverts » simples clignent
 * (heureux, spirales, croix, lunettes… n'ont pas de paupière à fermer). */
function blinkSvg(eyes: ClawdEyes): string | null {
  if (eyes === 'square') return eyesSvg('sleep');
  if (eyes === 'wide')
    return `<rect x="87" y="63" width="18" height="5" fill="${INK}"/><rect x="135" y="63" width="18" height="5" fill="${INK}"/>`;
  if (eyes === 'wink')
    return `<rect x="88" y="64" width="16" height="5" fill="${INK}"/><path d="M137 62 Q144 71 151 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  return null;
}

function mouthSvg(mouth?: ClawdMouth): string {
  if (mouth === 'line') return `<rect x="104" y="98" width="32" height="4" rx="1" fill="${INK}"/>`;
  if (mouth === 'open') return `<rect x="108" y="92" width="24" height="16" rx="4" fill="${INK}"/>`;
  if (mouth === 'kiss') return `<ellipse cx="114" cy="100" rx="5" ry="4" fill="${INK}"/>`;
  return '';
}

function sparkleSvg(cx: number, cy: number, color: string, len = 12, spin = 0): string {
  let s = '';
  for (let i = 0; i < 8; i++)
    s += `<rect x="${cx - 2}" y="${cy - len}" width="4" height="${len}" rx="2" fill="${color}" transform="rotate(${i * 45 + spin} ${cx} ${cy})"/>`;
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

/** Accessoires tenus/posés, en N&B. `step` =
 * seconde courante : curseur qui clignote, vapeur qui ondule, cœur qui bat… */
function accessorySvg(kind: ClawdAccessory | undefined, step: number): string {
  if (!kind || kind === 'none') return '';
  const odd = step % 2 === 1;
  switch (kind) {
    case 'laptop': {
      const cursor = odd ? '' : `<rect x="116" y="127" width="4" height="3" fill="${INK}"/>`;
      return `<rect x="78" y="138" width="84" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="86" y="104" width="68" height="36" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="90" y="108" width="60" height="28" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/><rect x="94" y="113" width="26" height="3" fill="${INK}"/><rect x="94" y="120" width="38" height="3" fill="${INK}"/><rect x="94" y="127" width="20" height="3" fill="${INK}"/>${cursor}`;
    }
    case 'coffee': {
      const rise = odd ? -2 * PX : 0; // la vapeur monte d'un pixel, redescend
      return `
        <ellipse cx="190" cy="105" rx="22" ry="4" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
        <rect x="174" y="80" width="30" height="22" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
        <line x1="175" y1="87" x2="203" y2="87" stroke="${INK}" stroke-width="1.5"/>
        <path d="M204 84 q10 1 10 7 q0 6 -10 7" fill="none" stroke="${INK}" stroke-width="2"/>
        <g fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" transform="translate(0 ${rise})">
          <path d="M182 76 q3 -4 0 -8"/><path d="M190 76 q${odd ? -3 : 3} -4 0 -8"/><path d="M198 76 q3 -4 0 -8"/>
        </g>`;
    }
    case 'ball':
      return `<circle cx="172" cy="156" r="18" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><polygon points="172,147 180,153 177,163 167,163 164,153" fill="${INK}"/><path d="M158 150 l4 5 M186 150 l-4 5 M166 170 l3 -4 M178 170 l-3 -4" stroke="${INK}" stroke-width="2"/>`;
    case 'wand': {
      // Manche diagonal + étoile 5 branches à la pointe + 2 étincelles qui alternent.
      const star = '223,38 227,50 238,50 229,58 233,70 223,62 213,70 217,58 208,50 219,50';
      const glint = INK;
      return `
        <rect x="194" y="64" width="6" height="40" rx="3" fill="${INK}" transform="rotate(38 197 84)"/>
        <polygon points="${star}" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        ${odd ? `<circle cx="236" cy="66" r="2.5" fill="${glint}"/>` : `<circle cx="208" cy="40" r="2.5" fill="${glint}"/>`}`;
    }
    case 'heart': {
      const px = odd ? 6 : 5; // battement : le cœur gonfle une seconde sur deux
      return pixelHeartSvg(217.5 - 3.5 * px, 77 - 3 * px, px, INK);
    }
    case 'skateboard': {
      const deck = PAPER;
      const wheel = PAPER;
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
function overheadSvg(kind: ClawdOverhead | undefined, step: number): string {
  if (!kind || kind === 'none') return '';
  const odd = step % 2 === 1;
  if (kind === 'zzz') {
    // Les Z apparaissent un à un (z, zZ, zZZ) puis s'effacent : boucle de 4 s.
    const zs = [
      `<text x="158" y="54" font-size="14">z</text>`,
      `<text x="170" y="40" font-size="18">Z</text>`,
      `<text x="186" y="24" font-size="24">Z</text>`,
    ];
    const shown = [1, 2, 3, 0][step % 4];
    return shown ? `<g fill="${INK}" font-family="monospace" font-weight="bold">${zs.slice(0, shown).join('')}</g>` : '';
  }
  if (kind === 'sparkle-hat')
    return `<rect x="90" y="34" width="60" height="8" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="100" y="20" width="40" height="14" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="110" y="10" width="20" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>${sparkleSvg(120, 7, INK, 6, odd ? 22.5 : 0)}`;
  if (kind === 'party')
    return `<polygon points="120,4 102,44 138,44" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><circle cx="120" cy="4" r="5" fill="${INK}"/><circle cx="114" cy="22" r="3" fill="${INK}"/><circle cx="125" cy="32" r="3" fill="${INK}"/>`;
  if (kind === 'sun') {
    const cx = 200, cy = 26, r = 13;
    let s = '';
    for (let i = 0; i < 8; i++)
      s += `<rect x="${cx - 1.5}" y="${cy - r - 8}" width="3" height="7" rx="1.5" fill="${INK}" transform="rotate(${i * 45 + (odd ? 22.5 : 0)} ${cx} ${cy})"/>`;
    return `${s}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  }
  if (kind === 'umbrella') {
    const cx = 120, base = 42, r = 40;
    const fall = odd ? 2 * PX : 0; // les gouttes tombent d'un cran une seconde sur deux
    return `<path d="M${cx - r} ${base} A${r} ${r} 0 0 1 ${cx + r} ${base} Z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M${cx} ${base - r} L${cx - r} ${base} M${cx} ${base - r} L${cx} ${base} M${cx} ${base - r} L${cx + r} ${base}" stroke="${INK}" stroke-width="2"/><rect x="${cx - 1.5}" y="${base}" width="3" height="8" fill="${INK}"/><g stroke="${INK}" stroke-width="3" stroke-linecap="round" transform="translate(0 ${fall})"><path d="M64 26 l0 7"/><path d="M176 24 l0 7"/><path d="M74 40 l0 7"/><path d="M170 12 l0 7"/></g>`;
  }
  return '';
}

/** Des accessoires s'animent-ils seuls (indépendamment du mouvement du corps) ?
 * Leurs boucles font 2 ou 4 s ; le sprite boucle alors sur un multiple de 4 s. */
export function hasAnimatedExtras(look: Look): boolean {
  return (
    ['zzz', 'sparkle-hat', 'sun', 'umbrella', 'party'].includes(look.overhead ?? 'none') ||
    ['laptop', 'coffee', 'wand', 'heart'].includes(look.accessory ?? 'none')
  );
}

/**
 * Clawd dans une image de la couche idle. Deux dessins des MÊMES pièces :
 *  - N&B (dalle) : pixel art 118 px, contour « sticker », chaque décalage arrondi
 *    au pixel (pas de bord qui « respire » d'un demi-pixel) ;
 *  - couleur (web, GIF) : `clawd-color.ts` — dégradés, reflets, mouvement continu.
 */
export function clawdSvg(look: Look, mono: boolean, f: IdleFrame = REST): string {
  return mono ? clawdMono(look, f) : clawdColor(look, f);
}

function clawdMono(look: Look, f: IdleFrame): string {
  const u = (px: number) => Math.round(px) * PX;
  const x = u(f.dx);
  const top = u(f.bob + f.squash); // haut du corps (tassement compris)
  const feet = u(f.bob); // les pieds ne suivent que le saut
  const legH = 22 + feet - top;
  const body = PAPER;
  const eyes = (f.blink >= 0.5 && blinkSvg(look.eyes)) || eyesSvg(look.eyes);
  const torso = `
    <rect x="60" y="40" width="120" height="88" fill="${body}"/>
    <rect x="42" y="${80 + u(f.armL)}" width="18" height="26" fill="${body}"/>
    <rect x="180" y="${80 + u(f.armR)}" width="18" height="26" fill="${body}"/>
    <g transform="translate(${u(f.lookX)} ${u(f.lookY)})">${eyes}</g>${mouthSvg(look.mouth)}`;
  const legs = `
    <rect x="${88 + x}" y="${128 + top}" width="12" height="${legH}" fill="${body}"/>
    <rect x="${140 + x}" y="${128 + top}" width="12" height="${legH}" fill="${body}"/>`;
  // Accessoires & objets rendus HORS du filtre mono : line-art net et fin, non
  // épaissi par la dilatation qui donne au corps son contour « sticker ».
  // Ce qui est posé au sol (skate, ballon) suit les pieds, le reste suit le corps.
  const grounded = look.accessory === 'skateboard' || look.accessory === 'ball';
  const acc = accessorySvg(look.accessory, f.step);
  const extras = `<g transform="translate(${x} ${top})">${overheadSvg(look.overhead, f.step)}${grounded ? '' : acc}</g>${grounded ? `<g transform="translate(${x} ${feet})">${acc}</g>` : ''}`;
  return `<g filter="url(#mono)"><g transform="translate(${x} ${top})">${torso}</g>${legs}</g>${extras}`;
}

// radius élevé : à petite taille le contour resterait trop fin pour l'e-ink.
export const MONO_FILTER = `<filter id="mono" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/><feFlood flood-color="${INK}" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

/** Cadrage commun : Clawd dans un carré, un peu d'air au-dessus pour les chapeaux. */
export const CLAWD_VIEWBOX = '0 -15 240 240';

/** Clawd seul dans un canvas CARRÉ (fond transparent) — base des sprites.
 * N&B : `crispEdges` (aucun gris, binarisation e-ink fidèle). Couleur : anti-aliasé. */
export function clawdStandaloneSvg(look: Look, mono: boolean, f: IdleFrame = REST): string {
  const crisp = mono ? ' shape-rendering="crispEdges" text-rendering="optimizeSpeed"' : '';
  const defs = mono ? `<defs>${MONO_FILTER}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CLAWD_VIEWBOX}"${crisp}>${defs}${clawdSvg(look, mono, f)}</svg>`;
}
