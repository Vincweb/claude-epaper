// Génère les visuels du README (docs/*.png) : panneaux e-paper + planche des poses.
// Autonome (données d'exemple), rastérisation via resvg. Lancer : node scripts/gen-assets.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = '#141414';
const BLACK = '#000000';
const PAPER = '#ffffff';
const RED = '#d81e28';
const BASE = '#d97757';
const PURPLE = '#a273f0';
const SPARKLE = '#9b7cf0';
const STEEL = '#8a857c';

/* ------------------------------- sprite ------------------------------- */

function spiral(cx, cy) {
  let d = `M${cx} ${cy}`;
  for (let i = 1; i <= 26; i++) {
    const t = i / 26;
    const a = t * 2.2 * 2 * Math.PI;
    const r = t * 9;
    d += ` L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return d;
}

function eyes(kind) {
  switch (kind) {
    case 'wide':
      return `<rect x="87" y="54" width="18" height="20" fill="${INK}"/><rect x="135" y="54" width="18" height="20" fill="${INK}"/>`;
    case 'sleep':
      return `<rect x="88" y="64" width="16" height="5" fill="${INK}"/><rect x="136" y="64" width="16" height="5" fill="${INK}"/>`;
    case 'happy':
      return `<g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M89 58 L103 66 L89 74"/><path d="M151 58 L137 66 L151 74"/></g>`;
    case 'spiral':
      return `<g fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"><path d="${spiral(96, 66)}"/><path d="${spiral(144, 66)}"/></g>`;
    case 'wink':
      return `<rect x="89" y="58" width="14" height="16" fill="${INK}"/><path d="M137 62 Q144 71 151 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    case 'shades':
      return `<rect x="82" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="134" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="104" y="62" width="30" height="4" fill="${INK}"/><rect x="86" y="59" width="6" height="3" rx="1" fill="#fff" opacity="0.6"/><rect x="138" y="59" width="6" height="3" rx="1" fill="#fff" opacity="0.6"/>`;
    default:
      return `<rect x="89" y="58" width="14" height="16" fill="${INK}"/><rect x="137" y="58" width="14" height="16" fill="${INK}"/>`;
  }
}

function mouth(kind) {
  if (kind === 'kiss') return `<ellipse cx="114" cy="100" rx="5" ry="4" fill="${INK}"/>`;
  return '';
}

function heart(x, y, px, fill) {
  const G = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  let s = '';
  G.forEach((row, r) =>
    row.split('').forEach((c, col) => {
      if (c === 'X') s += `<rect x="${x + col * px}" y="${y + r * px}" width="${px}" height="${px}" fill="${fill}"/>`;
    }),
  );
  return s;
}

function sparkle(cx, cy, color, len = 12) {
  let s = '';
  for (let i = 0; i < 8; i++)
    s += `<rect x="${cx - 2}" y="${cy - len}" width="4" height="${len}" rx="2" fill="${color}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
  return s + `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`;
}

function accessory(kind) {
  switch (kind) {
    case 'laptop':
      return `<rect x="78" y="138" width="84" height="10" fill="#8f8a80"/><rect x="86" y="104" width="68" height="36" fill="#c7c2b8"/><rect x="90" y="108" width="60" height="28" fill="#3f3d39"/><rect x="94" y="113" width="26" height="3" fill="#7fb96b"/><rect x="94" y="120" width="38" height="3" fill="#cfc9bd"/><rect x="94" y="127" width="20" height="3" fill="#cfc9bd"/>`;
    case 'coffee':
      return `<rect x="196" y="78" width="22" height="22" fill="#b7b1a6" stroke="${INK}" stroke-width="2"/><path d="M218 83 q10 1 10 8 q0 7 -10 8" fill="none" stroke="${INK}" stroke-width="3"/><path d="M201 74 q3 -5 0 -9 M209 74 q3 -5 0 -9" fill="none" stroke="#cfc9bd" stroke-width="2" stroke-linecap="round"/>`;
    case 'ball':
      return `<circle cx="172" cy="156" r="18" fill="#fff" stroke="${INK}" stroke-width="2"/><polygon points="172,147 180,153 177,163 167,163 164,153" fill="${INK}"/><path d="M158 150 l4 5 M186 150 l-4 5 M166 170 l3 -4 M178 170 l-3 -4" stroke="${INK}" stroke-width="2"/>`;
    case 'wand': {
      let s = `<rect x="196" y="60" width="7" height="40" rx="2" fill="${INK}" transform="rotate(38 199 80)"/>`;
      const sp = [[222, 44], [230, 50], [214, 50], [226, 58], [218, 60], [234, 58], [228, 40], [236, 50], [210, 58]];
      sp.forEach(([x, y], i) => (s += `<rect x="${x}" y="${y}" width="6" height="6" fill="${i % 2 ? '#fff' : '#e0b34a'}"/>`));
      return s;
    }
    case 'heart':
      return heart(200, 62, 5, '#e0533c');
    default:
      return '';
  }
}

function overhead(kind) {
  if (kind === 'sparkle-hat')
    return `<rect x="92" y="22" width="56" height="18" fill="${PURPLE}"/><rect x="104" y="6" width="32" height="16" fill="${PURPLE}"/><rect x="118.5" y="-38" width="3" height="46" fill="${STEEL}"/>${sparkle(120, -44, SPARKLE)}`;
  if (kind === 'party')
    return `<polygon points="120,4 102,44 138,44" fill="#e0b34a" stroke="${INK}" stroke-width="2"/><circle cx="120" cy="4" r="5" fill="#e0533c"/><circle cx="114" cy="22" r="3" fill="#fff"/><circle cx="125" cy="32" r="3" fill="#e0533c"/>`;
  if (kind === 'zzz')
    return `<g fill="${INK}" font-family="monospace" font-weight="bold"><text x="158" y="54" font-size="14">z</text><text x="170" y="40" font-size="18">Z</text><text x="186" y="24" font-size="24">Z</text></g>`;
  if (kind === 'sun') {
    let s = '';
    for (let i = 0; i < 8; i++) s += `<rect x="200.5" y="-3" width="3" height="8" rx="1.5" fill="#f2c14e" transform="rotate(${i * 45} 202 22)"/>`;
    return s + `<circle cx="202" cy="22" r="15" fill="#f2c14e"/>`;
  }
  if (kind === 'umbrella')
    return `<rect x="118.5" y="-6" width="3" height="50" fill="${STEEL}"/><path d="M76 -6 A44 44 0 0 1 164 -6 Z" fill="#4a86c8" stroke="${INK}" stroke-width="2"/><path d="M120 -50 L76 -6 M120 -50 L120 -6 M120 -50 L164 -6" stroke="#2f6aa0" stroke-width="2"/><g stroke="#7cc4ff" stroke-width="3" stroke-linecap="round"><path d="M62 14 l0 8"/><path d="M178 20 l0 8"/><path d="M72 36 l0 8"/><path d="M172 6 l0 8"/></g>`;
  return '';
}

function bodyShapes(color) {
  return `<rect x="60" y="40" width="120" height="88" fill="${color}"/><rect x="42" y="80" width="18" height="26" fill="${color}"/><rect x="180" y="80" width="18" height="26" fill="${color}"/><rect x="88" y="128" width="12" height="22" fill="${color}"/><rect x="140" y="128" width="12" height="22" fill="${color}"/>`;
}

const TALL = ['party', 'zzz', 'sparkle-hat', 'sun', 'umbrella'];

// Clawd complet (couleur, contour sticker blanc) pour la planche.
function clawdFull(pose) {
  const vb = TALL.includes(pose.overhead) ? '0 -60 240 270' : '0 0 240 210';
  const inner = `${overhead(pose.overhead || 'none')}${bodyShapes(BASE)}${eyes(pose.eyes)}${mouth(pose.mouth)}${accessory(pose.accessory || 'none')}`;
  return { vb, svg: `<g filter="url(#sticker)">${inner}</g>` };
}

/* ------------------------------ panneau e-paper ------------------------------ */

function meterCells(x, y, value, cells = 6, cw = 12, ch = 12, gap = 3) {
  const filled = Math.round((value / 100) * cells);
  let s = '';
  for (let i = 0; i < cells; i++)
    s += `<rect x="${x + i * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" fill="${i < filled ? BLACK : PAPER}" stroke="${BLACK}" stroke-width="1.5"/>`;
  return s;
}

function bar(x, y, w, label, v, reset, red) {
  const fill = red && v >= 90 ? RED : BLACK;
  return `<text x="${x}" y="${y}" font-family="monospace" font-size="18" letter-spacing="1" fill="${BLACK}">${label}</text>
    <text x="${x + w}" y="${y}" text-anchor="end" font-family="monospace" font-weight="bold" font-size="34" fill="${BLACK}">${v}%</text>
    <rect x="${x}" y="${y + 12}" width="${w}" height="22" fill="${PAPER}" stroke="${BLACK}" stroke-width="3"/>
    <rect x="${x + 3}" y="${y + 15}" width="${(w - 6) * (v / 100)}" height="16" fill="${fill}"/>
    <text x="${x}" y="${y + 54}" font-family="monospace" font-size="15" fill="${BLACK}">reset ${reset}</text>`;
}

function panel(d) {
  const W = 800, H = 480, pad = 28, rx = 330, rw = W - rx - pad;
  const mono = d.palette === 'bw';
  const body = mono ? PAPER : RED;
  const clawd = `${d.overhead === 'zzz' ? overhead('zzz') : ''}<g${mono ? ' filter="url(#mono)"' : ''}>${bodyShapes(body)}${eyes(d.eyes)}</g>`;
  const title = d.title.toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="mono" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d"/><feFlood flood-color="${BLACK}" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <text x="${pad}" y="${pad + 26}" font-family="monospace" font-weight="bold" font-size="26" letter-spacing="4" fill="${BLACK}">CLAUDE CODE</text>
  <text x="${W - pad}" y="${pad + 24}" text-anchor="end" font-family="monospace" font-size="18" fill="${BLACK}">${d.time}</text>
  <rect x="${pad}" y="${pad + 40}" width="${W - 2 * pad}" height="3" fill="${BLACK}"/>
  <svg x="${pad}" y="90" width="290" height="255" viewBox="0 0 240 210">${clawd}</svg>
  <rect x="${pad + 20}" y="352" width="${title.length * 15 + 24}" height="30" fill="${BLACK}"/>
  <text x="${pad + 32}" y="373" font-family="monospace" font-weight="bold" font-size="16" letter-spacing="2" fill="${PAPER}">${title}</text>
  ${bar(rx, 130, rw, 'SESSION · 5 H', d.five, d.fiveReset, !mono)}
  ${bar(rx, 250, rw, 'SEMAINE · 7 J', d.seven, d.sevenReset, !mono)}
  <rect x="${pad}" y="${H - 70}" width="${W - 2 * pad}" height="3" fill="${BLACK}"/>
  <text x="${pad}" y="${H - 38}" font-family="monospace" font-weight="bold" font-size="18" fill="${BLACK}">NIVEAU ${d.level} · ${d.age}</text>
  <text x="${rx}" y="${H - 38}" font-family="monospace" font-size="15" fill="${BLACK}">REPU</text>${meterCells(rx + 55, H - 52, d.repu)}
  <text x="${rx + 200}" y="${H - 38}" font-family="monospace" font-size="15" fill="${BLACK}">JOIE</text>${meterCells(rx + 250, H - 52, d.joie)}
</svg>`;
}

function barCompact(x, y, w, label, v, reset, red, statLabel, statValue) {
  const fill = red && v >= 90 ? RED : BLACK;
  return `<text x="${x}" y="${y}" font-family="monospace" font-size="12" fill="${BLACK}">${label}</text>
    <text x="${x + w}" y="${y + 2}" text-anchor="end" font-family="monospace" font-weight="bold" font-size="20" fill="${BLACK}">${v}%</text>
    <rect x="${x}" y="${y + 6}" width="${w}" height="11" fill="${PAPER}" stroke="${BLACK}" stroke-width="2"/>
    <rect x="${x + 2}" y="${y + 8}" width="${(w - 4) * (v / 100)}" height="7" fill="${fill}"/>
    <text x="${x}" y="${y + 29}" font-family="monospace" font-size="10" fill="${BLACK}">reset ${reset}</text>
    ${statLine(x + 78, y + 23, statLabel, statValue)}`;
}

function cellsSmall(x, y, value, cells = 5, cw = 6, ch = 6, gap = 2) {
  const filled = Math.round((value / 100) * cells);
  let s = '';
  for (let i = 0; i < cells; i++)
    s += `<rect x="${x + i * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" fill="${i < filled ? BLACK : PAPER}" stroke="${BLACK}" stroke-width="1"/>`;
  return s;
}
function statLine(x, y, label, value) {
  return `<text x="${x}" y="${y + 6}" font-family="monospace" font-size="8" fill="${BLACK}">${label}</text>${cellsSmall(x + 26, y, value)}`;
}

function compactPanel(d) {
  const W = 250, H = 122, rx = 80, rw = 166;
  const mono = d.palette === 'bw';
  const body = mono ? PAPER : RED;
  const clawd = `${d.overhead === 'zzz' ? overhead('zzz') : ''}<g${mono ? ' filter="url(#mono)"' : ''}>${bodyShapes(body)}${eyes(d.eyes)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="mono" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d"/><feFlood flood-color="${BLACK}" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <svg x="2" y="2" width="62" height="54" viewBox="0 0 240 210">${clawd}</svg>
  <text x="4" y="72" font-family="monospace" font-weight="bold" font-size="10" fill="${BLACK}">Nv.${d.level} · ${d.age}</text>
  ${statLine(4, 80, 'REP', d.repu)}
  ${statLine(4, 98, 'JOI', d.joie)}
  <rect x="72" y="4" width="1.5" height="112" fill="${BLACK}"/>
  ${barCompact(rx, 16, rw, '5 H', d.five, d.fiveReset, !mono, 'ENE', 100 - d.five)}
  ${barCompact(rx, 62, rw, '7 J', d.seven, d.sevenReset, !mono, 'FOR', 100 - d.seven)}
</svg>`;
}

/* ------------------------------ planche des poses ------------------------------ */

const POSES = [
  { title: 'Tranquille', eyes: 'square' },
  { title: 'Au travail', eyes: 'square', accessory: 'laptop' },
  { title: 'Pause café', eyes: 'square', accessory: 'coffee' },
  { title: 'Content', eyes: 'happy' },
  { title: 'Magie', eyes: 'square', accessory: 'wand' },
  { title: 'Bisou', eyes: 'wink', mouth: 'kiss', accessory: 'heart' },
  { title: 'Au soleil', eyes: 'shades', overhead: 'sun' },
  { title: 'Sous la pluie', eyes: 'square', overhead: 'umbrella' },
  { title: 'Dodo', eyes: 'sleep', overhead: 'zzz' },
  { title: 'Anniversaire', eyes: 'happy', overhead: 'sparkle-hat' },
  { title: 'Football', eyes: 'happy', accessory: 'ball' },
  { title: 'Étourdi', eyes: 'spiral' },
];

function posesSheet() {
  const cols = 4, cell = 210, cardH = 230, top = 20;
  const rows = Math.ceil(POSES.length / cols);
  const W = cols * cell, H = top + rows * cardH;
  let cells = '';
  POSES.forEach((p, i) => {
    const cx = (i % cols) * cell;
    const cy = top + Math.floor(i / cols) * cardH;
    const { vb, svg } = clawdFull(p);
    cells += `<g transform="translate(${cx} ${cy})">
      <rect x="8" y="8" width="${cell - 16}" height="${cardH - 16}" rx="18" fill="#ffffff08" stroke="#ffffff14"/>
      <svg x="${(cell - 150) / 2}" y="24" width="150" height="150" viewBox="${vb}">${svg}</svg>
      <text x="${cell / 2}" y="196" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="16" fill="#f5f0e8">${p.title}</text>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="sticker" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d"/><feFlood flood-color="#fff" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect width="${W}" height="${H}" fill="#0d0b09"/>${cells}</svg>`;
}

/* --------------------------------- rendu --------------------------------- */

function png(svg, width) {
  const opts = { font: { loadSystemFonts: true, defaultFontFamily: 'monospace' } };
  if (width) opts.fitTo = { mode: 'width', value: width };
  return Buffer.from(new Resvg(svg, opts).render().asPng());
}

mkdirSync('docs', { recursive: true });

// Aperçus e-paper compacts (2.13", rendus en x3 pour la netteté du README).
writeFileSync(
  'docs/epaper-color.png',
  png(compactPanel({ palette: 'bwr', eyes: 'happy', five: 47, fiveReset: '2h45', seven: 63, sevenReset: '4j 2h', level: 3, age: '18 j', repu: 92, joie: 80 }), 750),
);
writeFileSync(
  'docs/epaper-bw.png',
  png(compactPanel({ palette: 'bw', eyes: 'sleep', overhead: 'zzz', five: 8, fiveReset: '3h10', seven: 22, sevenReset: '5j 6h', level: 3, age: '18 j', repu: 40, joie: 66 }), 750),
);
// Rendu grand format (7.5") pour référence.
writeFileSync(
  'docs/epaper-full.png',
  png(panel({ palette: 'bwr', title: 'Content', eyes: 'happy', time: '14:32', five: 47, fiveReset: '2h 45', seven: 63, sevenReset: '4j 2h', level: 3, age: '18 j', repu: 92, joie: 80 })),
);
writeFileSync('docs/mascot-poses.png', png(posesSheet(), 900));

console.log('OK — docs/epaper-{color,bw,full}.png, docs/mascot-poses.png');
