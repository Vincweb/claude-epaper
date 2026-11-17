import { StylesGallery } from '../components/StylesGallery';
import { Field, fieldCls, NumberInput, SaveFooter, Section, useConfigDraft } from '../components/ui';

const KEYS = ['birthday', 'inactivityMinutes', 'rotateMinutes'] as const;

/** Quand Clawd change d'humeur : anniversaire, sommeil, rotation. */
function MoodSettings() {
  const draft = useConfigDraft(KEYS);
  return (
    <details className="group mb-6 w-full">
      <summary className="mx-auto w-fit cursor-pointer select-none rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">
        Réglages du comportement de Clawd
      </summary>
      <div className="mx-auto mt-3 max-w-md">
        <Section title="Comportement" hint="Quand Clawd change d'humeur tout seul." footer={<SaveFooter draft={draft} />}>
          <fieldset disabled={!draft.ready} className="space-y-3">
          <Field label="Anniversaire (pose spéciale le jour J)">
            {(id) => (
              <input
                id={id}
                type="date"
                className={`${fieldCls} box-border block min-w-0 appearance-none`}
                value={draft.value('birthday')}
                onChange={(e) => draft.set({ birthday: e.target.value })}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 items-end gap-2">
            <Field label="Dodo après inactivité">
              {(id) => (
                <NumberInput
                  id={id}
                  min={1}
                  max={1440}
                  suffix="min"
                  value={draft.value('inactivityMinutes')}
                  onChange={(n) => draft.set({ inactivityMinutes: n })}
                />
              )}
            </Field>
            <Field label="Changer d'humeur toutes les">
              {(id) => (
                <NumberInput
                  id={id}
                  min={1}
                  max={1440}
                  suffix="min"
                  value={draft.value('rotateMinutes')}
                  onChange={(n) => draft.set({ rotateMinutes: n })}
                />
              )}
            </Field>
          </div>
          </fieldset>
        </Section>
      </div>
    </details>
  );
}

export function HumeursPage() {
  return (
    <div className="w-full">
      <MoodSettings />
      <StylesGallery />
    </div>
  );
}
