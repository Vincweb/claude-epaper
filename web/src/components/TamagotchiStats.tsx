import { statColor, type Stat } from '../lib/usage';

const SEGMENTS = 12;

function Meter({ value, color }: { value: number; color: string }) {
  const filled = Math.round((value / 100) * SEGMENTS);
  return (
    <div className="flex flex-1 gap-0.5">
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1 rounded-[1px]"
          style={{ background: i < filled ? color : 'rgba(255,255,255,0.12)' }}
        />
      ))}
    </div>
  );
}

export function TamagotchiStats({
  stats,
  level,
  ageLabel,
}: {
  stats: Stat[];
  level: number;
  ageLabel: string;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.2em] text-white/70">CLAWD</span>
        <span className="text-xs text-white/50">
          Niveau {level} · {ageLabel}
        </span>
      </div>
      <div className="space-y-2.5">
        {stats.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-5 text-center text-sm">{s.icon}</span>
            <span className="w-16 text-xs text-white/60">{s.label}</span>
            <Meter value={s.value} color={statColor(s.value)} />
            <span className="w-8 text-right text-xs tabular-nums text-white/50">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
