import { useId, useState, type ReactNode } from 'react';
import { useAppData } from '../App';
import { putConfig } from '../api';
import type { AppConfig } from '../lib/usage';

/* Briques d'interface partagées par les pages de réglages. */

// Briques définies une fois dans index.css (@utility) : field, btn, btn-primary…
export const fieldCls = 'field';
export const btnCls = 'btn';
export const btnPrimaryCls = 'btn btn-primary';

/** Copie dans le presse-papiers, avec repli pour le HTTP sur IP LAN (contexte non sécurisé). */
export async function copyText(text: string): Promise<boolean> {
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

export function Section({
  title,
  hint,
  children,
  footer,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  /** Pied de section (ex. bouton Enregistrer). */
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card p-4 sm:p-5">
      <h3 id={id} className="text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
        {title}
      </h3>
      {hint && <p className="mt-0.5 text-[11px] text-white/55">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
      {footer && <div className="mt-4 flex items-center justify-end gap-3">{footer}</div>}
    </section>
  );
}

/** Libellé RELIÉ à son champ (clic, lecteurs d'écran). */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-white/70">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[11px] text-white/55">{hint}</p>}
    </div>
  );
}

/**
 * Brouillon d'un SOUS-ENSEMBLE de la config, enregistré indépendamment des
 * autres sections : seuls ces champs partent dans `PUT /config` (jamais
 * `usageXp`/`bornAt`, que le serveur gère seul).
 */
export function useConfigDraft<K extends keyof AppConfig>(keys: readonly K[]) {
  const { config, configReady, refreshConfig } = useAppData();
  const [draft, setDraft] = useState<Partial<Pick<AppConfig, K>>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const value = <F extends K>(k: F): AppConfig[F] => (k in draft ? (draft[k] as AppConfig[F]) : config[k]);
  const set = (p: Partial<Pick<AppConfig, K>>) => {
    setDraft((d) => ({ ...d, ...p }));
    setStatus(null);
  };
  const dirty = keys.some((k) => k in draft && JSON.stringify(draft[k]) !== JSON.stringify(config[k]));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const patch: Partial<AppConfig> = {};
      for (const k of keys) if (k in draft) (patch as Record<string, unknown>)[k] = draft[k];
      await putConfig(patch);
      refreshConfig();
      setDraft({});
      setStatus({ ok: true, text: 'Enregistré ✓' });
      setTimeout(() => setStatus((s) => (s?.ok ? null : s)), 2500);
    } catch (e) {
      setStatus({ ok: false, text: `Échec : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  };

  return { value, set, dirty, save, saving, status, ready: configReady, reset: () => setDraft({}) };
}

/** Bouton Enregistrer d'une section + état (non enregistré / enregistré / échec). */
export function SaveFooter({
  draft,
}: {
  draft: { dirty: boolean; saving: boolean; status: { ok: boolean; text: string } | null; save: () => Promise<void> };
}) {
  return (
    <>
      {draft.status ? (
        <span role="status" className={`text-xs ${draft.status.ok ? 'text-ok' : 'text-bad'}`}>
          {draft.status.text}
        </span>
      ) : (
        draft.dirty && <span className="text-xs text-white/55">Modifications non enregistrées</span>
      )}
      <button onClick={() => void draft.save()} disabled={draft.saving || !draft.dirty} className={btnPrimaryCls}>
        {draft.saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </>
  );
}

/**
 * Champ numérique tolérant la saisie : on peut vider le champ le temps de
 * taper, mais seule une valeur valide (bornée) est remontée ; en quittant le
 * champ, il reprend la dernière valeur valide (jamais de 0 issu d'un champ vide).
 */
export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(Math.round(n));
  };
  const invalid = text !== null && !(text.trim() !== '' && Number(text) >= min && Number(text) <= max);
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className={`${fieldCls} ${invalid ? 'border-bad/70' : ''}`}
        aria-invalid={invalid || undefined}
        value={shown}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setText(null)}
      />
      {suffix && <span className="shrink-0 text-xs text-white/55">{suffix}</span>}
    </div>
  );
}

/** Interrupteur (à la place d'une case à cocher native, détonnante sur sombre). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-accent' : 'bg-white/15'
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
