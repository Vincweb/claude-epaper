import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { ClawdLive } from './components/ClawdLive';
import { ScreenPage } from './pages/ScreenPage';
import { getAuthState, getConfig, logout, subscribeState, type AuthState } from './api';
import { describeError, type AppConfig, type PollerState } from './lib/usage';

// Pages secondaires chargées à la demande : l'écran principal arrive plus vite.
const EpaperPage = lazy(() => import('./pages/EpaperPage').then((m) => ({ default: m.EpaperPage })));
const HumeursPage = lazy(() => import('./pages/HumeursPage').then((m) => ({ default: m.HumeursPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then((m) => ({ default: m.ConfigPage })));

const DEFAULT_CONFIG: AppConfig = {
  pollIntervalMs: 60_000,
  credentialsPath: '',
  thresholds: { alert: 50, worried: 75, panic: 90 },
  epaperLayout: 'horizontal',
  epaperRotate: 0,
  birthday: '',
  inactivityMinutes: 30,
  rotateMinutes: 30,
  bornAt: '',
  usageXp: 0,
};

export interface AppData {
  state: PollerState | null;
  /** Le flux temps réel est-il branché ? (sinon `state` peut être périmé) */
  live: boolean;
  config: AppConfig;
  /** La config réelle est-elle arrivée ? (sinon `config` = valeurs par défaut) */
  configReady: boolean;
  refreshConfig: () => void;
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}

/** Écran d'attente : Clawd plutôt qu'un simple « Chargement… ». */
export function Loading({ label = 'Chargement…', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-sm text-white/55 ${full ? 'min-h-screen' : 'py-16'}`}>
      <ClawdLive look={{ eyes: 'square', motion: 'idle' }} size={96} title="" />
      <span role="status">{label}</span>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const refreshAuth = useCallback(() => {
    getAuthState()
      .then(setAuth)
      .catch(() => setAuth({ configured: false, authenticated: false }));
  }, []);

  useEffect(() => refreshAuth(), [refreshAuth]);

  if (!auth) return <Loading full />;

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
  { to: '/', label: 'Écran', icon: '◉', end: true },
  { to: '/epaper', label: 'e-paper', icon: '▭', end: false },
  { to: '/humeurs', label: 'Humeurs', icon: '☺', end: false },
  { to: '/config', label: 'Config', icon: '⚙', end: false },
];

/** Filet de sécurité : une page qui plante n'emporte pas toute l'app. */
class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-sm rounded-xl border border-bad/40 bg-bad/10 p-4 text-center text-sm">
        <p className="font-medium text-bad-soft">Cette page a rencontré une erreur.</p>
        <p className="mt-1 text-xs text-white/55">{this.state.error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
        >
          Recharger
        </button>
      </div>
    );
  }
}

function Layout({ onLogout }: { onLogout: () => void }) {
  const [state, setState] = useState<PollerState | null>(null);
  const [live, setLive] = useState(true);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const location = useLocation();
  const downSince = useRef<number | null>(null);

  const refreshConfig = useCallback(() => {
    getConfig()
      .then((c) => {
        setConfig(c);
        setConfigReady(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshConfig();
    return subscribeState(setState, (up) => {
      setLive(up);
      downSince.current = up ? null : (downSince.current ?? Date.now());
    });
  }, [refreshConfig]);

  // Flux coupé depuis un moment : session expirée ? → retour à l'écran de connexion.
  useEffect(() => {
    if (live) return;
    const id = setInterval(() => {
      if (downSince.current && Date.now() - downSince.current > 8000) {
        getAuthState()
          .then((a) => !a.authenticated && onLogout())
          .catch(() => {});
      }
    }, 8000);
    return () => clearInterval(id);
  }, [live, onLogout]);

  const doLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-24 pt-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="whitespace-nowrap text-xl font-semibold">Claude e-paper</h1>
          <StatusDot state={state} live={live} />
        </div>

        <div className="flex items-center gap-2 text-sm">
          {/* Desktop : onglets dans l'en-tête ; mobile : barre en bas de l'écran. */}
          <nav aria-label="Navigation" className="hidden overflow-hidden rounded-lg bg-white/10 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `px-3 py-1.5 ${isActive ? 'bg-accent text-black' : 'hover:bg-white/10'}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={doLogout}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
            title="Se déconnecter du dashboard"
            aria-label="Se déconnecter du dashboard"
          >
            {/* Porte avec flèche sortante : « se déconnecter ». */}
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet context={{ state, live, config, configReady, refreshConfig } satisfies AppData} />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="mt-6 text-center text-xs text-white/55">
        <FooterStatus state={state} live={live} />
      </footer>

      {/* Mobile : barre d'onglets fixe en bas, à portée de pouce. */}
      <nav
        aria-label="Navigation"
        className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-white/10 bg-panel/95 backdrop-blur sm:hidden"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-white/60'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function FooterStatus({ state, live }: { state: PollerState | null; live: boolean }) {
  if (!state) return <>En attente des données…</>;
  if (!live) return <>Connexion au serveur perdue — reconnexion…</>;
  const fetched = state.lastFetchedAt ? new Date(state.lastFetchedAt).toLocaleTimeString('fr-FR') : null;
  if (state.lastError) {
    const msg = describeError(state.lastError);
    return state.snapshot ? (
      <>
        Données du {fetched ?? '—'} · {msg}
      </>
    ) : (
      <>{msg} — voir Config → Connexion à Claude</>
    );
  }
  return <>Dernière mise à jour : {fetched ?? '—'}</>;
}

/** Point d'état : vert = à jour, ambre = données périmées (erreur), rouge = hors ligne. */
function StatusDot({ state, live }: { state: PollerState | null; live: boolean }) {
  const fresh = Boolean(live && state?.snapshot && !state.lastError);
  const stale = Boolean(live && state?.snapshot && state.lastError);
  const [color, label] = !state
    ? ['var(--color-warn)', '…']
    : fresh
      ? ['var(--color-ok)', 'connecté']
      : stale
        ? ['var(--color-warn)', 'données périmées']
        : ['var(--color-bad)', 'hors ligne'];
  return (
    <span className="flex items-center gap-1 text-xs text-white/60" role="status">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
