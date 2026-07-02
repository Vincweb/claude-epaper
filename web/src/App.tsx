import { useEffect, useRef, useState } from 'react';
import { ClaudeCharacter } from './components/ClaudeCharacter';
import { Gauge } from './components/Gauge';
import { ConfigPanel } from './components/ConfigPanel';
import { EpaperView } from './components/EpaperView';
import { StylesGallery } from './components/StylesGallery';
import { TamagotchiStats } from './components/TamagotchiStats';
import { getConfig, subscribeState } from './api';
import {
  deriveStats,
  formatReset,
  levelInfo,
  moodColor,
  overallMood,
  selectPose,
  type AppConfig,
  type PollerState,
  type UsageSnapshot,
} from './lib/usage';

const DEFAULT_CONFIG: AppConfig = {
  pollIntervalMs: 60_000,
  credentialsPath: '',
  useMacKeychain: false,
  thresholds: { alert: 50, worried: 75, panic: 90 },
  display: 'null',
  epaperPalette: 'bwr',
  epaperLayout: 'compact',
  birthday: '',
  inactivityMinutes: 30,
  rotateMinutes: 30,
  bornAt: '',
  usageXp: 0,
};

export default function App() {
  const [state, setState] = useState<PollerState | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [view, setView] = useState<'screen' | 'epaper' | 'styles'>('screen');

  // Mode démo : curseurs pour prévisualiser les jauges sans credentials.
  const [demo, setDemo] = useState(false);
  const [demo5h, setDemo5h] = useState(20);
  const [demo7d, setDemo7d] = useState(35);

  const [pulseKey, setPulseKey] = useState(0);
  const lastUtil = useRef<string>('');

  // Ré-évalue la pose au fil du temps (rotation, nuit, inactivité).
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    getConfig().then(setConfig);
    const unsub = subscribeState(setState);
    const id = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  const real = state?.snapshot ?? null;
  const authenticated = Boolean(state?.authenticated && real);

  const snap: UsageSnapshot = demo || !real
    ? {
        fiveHour: { utilization: demo5h, resetsAt: new Date(Date.now() + 2.5 * 3600_000).toISOString() },
        sevenDay: { utilization: demo7d, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() },
        fetchedAt: new Date().toISOString(),
      }
    : real;

  // Rejoue le petit "pop" quand un pourcentage change.
  useEffect(() => {
    const sig = `${snap.fiveHour.utilization}-${snap.sevenDay.utilization}`;
    if (sig !== lastUtil.current) {
      lastUtil.current = sig;
      setPulseKey((k) => k + 1);
    }
  }, [snap.fiveHour.utilization, snap.sevenDay.utilization]);

  // Couleur des jauges = indicateur de conso (data), indépendant du personnage.
  const gaugeColor = moodColor(overallMood(snap, config.thresholds));

  // Pose du personnage : contexte (heure, activité, anniversaire), jamais le stress.
  const pose = selectPose({
    now: new Date(nowTs),
    config,
    lastActivityAt: state?.lastActivityAt ?? null,
  });

  // Stats Tamagotchi.
  const stats = deriveStats({ snap, lastActivityAt: state?.lastActivityAt ?? null });
  const age = levelInfo(config.bornAt, state?.usageXp ?? config.usageXp);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Claude e-paper</h1>
          <StatusDot authenticated={authenticated} demo={demo} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-lg bg-white/10">
            {(['screen', 'epaper', 'styles'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 ${view === v ? 'bg-[#d97757] text-black' : ''}`}
              >
                {v === 'screen' ? 'Écran' : v === 'epaper' ? 'e-paper' : 'Styles'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setDemo((d) => !d)}
            className={`rounded-lg px-3 py-1.5 ${demo ? 'bg-[#d97757] text-black' : 'bg-white/10'}`}
          >
            Démo
          </button>
          <button
            onClick={() => setShowConfig(true)}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
          >
            ⚙︎ Config
          </button>
        </div>
      </header>

      <main
        className={`flex flex-1 flex-col items-center gap-8 ${view === 'styles' ? 'justify-start' : 'justify-center'}`}
      >
        {view === 'epaper' ? (
          <EpaperView
            snap={snap}
            pose={pose}
            palette={config.epaperPalette}
            stats={stats}
            level={age.level}
            ageLabel={age.label}
          />
        ) : view === 'styles' ? (
          <StylesGallery />
        ) : (
          <>
            <div className="flex flex-col items-center">
              <ClaudeCharacter
                pulseKey={pulseKey}
                eyes={pose.eyes}
                mouth={pose.mouth}
                accessory={pose.accessory}
                overhead={pose.overhead}
                frame="wide"
              />
              <div className="mt-1 rounded-full bg-white/10 px-4 py-1 text-sm font-medium text-white/80">
                {pose.title}
              </div>
            </div>

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

            <TamagotchiStats stats={stats} level={age.level} ageLabel={age.label} />
          </>
        )}

        {view !== 'styles' && (demo || !authenticated) && (
          <div className="w-full max-w-md space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-white/50">
              Mode démo — glisse pour prévisualiser les jauges.
            </p>
            <Slider label="5 h" value={demo5h} onChange={setDemo5h} />
            <Slider label="7 j" value={demo7d} onChange={setDemo7d} />
          </div>
        )}
      </main>

      <footer className="mt-6 text-center text-xs text-white/40">
        {authenticated && !demo
          ? `Dernier fetch : ${state?.lastFetchedAt ? new Date(state.lastFetchedAt).toLocaleTimeString('fr-FR') : '—'}`
          : state?.lastError
            ? `Non connecté (${state.lastError}) — importe tes credentials dans Config`
            : 'Mode démo actif'}
      </footer>

      {showConfig && (
        <ConfigPanel
          onClose={() => {
            setShowConfig(false);
            getConfig().then(setConfig);
          }}
        />
      )}
    </div>
  );
}

function StatusDot({ authenticated, demo }: { authenticated: boolean; demo: boolean }) {
  const color = demo ? '#e0a458' : authenticated ? '#4ade80' : '#e0533c';
  const label = demo ? 'démo' : authenticated ? 'connecté' : 'hors ligne';
  return (
    <span className="flex items-center gap-1 text-xs text-white/50">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-8 text-white/60">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#d97757]"
      />
      <span className="w-10 text-right tabular-nums">{value}%</span>
    </label>
  );
}
