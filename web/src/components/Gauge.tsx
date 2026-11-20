import { MOOD_LABEL, moodColor, moodFor, type AppConfig } from '../lib/usage';

interface Props {
  label: string;
  /** null = pas de donnée (on affiche « -- », jamais un faux 0 %). */
  utilization: number | null;
  resetLabel: string;
  thresholds: AppConfig['thresholds'];
  /** Données en cours de chargement : anneau atténué, sans valeur. */
  loading?: boolean;
}

// Géométrie en unités du viewBox : la taille réelle vient du CSS (mobile / desktop).
const SIZE = 160;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Repère de seuil sur l'anneau (petit trait radial). */
function Tick({ pct }: { pct: number }) {
  const a = (pct / 100) * 2 * Math.PI;
  const r1 = R - STROKE / 2 - 3;
  const r2 = R + STROKE / 2 + 3;
  const c = SIZE / 2;
  return (
    <line
      x1={c + r1 * Math.cos(a)}
      y1={c + r1 * Math.sin(a)}
      x2={c + r2 * Math.cos(a)}
      y2={c + r2 * Math.sin(a)}
      style={{ stroke: 'var(--color-ink)' }}
      strokeWidth={2.5}
    />
  );
}

export function Gauge({ label, utilization, resetLabel, thresholds, loading = false }: Props) {
  const has = utilization !== null && !loading;
  const pct = has ? Math.max(0, Math.min(100, utilization)) : 0;
  const mood = moodFor(pct, thresholds);
  const color = moodColor(mood);
  const offset = C * (1 - pct / 100);

  return (
    <figure className="flex flex-col items-center gap-2" aria-label={`${label} : ${has ? `${Math.round(pct)} % utilisé` : 'pas de donnée'}`}>
      <div className="relative size-[136px] sm:size-40">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="#ffffff14"
            strokeWidth={STROKE}
            className={loading ? 'animate-pulse' : undefined}
          />
          {has && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ stroke: color, transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
            />
          )}
          {[thresholds.alert, thresholds.worried, thresholds.panic].map((t, i) => (
            <Tick key={i} pct={t} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums sm:text-4xl">
            {has ? `${Math.round(pct)}%` : loading ? '…' : '--'}
          </span>
          <span className="text-xs" style={{ color: has ? color : undefined }}>
            {has ? MOOD_LABEL[mood] : loading ? 'chargement' : 'pas de donnée'}
          </span>
        </div>
      </div>
      <figcaption className="text-center">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="text-xs text-white/55">{has ? `reset ${resetLabel}` : ' '}</div>
      </figcaption>
    </figure>
  );
}
