import { Resvg } from '@resvg/resvg-js';
import { poller } from './poller.js';
import { loadConfig } from './config.js';
import { deriveStats, formatReset, levelInfo, selectPose, type ClawdEyes, type Pose } from './mascot.js';
import type { UsageSnapshot } from './types.js';

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

// --- Petit compteur à cellules (repu / joie) ---
function meterCells(x: number, y: number, value: number, cells = 6, cw = 12, ch = 12, gap = 3): string {
  const filled = Math.round((value / 100) * cells);
  let s = '';
  for (let i = 0; i < cells; i++) {
    const cx = x + i * (cw + gap);
    s += `<rect x="${cx}" y="${y}" width="${cw}" height="${ch}" fill="${i < filled ? INK : PAPER}" stroke="${INK}" stroke-width="1.5"/>`;
  }
  return s;
}

function barRow(x: number, y: number, w: number, label: string, pct: number, reset: string, palette: 'bw' | 'bwr'): string {
  const v = Math.max(0, Math.min(100, pct));
  const fill = palette === 'bwr' && v >= 90 ? RED : INK;
  return `
    <text x="${x}" y="${y}" font-family="monospace" font-size="18" letter-spacing="1" fill="${INK}">${label}</text>
    <text x="${x + w}" y="${y}" text-anchor="end" font-family="monospace" font-weight="bold" font-size="34" fill="${INK}">${Math.round(v)}%</text>
    <rect x="${x}" y="${y + 12}" width="${w}" height="22" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <rect x="${x + 3}" y="${y + 15}" width="${(w - 6) * (v / 100)}" height="16" fill="${fill}"/>
    <text x="${x}" y="${y + 54}" font-family="monospace" font-size="15" fill="${INK}">reset ${reset}</text>`;
}

export interface RenderOpts {
  width?: number;
  height?: number;
}

/** Construit le SVG complet du panneau e-paper à partir de l'état courant. */
export function buildEpaperSvg({ width = 800, height = 480 }: RenderOpts = {}): string {
  const cfg = loadConfig();
  const st = poller.state;
  const snap: UsageSnapshot | null = st.snapshot;
  const mono = cfg.epaperPalette === 'bw';

  const pose = selectPose({ now: new Date(), config: cfg, lastActivityAt: st.lastActivityAt });
  const stats = deriveStats(snap, st.lastActivityAt);
  const { level, label: ageLabel } = levelInfo(cfg.bornAt, st.usageXp);
  const repu = stats.find((s) => s.key === 'repu')?.value ?? 0;
  const joie = stats.find((s) => s.key === 'bonheur')?.value ?? 0;

  const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const five = snap?.fiveHour ?? { utilization: 0, resetsAt: null };
  const seven = snap?.sevenDay ?? { utilization: 0, resetsAt: null };

  const pad = 28;
  const rightX = 330;
  const rightW = width - rightX - pad;
  const title = pose.title.toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="mono" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d"/>
      <feFlood flood-color="${INK}" result="w"/>
      <feComposite in="w" in2="d" operator="in" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>

  <text x="${pad}" y="${pad + 26}" font-family="monospace" font-weight="bold" font-size="26" letter-spacing="4" fill="${INK}">CLAUDE CODE</text>
  <text x="${width - pad}" y="${pad + 24}" text-anchor="end" font-family="monospace" font-size="18" fill="${INK}">${time}</text>
  <rect x="${pad}" y="${pad + 40}" width="${width - 2 * pad}" height="3" fill="${INK}"/>

  <svg x="${pad}" y="90" width="290" height="255" viewBox="0 0 240 210">${clawdSvg(pose, mono)}</svg>
  <rect x="${pad + 20}" y="352" width="${title.length * 15 + 24}" height="30" fill="${INK}"/>
  <text x="${pad + 32}" y="373" font-family="monospace" font-weight="bold" font-size="16" letter-spacing="2" fill="${PAPER}">${title}</text>

  ${barRow(rightX, 130, rightW, 'SESSION · 5 H', five.utilization, formatReset(five.resetsAt), cfg.epaperPalette)}
  ${barRow(rightX, 250, rightW, 'SEMAINE · 7 J', seven.utilization, formatReset(seven.resetsAt), cfg.epaperPalette)}

  <rect x="${pad}" y="${height - 70}" width="${width - 2 * pad}" height="3" fill="${INK}"/>
  <text x="${pad}" y="${height - 38}" font-family="monospace" font-weight="bold" font-size="18" fill="${INK}">NIVEAU ${level} · ${ageLabel}</text>
  <text x="${rightX}" y="${height - 38}" font-family="monospace" font-size="15" fill="${INK}">REPU</text>
  ${meterCells(rightX + 55, height - 52, repu)}
  <text x="${rightX + 200}" y="${height - 38}" font-family="monospace" font-size="15" fill="${INK}">JOIE</text>
  ${meterCells(rightX + 250, height - 52, joie)}
</svg>`;
}

/** Rastérise le panneau courant en PNG. */
export function renderEpaperPng(opts: RenderOpts = {}): Buffer {
  const svg = buildEpaperSvg(opts);
  const resvg = new Resvg(svg, {
    background: PAPER,
    font: { loadSystemFonts: true, defaultFontFamily: 'monospace' },
  });
  return Buffer.from(resvg.render().asPng());
}
