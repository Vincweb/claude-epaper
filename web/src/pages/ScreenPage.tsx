import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../App';
import { ClawdLive } from '../components/ClawdLive';
import { Gauge } from '../components/Gauge';
import { TamagotchiStats } from '../components/TamagotchiStats';
import { StatsModal } from '../components/StatsModal';
import { shufflePose } from '../api';
import { formatReset, moodColor, overallMood, type Stat, type UsageSnapshot } from '../lib/usage';

const EMPTY_SNAP: UsageSnapshot = {
  fiveHour: { utilization: 0, resetsAt: null },
  sevenDay: { utilization: 0, resetsAt: null },
  fetchedAt: new Date().toISOString(),
};

export function ScreenPage() {
  const { state, config } = useAppData();
  const [pulseKey, setPulseKey] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const lastUtil = useRef('');

  const snap = state?.snapshot ?? EMPTY_SNAP;
  const hasData = Boolean(state?.snapshot);
  const pose = state?.pose ?? { key: 'neutral', title: 'Tranquille', eyes: 'square' as const };
  const stats: Stat[] = state?.stats ?? [];
  const level = state?.level ?? 1;
  const ageLabel = state?.ageLabel ?? '0 h';
  const lookSig = JSON.stringify(pose);

  useEffect(() => {
    const sig = `${snap.fiveHour.utilization}-${snap.sevenDay.utilization}`;
    if (sig !== lastUtil.current) {
      lastUtil.current = sig;
      setPulseKey((k) => k + 1);
    }
  }, [snap.fiveHour.utilization, snap.sevenDay.utilization]);

  const gaugeColor = moodColor(overallMood(snap, config.thresholds));

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
        {/* Clawd dessiné en direct (60 img/s, yeux qui suivent le pointeur).
            La clé relance le « pop » à chaque changement de pose, de look ou de conso. */}
        <div
          key={`${pose.key}-${pulseKey}-${lookSig}`}
          className="cc-pop transition-transform duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03]"
        >
          <ClawdLive look={pose} size={240} title={pose.title} gaze />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/80">
            {pose.title}
          </span>
          <button
            onClick={doShuffle}
            disabled={shuffling}
            title="Changer la mascotte"
            className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20 disabled:opacity-50"
          >
            🎲
          </button>
        </div>
        {state?.poseManual && (
          <span className="mt-1 text-[10px] text-white/35">pose choisie manuellement</span>
        )}
      </div>

      {!hasData && (
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-black/20 p-4 text-center text-sm text-white/60">
          Pas de données d'usage.{' '}
          <Link to="/config" className="text-[#e0956f] underline">
            Importe tes credentials
          </Link>{' '}
          dans la config.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-center gap-10">
        <Gauge
          label="Fenêtre 5 h"
          utilization={snap.fiveHour.utilization}
          resetLabel={formatReset(snap.fiveHour.resetsAt)}
          color={gaugeColor}
        />
        <Gauge
          label="Fenêtre 7 j"
          utilization={snap.sevenDay.utilization}
          resetLabel={formatReset(snap.sevenDay.resetsAt)}
          color={gaugeColor}
        />
      </div>

      <TamagotchiStats stats={stats} level={level} ageLabel={ageLabel} onExplain={() => setShowStats(true)} />

      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
    </>
  );
}
