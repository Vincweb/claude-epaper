interface Props {
  label: string;
  utilization: number;
  resetLabel: string;
  color: string;
}

const SIZE = 160;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function Gauge({ label, utilization, resetLabel, color }: Props) {
  const pct = Math.max(0, Math.min(100, utilization));
  const offset = C * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#ffffff14"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums">{Math.round(pct)}%</span>
          <span className="text-xs text-white/50">utilisé</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="text-xs text-white/45">reset {resetLabel}</div>
      </div>
    </div>
  );
}
