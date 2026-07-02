import { useEffect, useState } from 'react';
import type { AppConfig } from '../lib/usage';
import { getConfig, putConfig, importCredentials } from '../api';

export function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(setCfg);
  }, []);

  if (!cfg) return null;

  const patch = (p: Partial<AppConfig>) => setCfg({ ...cfg, ...p });

  const save = async () => {
    setSaving(true);
    const next = await putConfig(cfg);
    setCfg(next);
    setSaving(false);
  };

  const doImport = async () => {
    setImportMsg('Import…');
    const { imported } = await importCredentials();
    setImportMsg(imported ? '✅ Credentials importés' : '❌ Introuvables (voir README)');
  };

  const field = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1613] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configuration</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Fichier de credentials Claude Code
            </label>
            <input
              className={field}
              value={cfg.credentialsPath}
              onChange={(e) => patch({ credentialsPath: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.useMacKeychain}
              onChange={(e) => patch({ useMacKeychain: e.target.checked })}
            />
            Lire le Keychain macOS en repli
          </label>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Intervalle de rafraîchissement (secondes)
            </label>
            <input
              type="number"
              min={10}
              className={field}
              value={Math.round(cfg.pollIntervalMs / 1000)}
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
                  value={cfg.thresholds[k]}
                  onChange={(e) =>
                    patch({ thresholds: { ...cfg.thresholds, [k]: Number(e.target.value) } })
                  }
                />
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-3">
            <label className="mb-1 block text-xs text-white/60">
              Date d'anniversaire (pose spéciale le jour J)
            </label>
            <input
              type="date"
              className={field}
              value={cfg.birthday}
              onChange={(e) => patch({ birthday: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">Dodo après (min sans activité)</label>
              <input
                type="number"
                min={1}
                className={field}
                value={cfg.inactivityMinutes}
                onChange={(e) => patch({ inactivityMinutes: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Changement de pose (min)</label>
              <input
                type="number"
                min={1}
                className={field}
                value={cfg.rotateMinutes}
                onChange={(e) => patch({ rotateMinutes: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Affichage physique</label>
            <select
              className={field}
              value={cfg.display}
              onChange={(e) => patch({ display: e.target.value as AppConfig['display'] })}
            >
              <option value="null">Aucun (web seulement)</option>
              <option value="epaper">e-paper (Raspberry Pi)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">Palette e-paper</label>
              <select
                className={field}
                value={cfg.epaperPalette}
                onChange={(e) => patch({ epaperPalette: e.target.value as AppConfig['epaperPalette'] })}
              >
                <option value="bw">Noir &amp; blanc</option>
                <option value="bwr">Noir / blanc / rouge</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Mise en page</label>
              <select
                className={field}
                value={cfg.epaperLayout}
                onChange={(e) => patch({ epaperLayout: e.target.value as AppConfig['epaperLayout'] })}
              >
                <option value="compact">Compact 2.13"</option>
                <option value="full">Grand 7.5"</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Rotation 180° (dalle montée à l'envers)</span>
            <input
              type="checkbox"
              checked={cfg.epaperRotate === 180}
              onChange={(e) => patch({ epaperRotate: e.target.checked ? 180 : 0 })}
            />
          </label>

          <div className="flex items-center gap-3 border-t border-white/10 pt-3">
            <button
              onClick={doImport}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
            >
              Importer les credentials
            </button>
            {importMsg && <span className="text-xs text-white/70">{importMsg}</span>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-white/60">
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#d97757] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
