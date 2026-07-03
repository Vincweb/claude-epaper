import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppData } from '../App';
import {
  checkUpdate,
  getConfig,
  getVersion,
  importCredentials,
  putConfig,
  registerPasskey,
  systemUpdate,
  type UpdateCheck,
  type VersionInfo,
} from '../api';
import type { AppConfig } from '../lib/usage';

const field = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const { refreshConfig } = useAppData();
  const [saved, setSaved] = useState<AppConfig | null>(null);
  const [form, setForm] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [upd, setUpd] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getConfig().then((c) => {
      setSaved(c);
      setForm(c);
    });
    getVersion().then(setVersion).catch(() => {});
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

  const doUpdate = async () => {
    if (!confirm('Mettre à jour l’app (git pull + build + redémarrage) ? Le serveur va redémarrer.')) return;
    setUpdateMsg('Mise à jour lancée… (1–2 min, le serveur va redémarrer)');
    try {
      await systemUpdate();
    } catch {
      setUpdateMsg('❌ Impossible de lancer la mise à jour (installée en service ?)');
      return;
    }
    const ping = () => fetch('/api/auth/state', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
    const t0 = Date.now();
    // 1) attendre que le serveur redémarre (tombe)…
    while (Date.now() - t0 < 240_000) {
      await sleep(3000);
      if (!(await ping())) break;
    }
    // 2) …puis qu'il revienne, et recharger.
    while (Date.now() - t0 < 300_000) {
      await sleep(3000);
      if (await ping()) {
        location.reload();
        return;
      }
    }
    setUpdateMsg('⚠️ Délai dépassé — vérifie ~/.claude-epaper/update.log');
  };

  return (
    <div className="w-full max-w-md self-center">
      <h2 className="mb-4 text-lg font-semibold">Configuration</h2>

      <div className="space-y-4">
        <Section title="Claude" hint="Connexion aux limites de ton compte Claude Code.">
          <div>
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
          </div>

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
            <input type="date" className={field} value={form.birthday} onChange={(e) => patch({ birthday: e.target.value })} />
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

        <Section title="Affichage" hint="Rendu envoyé à la dalle e-paper.">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">Palette</label>
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
              onClick={doUpdate}
              className={`rounded-lg px-3 py-2 text-sm ${
                upd && upd.behind > 0
                  ? 'bg-[#d97757] font-medium text-black'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              ⟳ Mettre à jour l'app
            </button>
            {updateMsg && <span className="text-xs text-white/70">{updateMsg}</span>}
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
    </div>
  );
}
