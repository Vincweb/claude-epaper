import { useState } from 'react';
import { useAppData } from '../App';
import { putConfig } from '../api';
import { EpaperView } from '../components/EpaperView';
import { Section } from '../components/ui';
import type { AppConfig } from '../lib/usage';

/** Aperçu de la dalle + ses réglages (appliqués immédiatement). */
export function EpaperPage() {
  const { state, live, config, configReady, refreshConfig } = useAppData();
  // Même verdict que la dalle (calculé par le serveur : tolère une erreur passagère).
  const online = Boolean(live && state?.online);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Valeur affichée tout de suite au clic, sans attendre l'aller-retour serveur.
  const [optimistic, setOptimistic] = useState<Partial<AppConfig>>({});
  const layout = optimistic.epaperLayout ?? config.epaperLayout;
  const rotate = optimistic.epaperRotate ?? config.epaperRotate;

  const apply = async (patch: Partial<AppConfig>) => {
    setOptimistic((o) => ({ ...o, ...patch }));
    setBusy(true);
    setError(null);
    try {
      await putConfig(patch);
      refreshConfig();
    } catch (e) {
      setOptimistic({});
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <EpaperView layout={layout} online={online} />

      <div className="w-full max-w-md">
        <Section title="Dalle" hint="Appliqué immédiatement à l'écran physique (2,13″, noir & blanc).">
          <fieldset disabled={!configReady || busy} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Orientation</span>
              <div className="flex overflow-hidden rounded-lg bg-white/10 text-xs" role="radiogroup" aria-label="Orientation">
                {(['horizontal', 'vertical'] as const).map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={layout === l}
                    onClick={() => layout !== l && void apply({ epaperLayout: l })}
                    className={`px-3 py-1.5 ${layout === l ? 'bg-accent text-black' : 'hover:bg-white/10'}`}
                  >
                    {l === 'horizontal' ? 'Horizontale 250×122' : 'Verticale 122×250'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Rotation 180°
                <span className="block text-[11px] text-white/55">Dalle montée à l'envers (l'aperçu reste à l'endroit).</span>
              </span>
              <input
                type="checkbox"
                className="size-4 accent-accent"
                checked={rotate === 180}
                onChange={(e) => void apply({ epaperRotate: e.target.checked ? 180 : 0 })}
              />
            </label>
          </fieldset>
          {error && <p className="text-xs text-bad">Échec : {error}</p>}
        </Section>
      </div>
    </div>
  );
}
