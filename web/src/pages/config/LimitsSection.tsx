import { Field, NumberInput, SaveFooter, Section, useConfigDraft } from '../../components/ui';
import { MOOD_LABEL, moodColor } from '../../lib/usage';

const KEYS = ['pollIntervalMs', 'thresholds'] as const;
const LEVELS = [
  { key: 'alert', mood: 'alert' },
  { key: 'worried', mood: 'worried' },
  { key: 'panic', mood: 'panic' },
] as const;

/** Fréquence d'appel de l'API usage et seuils des jauges (= humeurs de stress). */
export function LimitsSection() {
  const draft = useConfigDraft(KEYS);
  const t = draft.value('thresholds');
  const ordered = t.alert <= t.worried && t.worried <= t.panic;

  return (
    <Section
      title="Limites"
      hint="Fréquence d'appel de l'API et seuils des jauges."
      footer={<SaveFooter draft={draft} />}
    >
      <fieldset disabled={!draft.ready} className="space-y-3">
      <Field label="Fréquence de mise à jour" hint="Entre 30 s et 1 h. Plus court n'apporte rien : l'API se met à jour lentement.">
        {(id) => (
          <NumberInput
            id={id}
            min={30}
            max={3600}
            suffix="secondes"
            value={Math.round(draft.value('pollIntervalMs') / 1000)}
            onChange={(s) => draft.set({ pollIntervalMs: s * 1000 })}
          />
        )}
      </Field>

      <fieldset>
        <legend className="mb-1 text-xs text-white/70">Seuils des jauges (%) — Clawd change d'humeur à chaque palier</legend>
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map(({ key, mood }) => (
            <Field
              key={key}
              label={
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: moodColor(mood) }} />
                  {MOOD_LABEL[mood]}
                </span>
              }
            >
              {(id) => (
                <NumberInput
                  id={id}
                  min={1}
                  max={100}
                  value={t[key]}
                  onChange={(n) => draft.set({ thresholds: { ...t, [key]: n } })}
                />
              )}
            </Field>
          ))}
        </div>
        {!ordered && (
          <p className="mt-1 text-[11px] text-warn-soft">
            Les seuils seront remis dans l'ordre (sous pression ≤ stressé ≤ cramé) à l'enregistrement.
          </p>
        )}
      </fieldset>
      </fieldset>
    </Section>
  );
}
