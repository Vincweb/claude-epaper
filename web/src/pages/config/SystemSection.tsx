import { useEffect, useState } from 'react';
import { checkUpdate, getVersion, registerPasskey, systemUpdate, type UpdateCheck, type VersionInfo } from '../../api';
import { Modal } from '../../components/Modal';
import { btnCls, btnPrimaryCls, Section } from '../../components/ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Au-delà, on arrête d'attendre et on laisse la main (build raté, service absent…). */
const UPDATE_TIMEOUT_MS = 8 * 60_000;

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

type Updating = { phase: 'restart' | 'waiting' } | { phase: 'failed'; error: string };

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

  const doUpdate = async () => {
    setConfirm(false);
    const before = version?.commit ?? null;
    setUpdating({ phase: 'restart' });
    try {
      await systemUpdate();
    } catch {
      setUpdating({ phase: 'failed', error: 'Impossible de lancer la mise à jour (l’app est-elle installée en service ?)' });
      return;
    }
    const deadline = Date.now() + UPDATE_TIMEOUT_MS;
    let sawDown = false; // le serveur a-t-il redémarré ?
    await sleep(15_000);
    setUpdating({ phase: 'waiting' });
    while (Date.now() < deadline) {
      try {
        const v = await getVersion();
        // Nouveau commit en ligne, OU serveur revenu après une coupure (même commit :
        // dépôt déjà à jour) → on recharge la page.
        if (!before || (v.commit && v.commit !== before) || sawDown) {
          reloadFresh(v.commit || String(v.version));
          return;
        }
      } catch {
        sawDown = true; // serveur indisponible = redémarrage en cours
      }
      await sleep(3000);
    }
    setUpdating({
      phase: 'failed',
      error:
        'La nouvelle version n’est pas apparue après 8 minutes. La mise à jour a peut-être échoué (build, réseau) : l’ancienne version reste en service. Consulte les journaux du Pi (journalctl).',
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
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
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
              <p className="max-w-xs text-sm text-white/75">{updating.error}</p>
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
                  {updating.phase === 'restart'
                    ? 'Récupération et construction de la nouvelle version. La page se rechargera automatiquement.'
                    : 'On attend le retour de la nouvelle version. La page se rechargera dès qu’elle est prête.'}
                </p>
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
