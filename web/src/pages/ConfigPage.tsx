import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../App';
import { getConfig, importCredentials, putConfig, registerPasskey } from '../api';
import type { AppConfig } from '../lib/usage';

const field = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm';

export function ConfigPage() {
  const { refreshConfig } = useAppData();
  const [saved, setSaved] = useState<AppConfig | null>(null);
  const [form, setForm] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then((c) => {
      setSaved(c);
      setForm(c);
    });
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

  const doImport = async () => {
    setImportMsg('Import…');
    const { imported } = await importCredentials();
    setImportMsg(imported ? '✅ Credentials importés' : '❌ Introuvables (voir README)');
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

  return (
    <div className="w-full max-w-md self-center">
      <h2 className="mb-4 text-lg font-semibold">Configuration</h2>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-white/60">Fichier de credentials Claude Code</label>
          <input className={field} value={form.credentialsPath} onChange={(e) => patch({ credentialsPath: e.target.value })} />
        </div>

        <div>
          <label className="mb-1 block text-xs text-white/60">Intervalle de rafraîchissement (secondes)</label>
          <input
            type="number"
            min={10}
            className={field}
            value={Math.round(form.pollIntervalMs / 1000)}
            onChange={(e) => patch({ pollIntervalMs: Number(e.target.value) * 1000 })}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['alert', 'worried', 'panic'] as const).map((k) => (
            <div key={k}>
              <label className="mb-1 block text-xs capitalize text-white/60">{k} %</label>
              <input
                type="number"
                className={field}
                value={form.thresholds[k]}
                onChange={(e) => patch({ thresholds: { ...form.thresholds, [k]: Number(e.target.value) } })}
              />
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3">
          <label className="mb-1 block text-xs text-white/60">Date d'anniversaire (pose spéciale le jour J)</label>
          <input type="date" className={field} value={form.birthday} onChange={(e) => patch({ birthday: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-white/60">Dodo après (min sans activité)</label>
            <input type="number" min={1} className={field} value={form.inactivityMinutes} onChange={(e) => patch({ inactivityMinutes: Number(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Changement de pose (min)</label>
            <input type="number" min={1} className={field} value={form.rotateMinutes} onChange={(e) => patch({ rotateMinutes: Number(e.target.value) })} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-white/60">Affichage physique</label>
          <select className={field} value={form.display} onChange={(e) => patch({ display: e.target.value as AppConfig['display'] })}>
            <option value="null">Aucun (web seulement)</option>
            <option value="epaper">e-paper (Raspberry Pi)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-white/60">Palette e-paper</label>
            <select className={field} value={form.epaperPalette} onChange={(e) => patch({ epaperPalette: e.target.value as AppConfig['epaperPalette'] })}>
              <option value="bw">Noir &amp; blanc</option>
              <option value="bwr">Noir / blanc / rouge</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Mise en page</label>
            <select className={field} value={form.epaperLayout} onChange={(e) => patch({ epaperLayout: e.target.value as AppConfig['epaperLayout'] })}>
              <option value="compact">Compact 2.13"</option>
              <option value="full">Grand 7.5"</option>
            </select>
          </div>
        </div>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span>Rotation 180° (dalle montée à l'envers)</span>
          <input type="checkbox" checked={form.epaperRotate === 180} onChange={(e) => patch({ epaperRotate: e.target.checked ? 180 : 0 })} />
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
          <button onClick={doImport} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
            Importer les credentials
          </button>
          {importMsg && <span className="text-xs text-white/70">{importMsg}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={resetPasskey} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
            Réinitialiser la passkey
          </button>
          {passkeyMsg && <span className="text-xs text-white/70">{passkeyMsg}</span>}
        </div>
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
    </div>
  );
}
