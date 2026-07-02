import { useEffect, useState } from 'react';
import { ClaudeCharacter } from './ClaudeCharacter';
import { EPAPER, formatReset, type Pose, type Stat, type UsageSnapshot } from '../lib/usage';

type Palette = 'bw' | 'bwr';

interface Props {
  snap: UsageSnapshot;
  pose: Pose;
  palette: Palette;
  stats: Stat[];
  level: number;
  ageLabel: string;
}

/** Jauge en blocs monochromes, style e-ink rétro. */
function blocks(value: number, n = 6): string {
  const filled = Math.round((value / 100) * n);
  return '▓'.repeat(filled) + '░'.repeat(n - filled);
}

function Bar({
  label,
  pct,
  reset,
  palette,
}: {
  label: string;
  pct: number;
  reset: string;
  palette: Palette;
}) {
  const value = Math.max(0, Math.min(100, pct));
  // En noir & blanc, tout est en encre ; en tri-color, le rouge alerte à ≥ 90 %.
  const fill = palette === 'bwr' && value >= 90 ? EPAPER.red : EPAPER.ink;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap text-[10px] tracking-widest" style={{ color: EPAPER.ink }}>
          {label}
        </span>
        <span className="text-xl font-bold tabular-nums" style={{ color: EPAPER.ink }}>
          {Math.round(value)}%
        </span>
      </div>
      <div
        className="mt-1 h-3 w-full"
        style={{ border: `2px solid ${EPAPER.ink}`, background: EPAPER.paper }}
      >
        <div style={{ width: `${value}%`, height: '100%', background: fill }} />
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[10px]" style={{ color: EPAPER.ink, opacity: 0.7 }}>
        reset {reset}
      </div>
    </div>
  );
}

export function EpaperView({ snap, pose, palette, stats, level, ageLabel }: Props) {
  // Aperçu local : on peut basculer bw/bwr sans changer la config.
  const [preview, setPreview] = useState<Palette>(palette);
  useEffect(() => setPreview(palette), [palette]);

  const repu = stats.find((s) => s.key === 'repu')?.value ?? 0;
  const bonheur = stats.find((s) => s.key === 'bonheur')?.value ?? 0;

  const stamp = new Date(snap.fetchedAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Bezel du boîtier physique. */}
      <div className="rounded-2xl bg-[#22201d] p-3 shadow-2xl">
        {/* Dalle e-ink, ratio ~5:3 (Waveshare 7.5"). */}
        <div
          className="relative overflow-hidden rounded-sm font-mono"
          style={{
            width: 'min(560px, 90vw)',
            aspectRatio: '4 / 3',
            background: EPAPER.paper,
            color: EPAPER.ink,
            // Léger grain 1-bit pour évoquer l'e-ink.
            backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 0.5px, transparent 0.5px)',
            backgroundSize: '3px 3px',
          }}
        >
          <div className="flex h-full flex-col p-3">
            <div className="flex items-center justify-between border-b-2 pb-1" style={{ borderColor: EPAPER.ink }}>
              <span className="text-xs font-bold tracking-[0.2em]">◆ CLAUDE CODE</span>
              <span className="text-[10px]">{stamp}</span>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <div className="flex shrink-0 flex-col items-center">
                <ClaudeCharacter
                  eyes={pose.eyes}
                  overhead={pose.overhead === 'zzz' ? 'zzz' : 'none'}
                  pulseKey={0}
                  size={110}
                  flat
                  frame="wide"
                  {...(preview === 'bwr' ? { color: EPAPER.red } : { mono: true })}
                />
                <span
                  className="mt-1 px-1.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: EPAPER.ink, color: EPAPER.paper }}
                >
                  {pose.title}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                <Bar
                  label="SESSION · 5 H"
                  pct={snap.fiveHour.utilization}
                  reset={formatReset(snap.fiveHour.resetsAt)}
                  palette={preview}
                />
                <Bar
                  label="SEMAINE · 7 J"
                  pct={snap.sevenDay.utilization}
                  reset={formatReset(snap.sevenDay.resetsAt)}
                  palette={preview}
                />
              </div>
            </div>

            <div
              className="flex items-center justify-between border-t-2 pt-1 text-[10px] tracking-wide"
              style={{ borderColor: EPAPER.ink }}
            >
              <span className="font-bold">NIVEAU {level} · {ageLabel}</span>
              <span className="flex gap-3">
                <span>REPU {blocks(repu)}</span>
                <span>JOIE {blocks(bonheur)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-white/50">
        <span>Aperçu :</span>
        <div className="flex overflow-hidden rounded-lg bg-white/10">
          {(['bw', 'bwr'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPreview(p)}
              className={`px-3 py-1 ${preview === p ? 'bg-[#d97757] text-black' : ''}`}
            >
              {p === 'bw' ? 'Noir & blanc' : 'Noir/blanc/rouge'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
