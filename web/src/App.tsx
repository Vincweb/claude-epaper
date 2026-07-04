import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Referme le menu mobile dès qu'on change de page.
  useEffect(() => setMenuOpen(false), [location.pathname]);

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
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="relative mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="whitespace-nowrap text-xl font-semibold">Claude e-paper</h1>
          <StatusDot authenticated={authenticated} error={state?.lastError ?? null} />
        </div>

        {/* Desktop : barre d'onglets + déconnexion. */}
        <div className="hidden items-center gap-2 text-sm sm:flex">
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
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            title="Se déconnecter"
          >
            ⎋
          </button>
        </div>

        {/* Mobile : bouton menu qui ouvre un panneau déroulant. */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg bg-white/10 px-3 py-2 text-lg leading-none hover:bg-white/20 sm:hidden"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10 sm:hidden" onClick={() => setMenuOpen(false)} />
            <nav className="absolute right-0 top-full z-20 mt-2 flex w-48 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1613] text-sm shadow-2xl sm:hidden">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `px-4 py-3 ${isActive ? 'bg-[#d97757] text-black' : 'hover:bg-white/10'}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <button
                onClick={doLogout}
                className="border-t border-white/10 px-4 py-3 text-left hover:bg-white/10"
              >
                Se déconnecter
              </button>
            </nav>
          </>
        )}
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
