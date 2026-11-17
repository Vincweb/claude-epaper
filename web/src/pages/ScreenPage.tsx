import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../App';
import { ClawdLive } from '../components/ClawdLive';
import { Gauge } from '../components/Gauge';
import { TamagotchiStats } from '../components/TamagotchiStats';
import { StatsModal } from '../components/StatsModal';
import { shufflePose } from '../api';
import { describeError, formatReset, type Stat } from '../lib/usage';

export function ScreenPage() {
  const { state, config } = useAppData();
  const [showStats, setShowStats] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const loading = state === null;
  const snap = state?.snapshot ?? null;
  const pose = state?.pose ?? { key: 'neutral', title: 'Tranquille', eyes: 'square' as const };
  const stats: Stat[] = state?.stats ?? [];
  const level = state?.level ?? 1;
  const ageLabel = state?.ageLabel ?? '0 h';
  const lookSig = JSON.stringify(pose);
  const utilSig = snap ? `${snap.fiveHour.utilization}-${snap.sevenDay.utilization}` : '';

  // « Pop » quand la pose ou la conso change : on relance l'animation CSS sur le
  // conteneur, SANS remonter Clawd (pas d'image vide, le regard est conservé).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = popRef.current;
    if (!el) return;
    el.classList.remove('cc-pop');
    void el.offsetWidth; // force le navigateur à repartir de zéro
    el.classList.add('cc-pop');
  }, [lookSig, utilSig]);

  const doShuffle = async () => {
    setShuffling(true);
    try {
      await shufflePose();
    } finally {
      setShuffling(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center">
        {/* Clawd dessiné en direct (yeux qui suivent le pointeur). */}
        <div ref={popRef} className="transition-transform duration-300 ease-out motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.03]">
          <ClawdLive look={pose} size={240} className="size-[180px] sm:size-[240px]" title={pose.title} gaze />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/80">{pose.title}</span>
          <button
            onClick={doShuffle}
            disabled={shuffling}
            title="Changer d'humeur"
            aria-label="Changer d'humeur (au hasard)"
            className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            🎲
          </button>
        </div>
        {state?.poseManual && <span className="mt-1 text-[11px] text-white/55">humeur choisie manuellement</span>}
      </div>

      {!loading && !snap && (
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-black/20 p-4 text-center text-sm text-white/60">
          {state?.lastError && state.lastError !== 'no credentials' ? (
            <>Pas de données : {describeError(state.lastError)}. </>
          ) : (
            <>Pas encore de données d'usage. </>
          )}
          <Link to="/config" className="text-accent-soft underline">
            Connecte le dashboard à ton compte Claude
          </Link>{' '}
          dans Config.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-10">
        <Gauge
          label="Fenêtre 5 h"
          utilization={snap?.fiveHour.utilization ?? null}
          resetLabel={formatReset(snap?.fiveHour.resetsAt ?? null)}
          thresholds={config.thresholds}
          loading={loading}
        />
        <Gauge
          label="Fenêtre 7 j"
          utilization={snap?.sevenDay.utilization ?? null}
          resetLabel={formatReset(snap?.sevenDay.resetsAt ?? null)}
          thresholds={config.thresholds}
          loading={loading}
        />
      </div>

      {stats.length > 0 && (
        <TamagotchiStats stats={stats} level={level} ageLabel={ageLabel} onExplain={() => setShowStats(true)} />
      )}

      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </>
  );
}
