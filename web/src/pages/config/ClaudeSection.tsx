import { useEffect, useState } from 'react';
import { useAppData } from '../../App';
import { finishClaudeLogin, getClaudeConnection, importCredentials, logoutClaude, putConfig, startClaudeLogin } from '../../api';
import { btnCls, btnPrimaryCls, copyText, Field, fieldCls, Section } from '../../components/ui';
import { describeError, type ConnectionInfo } from '../../lib/usage';

const SOURCE_LABEL: Record<ConnectionInfo['source'], string> = {
  dashboard: 'Connexion dédiée (dashboard)',
  'claude-code': 'Credentials importés de Claude Code',
  none: 'Aucune',
};

/** Source active (compte, date), erreur éventuelle et bouton Se déconnecter. */
function ConnectionStatus({
  connection,
  error,
  onLogout,
  busy,
}: {
  connection: ConnectionInfo | null;
  error: string | null;
  onLogout: () => void;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!connection) return <div className="text-xs text-white/55">Source active : …</div>;
  const connected = connection.source !== 'none';
  const dot = error && connected ? 'var(--color-bad)' : connection.source === 'dashboard' ? 'var(--color-ok)' : 'var(--color-warn)';

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="text-white/60">Source active :</span>
        <span className="font-medium text-white/85">{SOURCE_LABEL[connection.source]}</span>
      </div>

      {connected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-4 text-white/60">
          {connection.account && <span className="text-white/80">{connection.account}</span>}
          {connection.connectedAt && (
            <span>
              depuis le{' '}
              {new Date(connection.connectedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
          {confirm ? (
            <span className="flex items-center gap-2">
              <button
                onClick={() => {
                  setConfirm(false);
                  onLogout();
                }}
                disabled={busy}
                className="rounded-lg bg-bad/20 px-2 py-1 text-bad-soft hover:bg-bad/30 disabled:opacity-50"
              >
                Confirmer la déconnexion
              </button>
              <button onClick={() => setConfirm(false)} className="text-white/60 hover:text-white/80">
                Annuler
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="rounded-lg bg-white/10 px-2 py-1 text-bad-soft hover:bg-white/20 disabled:opacity-50"
            >
              Se déconnecter
            </button>
          )}
        </div>
      )}

      {connected && error && <p className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-bad-soft">{error}</p>}
      {connection.source === 'claude-code' && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-[11px] text-warn-soft">
          Ces identifiants sont partagés avec un Claude Code : quand l'un les rafraîchit, l'autre est déconnecté.
          Connecte plutôt le dashboard à ton compte ci-dessous.
        </p>
      )}
    </div>
  );
}

export function ClaudeSection() {
  const { state, config, refreshConfig } = useAppData();
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [fetched, setFetched] = useState<ConnectionInfo | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  // Le SSE fait foi dès qu'il a parlé ; la réponse des actions comble le délai.
  const connection = state?.connection ?? fetched;
  const credentialsPath = path ?? config.credentialsPath;

  useEffect(() => {
    getClaudeConnection()
      .then(setFetched)
      .catch(() => {});
  }, []);

  const startLogin = async () => {
    // Fenêtre ouverte DANS le clic (sinon bloquée), l'URL arrive juste après.
    const win = window.open('', '_blank');
    setBusy(true);
    setResult(null);
    try {
      const url = await startClaudeLogin();
      setLoginUrl(url);
      setLoginCode('');
      if (win) win.location.href = url;
    } catch (e) {
      win?.close();
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const finishLogin = async () => {
    if (busy || !loginCode.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await finishClaudeLogin(loginCode);
      setFetched(r.connection);
      setLoginCode('');
      setLoginUrl(null);
      setResult({ ok: true, text: `Connecté : 5 h ${Math.round(r.fiveHour)} %, 7 j ${Math.round(r.sevenDay)} %` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      setFetched(await logoutClaude());
      setResult(null);
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const copyLoginUrl = async () => {
    if (loginUrl && (await copyText(loginUrl))) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // Importe depuis le chemin SAISI (enregistré d'abord), pas l'ancien.
  const doImport = async () => {
    setImportMsg('Import…');
    try {
      if (credentialsPath !== config.credentialsPath) {
        await putConfig({ credentialsPath });
        refreshConfig();
      }
      const { imported } = await importCredentials();
      setImportMsg(imported ? '✅ Importés' : '❌ Introuvables à cet emplacement');
    } catch (e) {
      setImportMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setImportMsg(null), 5000);
  };

  const error = state?.lastError && state.lastError !== 'no credentials' ? describeError(state.lastError) : null;

  return (
    <Section title="Connexion à Claude" hint="Accès aux limites 5 h / 7 j de ton compte Claude.">
      <ConnectionStatus connection={connection} error={error} onLogout={logout} busy={busy} />

      <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-3">
        <div className="text-xs font-medium text-accent-soft">
          {connection?.source === 'dashboard' ? 'Reconnecter le compte' : 'Recommandé : connecter le dashboard à ton compte'}
        </div>
        <ol className="mt-2 space-y-3 text-xs text-white/75">
          <li className="space-y-1.5">
            <div>
              <span className="text-white/55">1.</span> Ouvre la page de connexion Claude et autorise l'accès :
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={startLogin} disabled={busy} className={btnPrimaryCls}>
                Se connecter à Claude ↗
              </button>
              {loginUrl && (
                <>
                  <a href={loginUrl} target="_blank" rel="noreferrer" className="text-[11px] text-white/60 underline">
                    rouvrir le lien
                  </a>
                  <button onClick={copyLoginUrl} className="text-[11px] text-white/60 underline">
                    {linkCopied ? 'lien copié ✅' : 'copier le lien'}
                  </button>
                </>
              )}
            </div>
          </li>
          <li>
            <Field label={<><span className="text-white/55">2.</span> Claude affiche ensuite un code : colle-le ici.</>}>
              {(id) => (
                <input
                  id={id}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!loginUrl}
                  className={`${fieldCls} font-mono`}
                  placeholder={loginUrl ? 'code#…' : 'clique d’abord sur « Se connecter à Claude »'}
                  value={loginCode}
                  onChange={(e) => {
                    setLoginCode(e.target.value);
                    setResult(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void finishLogin()}
                />
              )}
            </Field>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="text-white/55">3.</span>
            <button onClick={finishLogin} disabled={busy || !loginUrl || !loginCode.trim()} className={btnCls}>
              {busy && loginCode ? 'Vérification…' : 'Valider et tester'}
            </button>
          </li>
        </ol>
        {result && (
          <p className={`mt-3 text-xs ${result.ok ? 'text-ok' : 'text-bad'}`} role="status">
            {result.text}
          </p>
        )}
        <p className="mt-3 text-[11px] text-white/55">
          Le dashboard obtient ses propres identifiants, qu'il rafraîchit seul : aucun Claude Code n'est nécessaire sur
          cette machine, et ceux de tes autres machines restent connectés. Ils sont stockés sur le serveur (fichier en
          accès restreint) et jamais réaffichés.
        </p>
      </div>

      <details className="group rounded-lg border border-white/10 p-3">
        <summary className="cursor-pointer select-none text-xs text-white/60 group-open:mb-3">
          Avancé — importer les credentials de Claude Code
        </summary>
        <p className="mb-3 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[11px] text-warn-soft">
          ⚠ Partager les credentials d'une machine où Claude Code est utilisé déconnectera l'une des deux : quand l'une
          rafraîchit le token, l'autre perd l'accès. Préfère la connexion ci-dessus. Importer remplace la connexion
          actuelle du dashboard.
        </p>
        <Field label="Fichier de credentials">
          {(id) => (
            <div className="flex gap-2">
              <input id={id} className={fieldCls} value={credentialsPath} onChange={(e) => setPath(e.target.value)} />
              <button onClick={doImport} className={`${btnCls} shrink-0`}>
                Importer
              </button>
            </div>
          )}
        </Field>
        {importMsg && (
          <span role="status" className="mt-1 block text-[11px] text-white/70">
            {importMsg}
          </span>
        )}
      </details>
    </Section>
  );
}
