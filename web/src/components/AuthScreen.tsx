import { useState } from 'react';
import { loginPasskey, recoverWithCode, registerPasskey } from '../api';
import { ClaudeCharacter } from './ClaudeCharacter';

type Props = { configured: boolean; onAuthenticated: () => void };

export function AuthScreen({ configured, onAuthenticated }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1613] p-6 shadow-2xl">
        <div className="mb-4 flex flex-col items-center text-center">
          <ClaudeCharacter size={112} frame="wide" eyes="happy" />
          <h1 className="text-xl font-semibold">Claude e-paper</h1>
          <p className="text-xs text-white/40">avec Clawd, ta mascotte</p>
        </div>
        {configured ? (
          <Login onAuthenticated={onAuthenticated} />
        ) : (
          <Setup onAuthenticated={onAuthenticated} />
        )}
      </div>
    </div>
  );
}

/* --------------------------------- setup ---------------------------------- */

function Setup({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ code: string; qr: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { recoveryCode, recoveryQr } = await registerPasskey();
      setRecovery({ code: recoveryCode, qr: recoveryQr });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  if (recovery) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-white/70">
          Passkey créée ✅ Voici ton <strong>code de récupération</strong>. Sauvegarde-le :
          il permet de te connecter si tu perds ta passkey.
        </p>
        {recovery.qr && (
          <img
            src={recovery.qr}
            alt="QR du code de récupération"
            className="mx-auto rounded-lg bg-white p-2"
            width={200}
            height={200}
          />
        )}
        <div className="rounded-lg border border-white/15 bg-black/30 p-3 text-center font-mono text-lg tracking-widest">
          {recovery.code}
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(recovery.code)}
          className="w-full rounded-lg bg-white/10 py-2 text-sm hover:bg-white/20"
        >
          Copier le code
        </button>
        <p className="text-xs text-white/40">
          Ce code n'est affiché qu'une fois. Il est aussi stocké (haché) sur la machine
          dans <code>~/.claude-epaper/auth.json</code> — un accès direct au Pi permet de le
          réinitialiser en supprimant ce fichier.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          J'ai sauvegardé mon code de récupération
        </label>
        <button
          disabled={!saved}
          onClick={onAuthenticated}
          className="w-full rounded-lg bg-[#d97757] py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          Entrer dans le dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/70">
        Première connexion : protège ce dashboard avec une <strong>passkey</strong>
        (Touch ID, Face ID, ou clé de sécurité).
      </p>
      {error && <p className="text-sm text-[#e0806a]">{error}</p>}
      <button
        disabled={busy}
        onClick={create}
        className="w-full rounded-lg bg-[#d97757] py-2.5 text-sm font-medium text-black disabled:opacity-50"
      >
        {busy ? 'Création…' : 'Créer une passkey'}
      </button>
      <p className="text-xs text-white/40">
        Les passkeys nécessitent un accès sécurisé (HTTPS, ou <code>localhost</code>). Sur une
        IP LAN en HTTP, l'API navigateur est indisponible.
      </p>
    </div>
  );
}

/* --------------------------------- login ---------------------------------- */

function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');

  const withPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginPasskey();
      onAuthenticated();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const withRecovery = async () => {
    setBusy(true);
    setError(null);
    try {
      await recoverWithCode(code);
      onAuthenticated();
    } catch {
      setError('Code de récupération invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/70">Connexion requise.</p>
      {error && <p className="text-sm text-[#e0806a]">{error}</p>}

      {!useRecovery ? (
        <>
          <button
            disabled={busy}
            onClick={withPasskey}
            className="w-full rounded-lg bg-[#d97757] py-2.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? 'Connexion…' : 'Se connecter avec la passkey'}
          </button>
          <button
            onClick={() => setUseRecovery(true)}
            className="w-full text-center text-xs text-white/50 hover:text-white/80"
          >
            Passkey perdue ? Utiliser un code de récupération
          </button>
        </>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-center font-mono tracking-widest"
          />
          <button
            disabled={busy || code.length < 5}
            onClick={withRecovery}
            className="w-full rounded-lg bg-[#d97757] py-2.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {busy ? 'Vérification…' : 'Se connecter'}
          </button>
          <button
            onClick={() => setUseRecovery(false)}
            className="w-full text-center text-xs text-white/50 hover:text-white/80"
          >
            ← Revenir à la passkey
          </button>
        </>
      )}
    </div>
  );
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('already-configured')) return 'Déjà configuré.';
  if (/NotAllowed|abort/i.test(msg)) return 'Opération annulée.';
  return `Échec : ${msg}`;
}
