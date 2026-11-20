import { Icon } from '../components/Icon';
import { StylesGallery } from '../components/StylesGallery';
import { Field, fieldCls, NumberInput, SaveFooter, Section, useConfigDraft } from '../components/ui';

const KEYS = ['birthday', 'inactivityMinutes', 'rotateMinutes'] as const;

/** Quand Clawd change d'humeur : anniversaire, sommeil, rotation. */
function MoodSettings() {
  const draft = useConfigDraft(KEYS);
  return (
    <details className="group mb-6 w-full">
      <summary className="btn btn-sm cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <Icon name="sliders" className="size-4" />
        Comportement de Clawd
        <span aria-hidden className="text-white/45 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 max-w-md">
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
      <h2 className="mb-1 text-lg font-semibold">Humeurs</h2>
      <p className="mb-4 max-w-xl text-xs text-white/55">
        Chaque humeur est animée en continu : compose son look (yeux, accessoires, animation) avec
        « Modifier le look ». La dalle lit l'animation à 1 image par seconde ; le web dessine Clawd en direct.
      </p>
      <MoodSettings />
      <StylesGallery />
    </div>
  );
}
