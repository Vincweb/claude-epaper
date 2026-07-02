import { Resvg } from '@resvg/resvg-js';
import { poller } from './poller.js';
import { loadConfig } from './config.js';
import { deriveStats, formatReset, levelInfo, selectPose, type ClawdEyes, type Pose } from './mascot.js';

const INK = '#000000';
const PAPER = '#ffffff';
const RED = '#d81e28';

// --- Sprite Clawd (mêmes coordonnées que le composant web, viewBox 0 0 240 210) ---

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
    case 'shades':
      return `<rect x="82" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="134" y="56" width="24" height="18" rx="4" fill="${INK}"/><rect x="104" y="62" width="30" height="4" fill="${INK}"/>`;
    default: // square
      return `<rect x="89" y="58" width="14" height="16" fill="${INK}"/><rect x="137" y="58" width="14" height="16" fill="${INK}"/>`;
  }
}

function clawdSvg(pose: Pose, mono: boolean): string {
  const body = mono ? PAPER : RED;
  const zzz =
    pose.overhead === 'zzz'
      ? `<g fill="${INK}" font-family="monospace" font-weight="bold"><text x="158" y="54" font-size="14">z</text><text x="170" y="40" font-size="18">Z</text><text x="186" y="24" font-size="24">Z</text></g>`
      : '';
  const bodyShapes = `
    <rect x="60" y="40" width="120" height="88" fill="${body}"/>
    <rect x="42" y="80" width="18" height="26" fill="${body}"/>
    <rect x="180" y="80" width="18" height="26" fill="${body}"/>
    <rect x="88" y="128" width="12" height="22" fill="${body}"/>
    <rect x="140" y="128" width="12" height="22" fill="${body}"/>
    ${eyesSvg(pose.eyes)}`;
  const filter = mono ? ' filter="url(#mono)"' : '';
  return `${zzz}<g${filter}>${bodyShapes}</g>`;
}

const MONO_FILTER = `<filter id="mono" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d"/><feFlood flood-color="${INK}" result="w"/><feComposite in="w" in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// --- Données courantes ---

interface PanelData {
  mono: boolean;
  red: boolean; // rouge autorisé (bwr) pour les alertes de barre
  pose: Pose;
  time: string;
  five: number;
  fiveReset: string;
  seven: number;
  sevenReset: string;
  level: number;
  age: string;
  repu: number;
  joie: number;
}

function gatherData(paletteOverride?: 'bw' | 'bwr'): PanelData {
  const cfg = loadConfig();
  const st = poller.state;
  const snap = st.snapshot;
  const palette = paletteOverride ?? cfg.epaperPalette;
  const pose = selectPose({ now: new Date(), config: cfg, lastActivityAt: st.lastActivityAt });
  const stats = deriveStats(snap, st.lastActivityAt);
  const { level, label: age } = levelInfo(cfg.bornAt, st.usageXp);
  const five = snap?.fiveHour ?? { utilization: 0, resetsAt: null };
  const seven = snap?.sevenDay ?? { utilization: 0, resetsAt: null };
  return {
    mono: palette === 'bw',
    red: palette === 'bwr',
    pose,
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    five: Math.round(five.utilization),
    fiveReset: formatReset(five.resetsAt),
    seven: Math.round(seven.utilization),
    sevenReset: formatReset(seven.resetsAt),
    level,
    age,
    repu: stats.find((s) => s.key === 'repu')?.value ?? 0,
    joie: stats.find((s) => s.key === 'bonheur')?.value ?? 0,
  };
}

// --- Grand panneau (800x480) ---

function meterCells(x: number, y: number, value: number, cells = 6, cw = 12, ch = 12, gap = 3): string {
  const filled = Math.round((value / 100) * cells);
  let s = '';
  for (let i = 0; i < cells; i++) {
    s += `<rect x="${x + i * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" fill="${i < filled ? INK : PAPER}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  return s;
}

function barRowFull(x: number, y: number, w: number, label: string, v: number, reset: string, red: boolean): string {
  const fill = red && v >= 90 ? RED : INK;
  return `
    <text x="${x}" y="${y}" font-family="monospace" font-size="18" letter-spacing="1" fill="${INK}">${label}</text>
    <text x="${x + w}" y="${y}" text-anchor="end" font-family="monospace" font-weight="bold" font-size="34" fill="${INK}">${v}%</text>
    <rect x="${x}" y="${y + 12}" width="${w}" height="22" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <rect x="${x + 3}" y="${y + 15}" width="${(w - 6) * (v / 100)}" height="16" fill="${fill}"/>
    <text x="${x}" y="${y + 54}" font-family="monospace" font-size="15" fill="${INK}">reset ${reset}</text>`;
}

function buildFull(d: PanelData): string {
  const W = 800, H = 480, pad = 28, rx = 330, rw = W - rx - pad;
  const title = d.pose.title.toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${MONO_FILTER}</defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <text x="${pad}" y="${pad + 26}" font-family="monospace" font-weight="bold" font-size="26" letter-spacing="4" fill="${INK}">CLAUDE CODE</text>
  <text x="${W - pad}" y="${pad + 24}" text-anchor="end" font-family="monospace" font-size="18" fill="${INK}">${d.time}</text>
  <rect x="${pad}" y="${pad + 40}" width="${W - 2 * pad}" height="3" fill="${INK}"/>
  <svg x="${pad}" y="90" width="290" height="255" viewBox="0 0 240 210">${clawdSvg(d.pose, d.mono)}</svg>
  <rect x="${pad + 20}" y="352" width="${title.length * 15 + 24}" height="30" fill="${INK}"/>
  <text x="${pad + 32}" y="373" font-family="monospace" font-weight="bold" font-size="16" letter-spacing="2" fill="${PAPER}">${title}</text>
  ${barRowFull(rx, 130, rw, 'SESSION · 5 H', d.five, d.fiveReset, d.red)}
  ${barRowFull(rx, 250, rw, 'SEMAINE · 7 J', d.seven, d.sevenReset, d.red)}
  <rect x="${pad}" y="${H - 70}" width="${W - 2 * pad}" height="3" fill="${INK}"/>
  <text x="${pad}" y="${H - 38}" font-family="monospace" font-weight="bold" font-size="18" fill="${INK}">NIVEAU ${d.level} · ${d.age}</text>
  <text x="${rx}" y="${H - 38}" font-family="monospace" font-size="15" fill="${INK}">REPU</text>${meterCells(rx + 55, H - 52, d.repu)}
  <text x="${rx + 200}" y="${H - 38}" font-family="monospace" font-size="15" fill="${INK}">JOIE</text>${meterCells(rx + 250, H - 52, d.joie)}
</svg>`;
}

// --- Panneau compact (Waveshare 2.13", 250x122) ---

/** Mini jauge à cellules pour le format compact. */
function meterCellsSmall(x: number, y: number, value: number, cells = 5, cw = 6, ch = 6, gap = 2): string {
  const filled = Math.round((value / 100) * cells);
  let s = '';
  for (let i = 0; i < cells; i++)
    s += `<rect x="${x + i * (cw + gap)}" y="${y}" width="${cw}" height="${ch}" fill="${i < filled ? INK : PAPER}" stroke="${INK}" stroke-width="1"/>`;
  return s;
}

function statLineCompact(x: number, y: number, label: string, value: number): string {
  return `<text x="${x}" y="${y + 6}" font-family="monospace" font-size="8" fill="${INK}">${label}</text>${meterCellsSmall(x + 26, y, value)}`;
}

function barRowCompact(
  x: number, y: number, w: number, label: string, v: number, reset: string, red: boolean,
  statLabel: string, statValue: number,
): string {
  const fill = red && v >= 90 ? RED : INK;
  return `
    <text x="${x}" y="${y}" font-family="monospace" font-size="12" fill="${INK}">${label}</text>
    <text x="${x + w}" y="${y + 2}" text-anchor="end" font-family="monospace" font-weight="bold" font-size="20" fill="${INK}">${v}%</text>
    <rect x="${x}" y="${y + 6}" width="${w}" height="11" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
    <rect x="${x + 2}" y="${y + 8}" width="${(w - 4) * (v / 100)}" height="7" fill="${fill}"/>
    <text x="${x}" y="${y + 29}" font-family="monospace" font-size="10" fill="${INK}">reset ${reset}</text>
    ${statLineCompact(x + 78, y + 23, statLabel, statValue)}`;
}

function buildCompact(d: PanelData): string {
  const W = 250, H = 122;
  const rx = 80, rw = 166;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${MONO_FILTER}</defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <svg x="2" y="2" width="62" height="54" viewBox="0 0 240 210">${clawdSvg(d.pose, d.mono)}</svg>
  <text x="4" y="72" font-family="monospace" font-weight="bold" font-size="10" fill="${INK}">Nv.${d.level} · ${d.age}</text>
  ${statLineCompact(4, 80, 'REP', d.repu)}
  ${statLineCompact(4, 98, 'JOI', d.joie)}
  <rect x="72" y="4" width="1.5" height="112" fill="${INK}"/>
  ${barRowCompact(rx, 16, rw, '5 H', d.five, d.fiveReset, d.red, 'ENE', 100 - d.five)}
  ${barRowCompact(rx, 62, rw, '7 J', d.seven, d.sevenReset, d.red, 'FOR', 100 - d.seven)}
</svg>`;
}

export interface RenderOpts {
  layout?: 'compact' | 'full';
  palette?: 'bw' | 'bwr';
}

export function buildEpaperSvg(opts: RenderOpts = {}): string {
  const layout = opts.layout ?? loadConfig().epaperLayout;
  const data = gatherData(opts.palette);
  return layout === 'full' ? buildFull(data) : buildCompact(data);
}

/** Rastérise le panneau courant en PNG. `scale` agrandit (aperçu net). */
export function renderEpaperPng(opts: RenderOpts & { scale?: number } = {}): Buffer {
  const svg = buildEpaperSvg(opts);
  const layout = opts.layout ?? loadConfig().epaperLayout;
  const baseW = layout === 'full' ? 800 : 250;
  const resvg = new Resvg(svg, {
    background: PAPER,
    fitTo: { mode: 'width', value: Math.round(baseW * (opts.scale ?? 1)) },
    font: { loadSystemFonts: true, defaultFontFamily: 'monospace' },
  });
  return Buffer.from(resvg.render().asPng());
}
