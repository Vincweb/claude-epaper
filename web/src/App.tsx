import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation, useOutletContext } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { ClawdLive } from './components/ClawdLive';
import { Icon, type IconName } from './components/Icon';
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

const NAV: { to: string; label: string; icon: IconName; end: boolean }[] = [
  { to: '/', label: 'Écran', icon: 'gauge', end: true },
  { to: '/epaper', label: 'e-paper', icon: 'epaper', end: false },
  { to: '/humeurs', label: 'Humeurs', icon: 'mood', end: false },
  { to: '/config', label: 'Config', icon: 'sliders', end: false },
];

/** Onglet actif (index dans NAV) d'après l'URL. */
function activeIndex(pathname: string): number {
  const i = NAV.findIndex((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));
  return i < 0 ? 0 : i;
}

/**
 * Barre d'onglets flottante en verre, façon app native : UNIQUEMENT dans
 * l'app installée (PWA). Une pastille glisse sous l'onglet actif.
 */
function TabBar({ pathname }: { pathname: string }) {
  const active = activeIndex(pathname);
  return (
    <nav
      aria-label="Navigation"
      className="glass fixed inset-x-4 z-20 mx-auto hidden max-w-sm rounded-[28px] p-1.5 pwa:block"
      style={{ bottom: 'max(14px, calc(env(safe-area-inset-bottom) - 6px))' }}
    >
      <div className="relative grid grid-cols-4">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/4 rounded-[22px] bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
          style={{ transform: `translateX(${active * 100}%)` }}
        />
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 rounded-[22px] py-2 text-[10.5px] font-medium tracking-wide transition-colors ${
                isActive ? 'text-accent-soft' : 'text-white/60 active:text-white/85'
              }`
            }
          >
            <Icon name={n.icon} className="size-[22px]" />
            {n.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Onglets du navigateur (ordinateur ET mobile) : jamais dans l'app installée. */
function TopTabs() {
  return (
    <nav
      aria-label="Navigation"
      className="order-last flex w-full gap-1 rounded-xl bg-white/[0.06] p-1 text-sm sm:order-none sm:w-auto pwa:hidden"
    >
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] transition-colors sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm ${
              isActive ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white/85'
            }`
          }
        >
          <Icon name={n.icon} className="size-4 shrink-0" />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

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
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-8 pt-5 sm:px-6 sm:py-8 pwa:pb-32 pwa:pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">Claude e-paper</h1>
          <StatusDot state={state} live={live} />
        </div>
        <TopTabs />
        <button
          onClick={doLogout}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/12 hover:text-white sm:order-last"
          title="Se déconnecter du dashboard"
          aria-label="Se déconnecter du dashboard"
        >
          <Icon name="logout" className="size-[18px]" />
        </button>
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

      <TabBar pathname={location.pathname} />
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
