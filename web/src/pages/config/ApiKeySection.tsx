import { useEffect, useState } from 'react';
import { createApiToken, getApiToken, revokeApiToken, type ApiToken } from '../../api';
import { btnCls, btnPrimaryCls, copyText, Field, fieldCls, Section } from '../../components/ui';

/** Clé d'API (Bearer) pour l'app iPhone et son widget, avec QR d'appairage. */
export function ApiKeySection() {
  const [apiToken, setApiToken] = useState<ApiToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<null | 'regen' | 'revoke'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApiToken()
      .then(setApiToken)
      .catch(() => {});
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setConfirm(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const generate = () =>
    run(async () => {
      setApiToken(await createApiToken());
      setReveal(true);
    });
  const revoke = () =>
    run(async () => {
      await revokeApiToken();
      setApiToken({ token: null });
      setReveal(false);
    });

  const copy = async () => {
    if (apiToken?.token && (await copyText(apiToken.token))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Section
      title="Application iOS"
      hint="Clé d'API pour l'app iPhone et son widget. Scanne le QR (appareil photo) pour appairer sans rien recopier."
    >
      {apiToken?.token ? (
        <>
          <Field
            label="Clé d'API"
            hint={
              apiToken.base && (
                <>
                  URL serveur : <code>{apiToken.base}</code>
                </>
              )
            }
          >
            {(id) => (
              <div className="flex gap-2">
                <input id={id} className={`${fieldCls} font-mono`} readOnly type={reveal ? 'text' : 'password'} value={apiToken.token ?? ''} />
                <button onClick={() => setReveal((v) => !v)} className={`${btnCls} shrink-0`} aria-pressed={reveal}>
                  {reveal ? 'Masquer' : 'Afficher'}
                </button>
                <button onClick={copy} className={`${btnCls} shrink-0`}>
                  {copied ? 'Copiée ✓' : 'Copier'}
                </button>
              </div>
            )}
          </Field>

          {apiToken.qr && (
            <div className="flex items-center gap-4">
              <img src={apiToken.qr} alt="QR d'appairage de l'app iOS" className="h-32 w-32 rounded-xl bg-white p-1.5" />
              <p className="text-[11px] text-white/55">
                Dans l'app iOS, appuie sur « Scanner le QR », ou ouvre l'appareil photo : le lien d'appairage remplit
                l'URL et la clé automatiquement.
              </p>
            </div>
          )}

          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn-soft">
              <span>Les appareils déjà appairés seront déconnectés.</span>
              <button
                onClick={() => void (confirm === 'regen' ? generate() : revoke())}
                disabled={busy}
                className="btn btn-sm bg-bad/20 text-bad-soft hover:bg-bad/30"
              >
                {confirm === 'regen' ? 'Confirmer la régénération' : 'Confirmer la révocation'}
              </button>
              <button onClick={() => setConfirm(null)} className="text-white/60 hover:text-white/80">
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setConfirm('regen')} disabled={busy} className={btnCls}>
                Régénérer
              </button>
              <button onClick={() => setConfirm('revoke')} disabled={busy} className={`${btnCls} text-bad-soft`}>
                Révoquer
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => void generate()} disabled={busy || !apiToken} className={btnPrimaryCls}>
            {busy ? 'Génération…' : 'Générer une clé d’API'}
          </button>
          <span className="text-[11px] text-white/55">Aucune clé : le widget iOS ne peut pas se connecter.</span>
        </div>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </Section>
  );
}
