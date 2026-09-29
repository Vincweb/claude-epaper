import type { IdleFrame } from './idle.js';
import type { ClawdAccessory, ClawdEyes, ClawdMouth, ClawdOverhead, Look } from './look.js';

/* ------------------------------------------------------------------------- *
 * Clawd en COULEUR (dashboard web live, GIF web, widget iOS) — module isomorphe.
 * Mêmes pièces et mêmes coordonnées que la version N&B de la dalle (`clawd.ts`),
 * mais dessinées « propre » : orange Claude en dégradé, coins adoucis, reflets
 * dans les yeux, ombre au sol, et tout ce qui bouge en continu (courbes de
 * `idle.ts`, accessoires animés par `f.t`). Aucune dépendance au pixel : le web
 * l'affiche à 60 img/s, anti-aliasé, à n'importe quelle taille.
 *
 * Contrainte : toutes les boucles d'accessoires durent 1, 2 ou 4 s, pour que le
 * GIF exporté (boucle = multiple de 4 s) raccorde sans saut.
 * ------------------------------------------------------------------------- */

const PX = 240 / 118; // un pixel de la dalle, en unités de viewBox

const COL = {
  body: '#D97757', // orange Claude (même teinte que l'accent du dashboard)
  bodyTop: '#EC9A77',
  bodyBottom: '#BF5E3E',
  leg: '#B4573A',
  ink: '#2B1A12', // yeux, bouche, traits : brun très sombre plutôt que noir pur
  glint: '#FFF7F0',
  blush: '#F28B7D',
  tongue: '#E86A5F',
  // Extras hors du corps : teintes claires, lisibles sur le fond sombre du dashboard.
  zzz: '#C4B2FF',
  steam: '#EFE8DE',
  gold: '#F2C14E',
  goldDark: '#D89A2B',
  purple: '#A273F0',
  purpleDark: '#7C54D8',
  sparkle: '#EDE4FF',
  heart: '#E0533C',
  sky: '#4A86C8',
  skyDark: '#2F6AA0',
  rain: '#8FD0FF',
  steel: '#8A857C',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const frac = (n: number) => n - Math.floor(n);
/** Mise à l'échelle autour d'un point (resvg ignore `transform-origin`). */
const scaleAt = (cx: number, cy: number, sx: number, sy = sx) =>
  `translate(${r2(cx)} ${r2(cy)}) scale(${r2(sx * 1000) / 1000} ${r2(sy * 1000) / 1000}) translate(${r2(-cx)} ${r2(-cy)})`;

// Dégradé en coordonnées utilisateur : corps ET bras partagent le même éclairage.
// Ids fixes : plusieurs Clawd dans une même page déclarent des defs identiques.
const DEFS = `<defs><linearGradient id="clawd-body" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="128"><stop offset="0" stop-color="${COL.bodyTop}"/><stop offset="0.5" stop-color="${COL.body}"/><stop offset="1" stop-color="${COL.bodyBottom}"/></linearGradient><radialGradient id="clawd-shadow"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;

/* --------------------------------- visage --------------------------------- */

/** Yeux « ouverts » (carrés, grands) : la paupière les écrase verticalement et
 * le reflet s'efface — clignement progressif au lieu d'un échange d'image. */
function openEye(x: number, y: number, w: number, h: number, lid: number): string {
  const cy = y + h / 2;
  const g = w > 16 ? 5 : 4;
  const glint = lid < 0.6 ? `<rect x="${x + w - g - 2}" y="${y + 2}" width="${g}" height="${g}" rx="1.2" fill="${COL.glint}" opacity="${r2(1 - lid / 0.6)}"/>` : '';
  return `<g transform="${scaleAt(0, cy, 1, 1 - 0.82 * lid)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3.5" fill="${COL.ink}"/>${glint}</g>`;
}

function eyesColor(eyes: ClawdEyes, lid: number): string {
  const ink = COL.ink;
  switch (eyes) {
    case 'wide':
      return openEye(87, 54, 18, 20, lid) + openEye(135, 54, 18, 20, lid);
    case 'sleep':
      return `<g fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"><path d="M88 65 q8 6 16 0"/><path d="M136 65 q8 6 16 0"/></g>`;
    case 'happy':
      return `<g fill="none" stroke="${ink}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M89 58 L103 66 L89 74"/><path d="M151 58 L137 66 L151 74"/></g>`;
    case 'spiral': {
      const spiral = (cx: number, cy: number) => {
        let d = `M${cx} ${cy}`;
        for (let i = 1; i <= 26; i++) {
          const t = i / 26;
          const a = t * 2.2 * 2 * Math.PI;
          d += ` L${(cx + Math.cos(a) * t * 9).toFixed(1)} ${(cy + Math.sin(a) * t * 9).toFixed(1)}`;
        }
        return d;
      };
      return `<g fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"><path d="${spiral(96, 66)}"/><path d="${spiral(144, 66)}"/></g>`;
    }
    case 'wink':
      return `${openEye(89, 58, 14, 16, lid)}<path d="M137 63 Q144 71 151 63" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round"/>`;
    case 'cross':
      return `<g stroke="${ink}" stroke-width="5.5" stroke-linecap="round"><path d="M88 58 l14 14 M102 58 l-14 14"/><path d="M136 58 l14 14 M150 58 l-14 14"/></g>`;
    case 'shades':
      return `<rect x="80" y="55" width="27" height="19" rx="6" fill="${ink}"/><rect x="133" y="55" width="27" height="19" rx="6" fill="${ink}"/><rect x="105" y="61" width="30" height="4" rx="2" fill="${ink}"/><path d="M85 60 l7 0 M138 60 l7 0" stroke="${COL.glint}" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>`;
    default: // square
      return openEye(89, 58, 14, 16, lid) + openEye(137, 58, 14, 16, lid);
  }
}

function mouthColor(mouth?: ClawdMouth): string {
  const ink = COL.ink;
  if (mouth === 'line') return `<rect x="106" y="97" width="28" height="4.5" rx="2.25" fill="${ink}"/>`;
  if (mouth === 'open')
    return `<rect x="108" y="92" width="24" height="16" rx="7" fill="${ink}"/><ellipse cx="120" cy="104" rx="7" ry="3" fill="${COL.tongue}"/>`;
  if (mouth === 'kiss') return `<ellipse cx="114" cy="100" rx="5" ry="4.5" fill="${ink}"/>`;
  return '';
}

/** Joues roses : pour les mines joyeuses ou tendres. */
function blush(look: Look): string {
  if (!['happy', 'wink'].includes(look.eyes) && look.mouth !== 'kiss') return '';
  return `<g fill="${COL.blush}" opacity="0.55"><ellipse cx="77" cy="89" rx="8" ry="4.5"/><ellipse cx="163" cy="89" rx="8" ry="4.5"/></g>`;
}

/* ------------------------------- accessoires ------------------------------- */

const HEART_GRID = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
function heartSvg(cx: number, cy: number, px: number, fill: string): string {
  let s = '';
  const x0 = cx - 3.5 * px;
  const y0 = cy - 3 * px;
  HEART_GRID.forEach((row, r) =>
    row.split('').forEach((c, col) => {
      if (c === 'X') s += `<rect x="${x0 + col * px}" y="${y0 + r * px}" width="${px + 0.3}" height="${px + 0.3}" fill="${fill}"/>`;
    }),
  );
  return s;
}

function sparkle(cx: number, cy: number, len: number, color: string): string {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const l = i % 2 ? len * 0.55 : len;
    s += `<rect x="${cx - 1.6}" y="${r2(cy - l)}" width="3.2" height="${r2(l)}" rx="1.6" fill="${color}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
  }
  return `${s}<circle cx="${cx}" cy="${cy}" r="2.6" fill="${color}"/>`;
}

function accessoryColor(kind: ClawdAccessory | undefined, t: number): string {
  if (!kind || kind === 'none') return '';
  const ink = COL.ink;
  const wave = (period: number, phase = 0) => Math.sin(2 * Math.PI * (t / period + phase));
  switch (kind) {
    case 'laptop': {
      const cursor = Math.floor(t * 2) % 2 ? '' : `<rect x="116" y="127" width="4" height="3" fill="#7fb96b"/>`;
      return `<rect x="78" y="138" width="84" height="10" rx="2" fill="#8f8a80" stroke="${ink}" stroke-width="2"/><rect x="86" y="104" width="68" height="36" rx="3" fill="#c7c2b8" stroke="${ink}" stroke-width="2"/><rect x="90" y="108" width="60" height="28" rx="1.5" fill="#3f3d39"/><rect x="94" y="113" width="26" height="3" rx="1" fill="#7fb96b"/><rect x="94" y="120" width="38" height="3" rx="1" fill="#cfc9bd"/><rect x="94" y="127" width="20" height="3" rx="1" fill="#cfc9bd"/>${cursor}`;
    }
    case 'coffee': {
      // Trois volutes qui montent et s'estompent, décalées d'un tiers de cycle.
      let steam = '';
      for (let i = 0; i < 3; i++) {
        const u = frac(t / 2 + i / 3);
        const sway = r2(3 * Math.cos(2 * Math.PI * (u + i / 3)));
        steam += `<path d="M${182 + i * 8} ${r2(76 - 7 * u)} q${sway} -4 0 -8" opacity="${r2(0.9 * Math.sin(Math.PI * u))}"/>`;
      }
      return `
        <ellipse cx="190" cy="105" rx="22" ry="4" fill="#E6DED2" stroke="${ink}" stroke-width="1.5"/>
        <rect x="174" y="80" width="30" height="22" rx="4" fill="#F3EDE4" stroke="${ink}" stroke-width="2"/>
        <rect x="175" y="86" width="28" height="4" fill="${COL.body}"/>
        <path d="M204 84 q10 1 10 7 q0 6 -10 7" fill="none" stroke="${ink}" stroke-width="2.5"/>
        <g fill="none" stroke="${COL.steam}" stroke-width="2" stroke-linecap="round">${steam}</g>`;
    }
    case 'ball':
      return `<circle cx="172" cy="156" r="18" fill="#fff" stroke="${ink}" stroke-width="2"/><polygon points="172,147 180,153 177,163 167,163 164,153" fill="${ink}"/><path d="M158 150 l4 5 M186 150 l-4 5 M166 170 l3 -4 M178 170 l-3 -4" stroke="${ink}" stroke-width="2"/>`;
    case 'wand': {
      const star = '223,38 227,50 238,50 229,58 233,70 223,62 213,70 217,58 208,50 219,50';
      const glow = 0.5 + 0.5 * wave(2);
      return `
        <rect x="194" y="64" width="6" height="40" rx="3" fill="#5B4032" transform="rotate(38 197 84)"/>
        <g transform="${scaleAt(223, 54, 1 + 0.08 * wave(1))}"><polygon points="${star}" fill="${COL.gold}" stroke="${COL.goldDark}" stroke-width="2" stroke-linejoin="round"/></g>
        <circle cx="208" cy="40" r="2.6" fill="#FFE08A" opacity="${r2(glow)}"/>
        <circle cx="236" cy="66" r="2.2" fill="#FFE08A" opacity="${r2(1 - glow)}"/>`;
    }
    case 'heart': {
      const beat = Math.max(0, Math.sin(2 * Math.PI * t)) ** 6; // un battement par seconde
      return `<g transform="${scaleAt(217.5, 77, 1 + 0.16 * beat)}">${heartSvg(217.5, 77, 5, COL.heart)}</g>`;
    }
    case 'skateboard':
      // Remonté de 6 unités par rapport au N&B : les pieds posent vraiment sur la planche.
      return `<g transform="translate(0 -6)">
        <rect x="60" y="156" width="120" height="10" rx="5" fill="#5a2d2a" stroke="${ink}" stroke-width="2"/>
        <rect x="80" y="166" width="6" height="5" fill="${ink}"/><rect x="154" y="166" width="6" height="5" fill="${ink}"/>
        <rect x="70" y="169" width="20" height="16" rx="4" fill="#e0b34a" stroke="${ink}" stroke-width="2"/>
        <rect x="150" y="169" width="20" height="16" rx="4" fill="#e0b34a" stroke="${ink}" stroke-width="2"/></g>`;
    default:
      return '';
  }
}

function overheadColor(kind: ClawdOverhead | undefined, t: number): string {
  if (!kind || kind === 'none') return '';
  const ink = COL.ink;
  const wave = (period: number, phase = 0) => Math.sin(2 * Math.PI * (t / period + phase));
  if (kind === 'zzz') {
    // Trois Z qui s'envolent en grossissant puis s'effacent, en continu.
    let s = '';
    for (let i = 0; i < 3; i++) {
      const u = frac((t + (i * 2) / 3) / 2);
      const z = 7 + 9 * u;
      const cx = 160 + 30 * u;
      const cy = 58 - 48 * u;
      s += `<path d="M${r2(cx - z / 2)} ${r2(cy - z / 2)} h${r2(z)} l${r2(-z)} ${r2(z)} h${r2(z)}" stroke-width="${r2(2.2 + 1.4 * u)}" opacity="${r2(Math.sin(Math.PI * u))}"/>`;
    }
    return `<g fill="none" stroke="${COL.zzz}" stroke-linecap="round" stroke-linejoin="round">${s}</g>`;
  }
  if (kind === 'sparkle-hat') {
    const spin = 45 * t; // étoile symétrique à 45° : boucle de 1 s
    return `<rect x="90" y="33" width="60" height="9" rx="3" fill="${COL.purpleDark}"/><rect x="100" y="19" width="40" height="16" rx="3" fill="${COL.purple}"/><rect x="110" y="9" width="20" height="12" rx="3" fill="${COL.purple}"/><g transform="rotate(${r2(spin)} 120 6) ${scaleAt(120, 6, 1 + 0.15 * wave(1))}">${sparkle(120, 6, 7, COL.sparkle)}</g>`;
  }
  if (kind === 'party') {
    const tilt = 4 * wave(2);
    return `<g transform="rotate(${r2(tilt)} 120 44)"><polygon points="120,4 102,44 138,44" fill="${COL.gold}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><path d="M108 30 l18 -6 M112 38 l20 -6" stroke="${COL.heart}" stroke-width="3" stroke-linecap="round"/><circle cx="120" cy="4" r="5.5" fill="${COL.heart}"/></g>`;
  }
  if (kind === 'sun') {
    const cx = 200, cy = 26, r = 13;
    let rays = '';
    for (let i = 0; i < 8; i++)
      rays += `<rect x="${cx - 1.6}" y="${cy - r - 9}" width="3.2" height="7" rx="1.6" fill="${COL.gold}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="${COL.gold}" opacity="${r2(0.16 + 0.06 * wave(2))}"/><g transform="rotate(${r2(22.5 * t)} ${cx} ${cy})">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${COL.gold}" stroke="${COL.goldDark}" stroke-width="2"/>`;
  }
  if (kind === 'umbrella') {
    const cx = 120, base = 42, r = 40;
    let drops = '';
    [[64, 26], [176, 24], [74, 40], [170, 12]].forEach(([x, y], i) => {
      const u = frac(t + i / 4); // chute continue, une goutte par seconde et par filet
      drops += `<path d="M${x} ${r2(y - 8 + 16 * u)} l0 6" opacity="${r2(Math.sin(Math.PI * u))}"/>`;
    });
    return `<path d="M${cx - r} ${base} A${r} ${r} 0 0 1 ${cx + r} ${base} Z" fill="${COL.sky}" stroke="${COL.skyDark}" stroke-width="2" stroke-linejoin="round"/><path d="M${cx} ${base - r} Q${cx - 16} ${base - 18} ${cx - 14} ${base} M${cx} ${base - r} Q${cx + 16} ${base - 18} ${cx + 14} ${base}" fill="none" stroke="${COL.skyDark}" stroke-width="2"/><rect x="${cx - 1.5}" y="${base}" width="3" height="9" rx="1.5" fill="${COL.steel}"/><g stroke="${COL.rain}" stroke-width="3" stroke-linecap="round">${drops}</g>`;
  }
  return '';
}

/* ---------------------------------- corps ---------------------------------- */

/** Clawd en couleur dans une image de la couche idle. Le tassement devient un
 * vrai squash & stretch (écrasé en hauteur, élargi), ancré sur les hanches. */
export function clawdColor(look: Look, f: IdleFrame): string {
  const x = f.dx * PX;
  const feet = f.bob * PX;
  const sy = 1 - 0.028 * f.squash;
  const sx = 1 + 0.017 * f.squash;
  const headDrop = 88 * (1 - sy); // de combien le haut de la tête descend
  const lift = 1 + 0.035 * f.bob; // l'ombre rétrécit quand Clawd décolle
  const body = 'url(#clawd-body)';
  const torso = `
    <rect x="42" y="${r2(80 + f.armL * PX)}" width="24" height="26" rx="5" fill="${body}"/>
    <rect x="174" y="${r2(80 + f.armR * PX)}" width="24" height="26" rx="5" fill="${body}"/>
    <rect x="60" y="40" width="120" height="88" rx="8" fill="${body}"/>
    <rect x="70" y="45" width="100" height="5" rx="2.5" fill="#fff" opacity="0.16"/>
    ${blush(look)}
    <g transform="translate(${r2(f.lookX * PX)} ${r2(f.lookY * PX)})">${eyesColor(look.eyes, f.blink)}</g>${mouthColor(look.mouth)}`;
  const legs = `
    <rect x="${r2(88 + x)}" y="${r2(118 + feet)}" width="12" height="32" rx="3.5" fill="${COL.leg}"/>
    <rect x="${r2(140 + x)}" y="${r2(118 + feet)}" width="12" height="32" rx="3.5" fill="${COL.leg}"/>`;
  const shadow = `<ellipse cx="${r2(120 + x)}" cy="153" rx="${r2(62 * lift)}" ry="${r2(7 * lift)}" fill="url(#clawd-shadow)"/>`;
  // Chapeaux et objets tenus suivent la tête ; skate et ballon restent au sol.
  const grounded = look.accessory === 'skateboard' || look.accessory === 'ball';
  const acc = accessoryColor(look.accessory, f.t);
  const onHead = `<g transform="translate(${r2(x)} ${r2(feet + headDrop)})">${overheadColor(look.overhead, f.t)}${grounded ? '' : acc}</g>`;
  const onGround = grounded ? `<g transform="translate(${r2(x)} ${r2(feet)})">${acc}</g>` : '';
  return `${DEFS}${shadow}${legs}<g transform="translate(${r2(x)} ${r2(feet)}) ${scaleAt(120, 128, sx, sy)}">${torso}</g>${onGround}${onHead}`;
}
