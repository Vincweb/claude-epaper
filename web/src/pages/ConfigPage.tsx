import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppData } from '../App';
import {
  checkUpdate,
  createApiToken,
  getApiToken,
  finishClaudeLogin,
  getClaudeConnection,
  getConfig,
  getVersion,
  importCredentials,
  logoutClaude,
  putConfig,
  registerPasskey,
  revokeApiToken,
  startClaudeLogin,
  systemUpdate,
  type ApiToken,
  type UpdateCheck,
  type VersionInfo,
} from '../api';
import type { AppConfig, ConnectionInfo } from '../lib/usage';

const field = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Copie dans le presse-papiers, avec repli pour le HTTP sur IP LAN (contexte non sécurisé). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

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
  if (!connection) return <div className="text-xs text-white/40">Source active : …</div>;
  const connected = connection.source !== 'none';
  const dot = error && connected ? '#e0533c' : connection.source === 'dashboard' ? '#4ade80' : '#e0a458';

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="text-white/50">Source active :</span>
        <span className="font-medium text-white/85">{SOURCE_LABEL[connection.source]}</span>
      </div>

      {connected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-4 text-white/50">
          {connection.account && <span className="text-white/75">{connection.account}</span>}
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
                className="rounded-lg bg-[#e0533c]/20 px-2 py-1 text-[#e0533c] hover:bg-[#e0533c]/30 disabled:opacity-50"
              >
                Confirmer la déconnexion
              </button>
              <button onClick={() => setConfirm(false)} className="text-white/40 hover:text-white/70">
                Annuler
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="rounded-lg bg-white/10 px-2 py-1 text-[#e0533c] hover:bg-white/20 disabled:opacity-50"
            >
              Se déconnecter
            </button>
          )}
        </div>
      )}

      {connected && error && (
        <p className="rounded-lg border border-[#e0533c]/40 bg-[#e0533c]/10 p-2 text-[#f08a78]">{error}</p>
      )}
      {connection.source === 'claude-code' && (
        <p className="rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/10 p-2 text-[11px] text-[#e0c08a]">
          Ces identifiants sont partagés avec un Claude Code : quand l'un les rafraîchit, l'autre est
          déconnecté. Connecte plutôt le dashboard à ton compte ci-dessous.
        </p>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-white/50">{title}</h3>
      {hint && <p className="mt-0.5 text-[11px] text-white/35">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function ConfigPage() {
  const { refreshConfig, state } = useAppData();
  const [saved, setSaved] = useState<AppConfig | null>(null);
  const [form, setForm] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState<null | { phase: 'restart' | 'waiting'; error?: string }>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [upd, setUpd] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(true);
  const [apiToken, setApiToken] = useState<ApiToken | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [copied, setCopied] = useState(false);
  // Connexion à Claude : champs hors de `form` (jamais renvoyés par PUT /config).
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [loginCode, setLoginCode] = useState('');
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [loginResult, setLoginResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [fetchedConnection, setFetchedConnection] = useState<ConnectionInfo | null>(null);
  // Le SSE fait foi dès qu'il a parlé ; la réponse des actions comble le délai.
  const connection = state?.connection ?? fetchedConnection;

  useEffect(() => {
    getConfig().then((c) => {
      setSaved(c);
      setForm(c);
    });
    getClaudeConnection().then(setFetchedConnection).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
    getApiToken().then(setApiToken).catch(() => {});
    checkUpdate()
      .then(setUpd)
      .catch(() => setUpd({ behind: 0, error: 'indisponible' }))
      .finally(() => setChecking(false));
  }, []);

  const dirty = useMemo(
    () => Boolean(form && saved) && JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  if (!form) return <div className="text-white/40">Chargement…</div>;

  const patch = (p: Partial<AppConfig>) => setForm({ ...form, ...p });

  const save = async () => {
    setSaving(true);
    const next = await putConfig(form);
    setSaved(next);
    setForm(next);
    setSaving(false);
    setSavedFlash(true);
    refreshConfig();
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const startLogin = async () => {
    // Fenêtre ouverte DANS le clic (sinon bloquée), l'URL arrive juste après.
    const win = window.open('', '_blank');
    setClaudeBusy(true);
    setLoginResult(null);
    try {
      const url = await startClaudeLogin();
      setLoginUrl(url);
      setLoginCode('');
      if (win) win.location.href = url;
    } catch (e) {
      win?.close();
      setLoginResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setClaudeBusy(false);
    }
  };

  const finishLogin = async () => {
    if (claudeBusy || !loginCode.trim()) return;
    setClaudeBusy(true);
    setLoginResult(null);
    try {
      const r = await finishClaudeLogin(loginCode);
      setFetchedConnection(r.connection);
      setLoginCode('');
      setLoginUrl(null);
      setLoginResult({
        ok: true,
        text: `Connecté : 5 h ${Math.round(r.fiveHour)} %, 7 j ${Math.round(r.sevenDay)} %`,
      });
    } catch (e) {
      setLoginResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setClaudeBusy(false);
    }
  };

  const doLogoutClaude = async () => {
    setClaudeBusy(true);
    try {
      setFetchedConnection(await logoutClaude());
      setLoginResult(null);
    } finally {
      setClaudeBusy(false);
    }
  };

  const copyLoginUrl = async () => {
    if (loginUrl && (await copyText(loginUrl))) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const doImport = async () => {
    setImportMsg('…');
    const { imported } = await importCredentials();
    setImportMsg(imported ? '✅ importés' : '❌ introuvables');
    setTimeout(() => setImportMsg(null), 4000);
  };

  const resetPasskey = async () => {
    setPasskeyMsg('En cours…');
    try {
      await registerPasskey();
      setPasskeyMsg('✅ Nouvelle passkey enregistrée');
    } catch {
      setPasskeyMsg('❌ Échec / annulé');
    }
  };

  const genToken = async () => {
    setTokenBusy(true);
    try {
      setApiToken(await createApiToken());
      setRevealKey(true);
    } finally {
      setTokenBusy(false);
    }
  };

  const dropToken = async () => {
    setTokenBusy(true);
    try {
      await revokeApiToken();
      setApiToken({ token: null });
      setRevealKey(false);
    } finally {
      setTokenBusy(false);
    }
  };

  const copyToken = async () => {
    if (!apiToken?.token) return;
    try {
      await navigator.clipboard.writeText(apiToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible (http) */
    }
  };

  const doUpdate = async () => {
    setConfirmUpdate(false);
    const beforeCommit = version?.commit ?? null;
    setUpdating({ phase: 'restart' });
    try {
      await systemUpdate();
    } catch {
      setUpdating({
        phase: 'restart',
        error: 'Impossible de lancer la mise à jour (l’app est-elle installée en service ?)',
      });
      return;
    }
    // 1) Laisser le serveur redémarrer tranquillement (build + restart : ~1–2 min).
    await sleep(120_000);
    // 2) Puis vérifier en fond, indéfiniment, que la nouvelle version est en ligne.
    setUpdating({ phase: 'waiting' });
    while (true) {
      await sleep(3000);
      try {
        const v = await getVersion();
        // Pas de commit de référence → on recharge dès que le serveur répond.
        if (!beforeCommit || (v.commit && v.commit !== beforeCommit)) {
          // Cache-bust : force le navigateur à recharger un index.html frais
          // (pointant vers le nouveau JS hashé), sans dépendre de son cache.
          const url = new URL(window.location.href);
          url.searchParams.set('v', v.commit || String(v.version));
          window.location.replace(url.toString());
          return;
        }
      } catch {
        // Serveur encore indisponible : on continue d'attendre.
      }
    }
  };

  return (
    <div className="w-full max-w-md self-center">
      <h2 className="mb-4 text-lg font-semibold">Configuration</h2>

      <div className="space-y-4">
        <Section title="Connexion à Claude" hint="Accès aux limites 5 h / 7 j de ton compte Claude.">
          <ConnectionStatus
            connection={connection}
            error={state?.lastError && state.lastError !== 'no credentials' ? state.lastError : null}
            onLogout={doLogoutClaude}
            busy={claudeBusy}
          />

          <div className="rounded-lg border border-[#d97757]/30 bg-[#d97757]/[0.06] p-3">
            <div className="text-xs font-medium text-[#e0956f]">
              {connection?.source === 'dashboard' ? 'Reconnecter le compte' : 'Recommandé : connecter le dashboard à ton compte'}
            </div>
            <ol className="mt-2 space-y-3 text-xs text-white/70">
              <li className="space-y-1.5">
                <div>
                  <span className="text-white/45">1.</span> Ouvre la page de connexion Claude et autorise
                  l'accès :
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={startLogin}
                    disabled={claudeBusy}
                    className="rounded-lg bg-[#d97757] px-3 py-2 text-sm font-medium text-black hover:brightness-110 disabled:opacity-40"
                  >
                    Se connecter à Claude ↗
                  </button>
                  {loginUrl && (
                    <>
                      <a href={loginUrl} target="_blank" rel="noreferrer" className="text-[11px] text-white/50 underline">
                        rouvrir le lien
                      </a>
                      <button onClick={copyLoginUrl} className="text-[11px] text-white/50 underline">
                        {linkCopied ? 'lien copié ✅' : 'copier le lien'}
                      </button>
                    </>
                  )}
                </div>
              </li>
              <li>
                <span className="text-white/45">2.</span> Claude affiche ensuite un code : colle-le ici.
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!loginUrl}
                  className={`${field} mt-1.5 font-mono disabled:opacity-40`}
                  placeholder={loginUrl ? 'code#…' : 'clique d’abord sur « Se connecter à Claude »'}
                  value={loginCode}
                  onChange={(e) => {
                    setLoginCode(e.target.value);
                    setLoginResult(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void finishLogin()}
                />
              </li>
              <li className="flex flex-wrap items-center gap-3">
                <span className="text-white/45">3.</span>
                <button
                  onClick={finishLogin}
                  disabled={claudeBusy || !loginUrl || !loginCode.trim()}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-40"
                >
                  {claudeBusy && loginCode ? 'Vérification…' : 'Valider et tester'}
                </button>
              </li>
            </ol>
            {loginResult && (
              <p className={`mt-3 text-xs ${loginResult.ok ? 'text-[#7bbf6a]' : 'text-[#e0533c]'}`} role="status">
                {loginResult.text}
              </p>
            )}
            <p className="mt-3 text-[11px] text-white/35">
              Le dashboard obtient ses propres identifiants, qu'il rafraîchit seul : aucun Claude Code
              n'est nécessaire sur cette machine, et ceux de tes autres machines restent connectés.
              Ils sont stockés sur le serveur (fichier en accès restreint) et jamais réaffichés.
            </p>
          </div>

          <details className="group rounded-lg border border-white/10 p-3">
            <summary className="cursor-pointer select-none text-xs text-white/50 group-open:mb-3">
              Avancé — importer les credentials de Claude Code
            </summary>
            <p className="mb-3 rounded-lg border border-[#e0a458]/30 bg-[#e0a458]/10 p-2 text-[11px] text-[#e0c08a]">
              ⚠ Partager les credentials d'une machine où Claude Code est utilisé déconnectera l'une
              des deux : quand l'une rafraîchit le token, l'autre perd l'accès. Préfère la connexion
              ci-dessus. Importer remplace la connexion actuelle du dashboard.
            </p>
            <label className="mb-1 block text-xs text-white/60">Fichier de credentials</label>
            <div className="flex gap-2">
              <input className={field} value={form.credentialsPath} onChange={(e) => patch({ credentialsPath: e.target.value })} />
              <button
                onClick={doImport}
                title="Importer les credentials depuis ce fichier"
                className="shrink-0 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20"
              >
                ⇩
              </button>
            </div>
            {importMsg && <span className="mt-1 block text-[11px] text-white/60">{importMsg}</span>}
          </details>
        </Section>

        <Section title="Limites" hint="Fréquence d'appel et seuils des jauges.">
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Appel des limites — API <code>/usage</code> (secondes)
            </label>
            <input
              type="number"
              min={10}
              className={field}
              value={Math.round(form.pollIntervalMs / 1000)}
              onChange={(e) => patch({ pollIntervalMs: Number(e.target.value) * 1000 })}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Seuils d'alerte des jauges (%)</label>
            <div className="grid grid-cols-3 gap-2">
              {(['alert', 'worried', 'panic'] as const).map((k) => (
                <input
                  key={k}
                  type="number"
                  className={field}
                  value={form.thresholds[k]}
                  onChange={(e) => patch({ thresholds: { ...form.thresholds, [k]: Number(e.target.value) } })}
                  title={k}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Humeur" hint="Comportement de Clawd (poses contextuelles).">
          <div>
            <label className="mb-1 block text-xs text-white/60">Anniversaire (pose spéciale le jour J)</label>
            <input
              type="date"
              className={`${field} box-border block min-w-0 appearance-none`}
              value={form.birthday}
              onChange={(e) => patch({ birthday: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">Dodo après (min inactif)</label>
              <input type="number" min={1} className={field} value={form.inactivityMinutes} onChange={(e) => patch({ inactivityMinutes: Number(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Changement de pose (min)</label>
              <input type="number" min={1} className={field} value={form.rotateMinutes} onChange={(e) => patch({ rotateMinutes: Number(e.target.value) })} />
            </div>
          </div>
        </Section>

        <Section title="Affichage" hint="Rendu envoyé à la dalle e-paper (2,13″, noir &amp; blanc).">
          <div>
            <label className="mb-1 block text-xs text-white/60">Orientation</label>
            <select className={field} value={form.epaperLayout} onChange={(e) => patch({ epaperLayout: e.target.value as AppConfig['epaperLayout'] })}>
              <option value="horizontal">Horizontale (250×122)</option>
              <option value="vertical">Verticale (122×250)</option>
            </select>
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Rotation 180° (dalle montée à l'envers)</span>
            <input type="checkbox" checked={form.epaperRotate === 180} onChange={(e) => patch({ epaperRotate: e.target.checked ? 180 : 0 })} />
          </label>
        </Section>

        <Section
          title="Application iOS"
          hint="Clé d'API pour l'app iPhone et son widget. Scanne le QR (appareil photo) pour appairer sans rien recopier."
        >
          {apiToken?.token ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-white/60">Clé d'API</label>
                <div className="flex gap-2">
                  <input
                    className={`${field} font-mono`}
                    readOnly
                    type={revealKey ? 'text' : 'password'}
                    value={apiToken.token}
                  />
                  <button
                    onClick={() => setRevealKey((v) => !v)}
                    title={revealKey ? 'Masquer' : 'Afficher'}
                    className="shrink-0 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20"
                  >
                    {revealKey ? '🙈' : '👁'}
                  </button>
                  <button
                    onClick={copyToken}
                    title="Copier la clé"
                    className="shrink-0 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/20"
                  >
                    {copied ? '✅' : '⧉'}
                  </button>
                </div>
                {apiToken.base && (
                  <p className="mt-1 text-[11px] text-white/40">
                    URL serveur : <code>{apiToken.base}</code>
                  </p>
                )}
              </div>

              {apiToken.qr && (
                <div className="flex items-center gap-4">
                  <img
                    src={apiToken.qr}
                    alt="QR d'appairage iOS"
                    className="h-32 w-32 rounded-lg bg-white p-1"
                  />
                  <p className="text-[11px] text-white/40">
                    Dans l'app iOS, appuie sur « Scanner le QR », ou ouvre l'appareil photo :
                    le lien d'appairage remplit l'URL et la clé automatiquement.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={genToken}
                  disabled={tokenBusy}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
                >
                  Régénérer
                </button>
                <button
                  onClick={dropToken}
                  disabled={tokenBusy}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm text-[#e0533c] hover:bg-white/20 disabled:opacity-50"
                >
                  Révoquer
                </button>
                <span className="text-[11px] text-white/35">
                  Régénérer/révoquer déconnecte les appareils déjà appairés.
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={genToken}
                disabled={tokenBusy}
                className="rounded-lg bg-[#d97757] px-3 py-2 text-sm font-medium text-black hover:brightness-110 disabled:opacity-50"
              >
                {tokenBusy ? 'Génération…' : 'Générer une clé d\'API'}
              </button>
              <span className="text-[11px] text-white/40">Aucune clé — le widget iOS ne peut pas se connecter.</span>
            </div>
          )}
        </Section>

        <Section title="Authentification" hint="Passkey WebAuthn du dashboard.">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={resetPasskey} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              Réinitialiser la passkey
            </button>
            {passkeyMsg && <span className="text-xs text-white/70">{passkeyMsg}</span>}
          </div>
        </Section>

        <Section title="Système" hint="Version et mise à jour depuis le dépôt Git.">
          <div className="text-xs text-white/50">
            Version {version?.version ?? '…'}
            {version?.commit && (
              <>
                {' · '}
                <code>{version.commit}</code>
              </>
            )}
            {version?.date && <> · {new Date(version.date).toLocaleDateString('fr-FR')}</>}
          </div>

          {checking ? (
            <div className="text-xs text-white/40">Vérification des mises à jour…</div>
          ) : upd?.error ? (
            <div className="text-xs text-white/40">Vérification impossible ({upd.error})</div>
          ) : upd && upd.behind > 0 ? (
            <div className="rounded-lg border border-[#d97757]/40 bg-[#d97757]/10 p-3 text-xs">
              <div className="font-medium text-[#e0956f]">
                ⬆ Mise à jour disponible{upd.latestVersion ? ` — v${upd.latestVersion}` : ''} (
                {upd.behind} commit{upd.behind > 1 ? 's' : ''} de retard)
              </div>
              {upd.subject && <div className="mt-0.5 text-white/60">Dernier : {upd.subject}</div>}
            </div>
          ) : (
            <div className="text-xs text-[#7bbf6a]">✓ À jour</div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setConfirmUpdate(true)}
              className={`rounded-lg px-3 py-2 text-sm ${
                upd && upd.behind > 0
                  ? 'bg-[#d97757] font-medium text-black'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ⟳ Mettre à jour l'app
            </button>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-3">
        {savedFlash && <span className="text-sm text-[#7bbf6a]">✅ Enregistré</span>}
        {dirty && !savedFlash && <span className="text-xs text-white/40">Modifications non enregistrées</span>}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-[#d97757] px-5 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {confirmUpdate && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmUpdate(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1613] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Mettre à jour l'app ?</h2>
            <p className="mt-2 text-sm text-white/60">
              L'app va récupérer la dernière version (git pull + build) puis{' '}
              <strong>redémarrer</strong>. Le service sera indisponible ~1–2 min.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmUpdate(false)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
              >
                Annuler
              </button>
              <button
                onClick={doUpdate}
                className="rounded-lg bg-[#d97757] px-4 py-2 text-sm font-medium text-black"
              >
                Mettre à jour
              </button>
            </div>
          </div>
        </div>
      )}

      {updating && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[#0d0b09] p-8 text-center">
          {updating.error ? (
            <>
              <div className="text-4xl">⚠️</div>
              <p className="max-w-xs text-sm text-white/70">{updating.error}</p>
              <button
                onClick={() => setUpdating(null)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
              >
                Fermer
              </button>
            </>
          ) : (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-[#d97757]" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">Mise à jour en cours…</p>
                <p className="max-w-xs text-sm text-white/55">
                  {updating.phase === 'restart'
                    ? 'Le serveur redémarre. Merci de patienter, la page se rechargera automatiquement.'
                    : 'On attend le retour de la nouvelle version. La page se rechargera dès qu’elle est prête.'}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
