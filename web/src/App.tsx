import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { ScreenPage } from './pages/ScreenPage';
import { EpaperPage } from './pages/EpaperPage';
import { HumeursPage } from './pages/HumeursPage';
import { ConfigPage } from './pages/ConfigPage';
import { getAuthState, getConfig, logout, subscribeState, type AuthState } from './api';
import type { AppConfig, PollerState } from './lib/usage';

const DEFAULT_CONFIG: AppConfig = {
  pollIntervalMs: 60_000,
  credentialsPath: '',
  thresholds: { alert: 50, worried: 75, panic: 90 },
  epaperPalette: 'bwr',
  epaperLayout: 'compact',
  epaperRotate: 0,
  birthday: '',
  inactivityMinutes: 30,
  rotateMinutes: 30,
  bornAt: '',
  usageXp: 0,
};

export interface AppData {
  state: PollerState | null;
  config: AppConfig;
  refreshConfig: () => void;
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const refreshAuth = useCallback(() => {
    getAuthState().then(setAuth).catch(() => setAuth({ configured: false, authenticated: false }));
  }, []);

  useEffect(() => refreshAuth(), [refreshAuth]);

  if (!auth) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/40">Chargement…</div>
    );
  }

  if (!auth.authenticated) {
    return <AuthScreen configured={auth.configured} onAuthenticated={refreshAuth} />;
  }

  return (
    <Routes>
      <Route element={<Layout onLogout={refreshAuth} />}>
        <Route index element={<ScreenPage />} />
        <Route path="epaper" element={<EpaperPage />} />
        <Route path="humeurs" element={<HumeursPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="*" element={<ScreenPage />} />
      </Route>
    </Routes>
  );
}

const NAV = [
  { to: '/', label: 'Écran', end: true },
  { to: '/epaper', label: 'e-paper', end: false },
  { to: '/humeurs', label: 'Humeurs', end: false },
  { to: '/config', label: 'Config', end: false },
];

function Layout({ onLogout }: { onLogout: () => void }) {
  const [state, setState] = useState<PollerState | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  const refreshConfig = useCallback(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    refreshConfig();
    const unsub = subscribeState(setState);
    return unsub;
  }, [refreshConfig]);

  const authenticated = Boolean(state?.authenticated && state?.snapshot);

  const doLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Claude e-paper</h1>
          <StatusDot authenticated={authenticated} error={state?.lastError ?? null} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <nav className="flex overflow-hidden rounded-lg bg-white/10">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `px-3 py-1.5 ${isActive ? 'bg-[#d97757] text-black' : ''}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={doLogout}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            title="Se déconnecter"
          >
            ⎋
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8">
        <Outlet context={{ state, config, refreshConfig } satisfies AppData} />
      </main>

      <footer className="mt-6 text-center text-xs text-white/40">
        {authenticated
          ? `Dernier fetch : ${state?.lastFetchedAt ? new Date(state.lastFetchedAt).toLocaleTimeString('fr-FR') : '—'}`
          : state?.lastError
            ? `Non connecté (${state.lastError}) — importe tes credentials dans Config`
            : 'En attente des données…'}
      </footer>
    </div>
  );
}

function StatusDot({ authenticated, error }: { authenticated: boolean; error: string | null }) {
  const color = authenticated ? '#4ade80' : error ? '#e0533c' : '#e0a458';
  const label = authenticated ? 'connecté' : error ? 'hors ligne' : '…';
  return (
    <span className="flex items-center gap-1 text-xs text-white/50">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
