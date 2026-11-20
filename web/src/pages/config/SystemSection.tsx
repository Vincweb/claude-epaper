import { useEffect, useState } from 'react';
import { checkUpdate, getUpdateStatus, getVersion, registerPasskey, systemUpdate, type UpdateCheck, type VersionInfo } from '../../api';
import { Modal } from '../../components/Modal';
import { btnCls, btnPrimaryCls, Section } from '../../components/ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Au-delà, on arrête d'attendre (un Pi Zero peut mettre ~10 min à construire). */
const UPDATE_TIMEOUT_MS = 20 * 60_000;

/** Passkey du dashboard. */
export function SecuritySection() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reset = async () => {
    setMsg({ ok: true, text: 'En cours…' });
    try {
      await registerPasskey();
      setMsg({ ok: true, text: 'Nouvelle passkey enregistrée ✓' });
    } catch {
      setMsg({ ok: false, text: 'Échec ou opération annulée' });
    }
  };
  return (
    <Section title="Authentification" hint="Passkey WebAuthn du dashboard. La clé d'API iOS est conservée.">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={reset} className={btnCls}>
          Réinitialiser la passkey
        </button>
        {msg && (
          <span role="status" className={`text-xs ${msg.ok ? 'text-white/70' : 'text-bad'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </Section>
  );
}

type Updating =
  | { phase: 'running'; message: string }
  | { phase: 'restarting' }
  | { phase: 'failed'; error: string; log?: string };

/** Version, vérification et lancement de la mise à jour (git pull + build + redémarrage). */
export function SystemSection() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [upd, setUpd] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [updating, setUpdating] = useState<Updating | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
    checkUpdate()
      .then(setUpd)
      .catch(() => setUpd({ behind: 0, error: 'indisponible' }))
      .finally(() => setChecking(false));
  }, []);

  const reloadFresh = (tag: string) => {
    // Cache-bust : force un index.html frais (pointant vers le nouveau JS hashé).
    const url = new URL(window.location.href);
    url.searchParams.set('v', tag);
    window.location.replace(url.toString());
  };

  /**
   * Suit la mise à jour jusqu'au bout. La page ne recharge QUE lorsque le
   * serveur redémarré annonce un autre commit (version du processus, pas du
   * disque) ; un échec affiche la raison et la fin du journal.
   */
  const doUpdate = async () => {
    setConfirm(false);
    const before = version?.commit ?? null;
    setUpdating({ phase: 'running', message: 'Démarrage…' });
    try {
      await systemUpdate();
    } catch (e) {
      setUpdating({
        phase: 'failed',
        error: e instanceof Error && e.message ? e.message : 'Impossible de lancer la mise à jour (l’app est-elle installée en service ?)',
      });
      return;
    }
    const deadline = Date.now() + UPDATE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(3000);
      let st;
      try {
        st = await getUpdateStatus();
      } catch {
        setUpdating({ phase: 'restarting' }); // serveur injoignable = redémarrage en cours
        continue;
      }
      if (before && st.running.commit && st.running.commit !== before) {
        reloadFresh(st.running.commit);
        return;
      }
      if (st.state === 'failed') {
        setUpdating({ phase: 'failed', error: st.message || 'La mise à jour a échoué.', log: st.log });
        return;
      }
      if (st.state === 'done') {
        // Redémarré sans changement de commit : rien de nouveau à charger.
        reloadFresh(st.running.commit || st.running.version);
        return;
      }
      setUpdating(st.state === 'restarting' ? { phase: 'restarting' } : { phase: 'running', message: st.message || 'En cours…' });
    }
    setUpdating({
      phase: 'failed',
      error: 'La nouvelle version n’est pas apparue après 20 minutes. L’ancienne version reste en service ; consulte ~/.claude-epaper/update.log sur le Pi.',
    });
  };

  const behind = Boolean(upd && upd.behind > 0);
  // Bouton actif s'il y a du nouveau, ou si la vérification a échoué (on laisse essayer).
  const canUpdate = behind || Boolean(upd?.error);

  return (
    <Section title="Système" hint="Version et mise à jour depuis le dépôt Git.">
      <div className="text-xs text-white/60">
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
        <div className="text-xs text-white/55">Vérification des mises à jour…</div>
      ) : upd?.error ? (
        <div className="text-xs text-white/55">Vérification impossible ({upd.error})</div>
      ) : behind && upd ? (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-xs">
          <div className="font-medium text-accent-soft">
            ⬆ Mise à jour disponible{upd.latestVersion ? ` — v${upd.latestVersion}` : ''} ({upd.behind} commit
            {upd.behind > 1 ? 's' : ''} de retard)
          </div>
          {upd.subject && <div className="mt-0.5 text-white/60">Dernier : {upd.subject}</div>}
        </div>
      ) : (
        <div className="text-xs text-ok">✓ À jour</div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setConfirm(true)} disabled={checking || !canUpdate} className={behind ? btnPrimaryCls : btnCls}>
          ⟳ Mettre à jour l'app
        </button>
      </div>

      {confirm && (
        <Modal title="Mettre à jour l'app ?" onClose={() => setConfirm(false)} className="max-w-sm">
          <p className="text-sm text-white/70">
            L'app va récupérer la dernière version (git pull + build) puis <strong>redémarrer</strong>. Le service sera
            indisponible ~1–2 min (plus sur un Pi Zero).
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setConfirm(false)} className={btnCls}>
              Annuler
            </button>
            <button onClick={() => void doUpdate()} className={btnPrimaryCls}>
              Mettre à jour
            </button>
          </div>
        </Modal>
      )}

      {updating && (
        <div
          role="alertdialog"
          aria-live="polite"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-ink p-8 text-center"
        >
          {updating.phase === 'failed' ? (
            <>
              <div className="text-4xl">⚠️</div>
              <p className="max-w-sm text-sm text-white/80">{updating.error}</p>
              {updating.log && (
                <details className="w-full max-w-lg text-left">
                  <summary className="cursor-pointer text-xs text-white/60">Voir le journal</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-snug whitespace-pre-wrap text-white/70">
                    {updating.log}
                  </pre>
                </details>
              )}
              <div className="flex gap-3">
                <button onClick={() => setUpdating(null)} className={btnCls}>
                  Fermer
                </button>
                <button onClick={() => window.location.reload()} className={btnCls}>
                  Recharger la page
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-accent motion-reduce:animate-none" />
              <div className="space-y-1">
                <p className="text-lg font-semibold">Mise à jour en cours…</p>
                <p className="max-w-xs text-sm text-white/60">
                  {updating.phase === 'restarting'
                    ? 'Redémarrage du serveur. La page se rechargera dès que la nouvelle version répond.'
                    : updating.message}
                </p>
                <p className="text-xs text-white/45">Ne ferme pas cette page ; sur un Pi Zero, comptez jusqu’à 10 minutes.</p>
              </div>
              <button onClick={() => setUpdating(null)} className="text-xs text-white/55 underline">
                Masquer (la mise à jour continue)
              </button>
            </>
          )}
        </div>
      )}
    </Section>
  );
}
