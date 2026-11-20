import { useState } from 'react';
import { posePreviewUrl, savePoseLook, type Look, type LookPart, type LookParts, type PoseInfo } from '../api';
import { ClawdLive } from './ClawdLive';
import { Icon } from './Icon';
import { Modal } from './Modal';

const PART_LABELS: Record<LookPart, string> = {
  eyes: 'Yeux',
  mouth: 'Bouche',
  accessory: 'Accessoire',
  overhead: 'Au-dessus',
  motion: 'Animation',
};
const PART_ORDER: LookPart[] = ['motion', 'eyes', 'mouth', 'accessory', 'overhead'];

const pickOne = (o: Record<string, string>) => {
  const keys = Object.keys(o);
  return keys[Math.floor(Math.random() * keys.length)];
};

/** Tirage au sort : un seul extra (accessoire OU chapeau) pour rester lisible. */
function randomLook(parts: LookParts): Look {
  const extra = Math.random();
  return {
    eyes: pickOne(parts.eyes),
    mouth: pickOne(parts.mouth),
    accessory: extra < 0.5 ? pickOne(parts.accessory) : 'none',
    overhead: extra >= 0.5 ? pickOne(parts.overhead) : 'none',
    motion: pickOne(parts.motion),
  };
}

/**
 * Éditeur de look : compose une humeur à partir des pièces de Clawd (yeux,
 * bouche, accessoire, objet au-dessus, animation). Aperçu e-paper généré par le
 * serveur (le GIF exact de la dalle) ; aperçu web dessiné en direct, instantané.
 */
export function PoseEditor({
  pose,
  parts,
  onClose,
  onSaved,
}: {
  pose: PoseInfo;
  parts: LookParts;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [look, setLook] = useState<Look>(pose.look);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await savePoseLook(pose.key, look);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'échec');
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLook(randomLook(parts))}
        aria-label="Look au hasard"
        title="Look au hasard"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white/80 hover:bg-white/20 sm:size-10"
      >
        <Icon name="dice" className="size-5" />
      </button>
      <span className="flex-1" />
      <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-3 text-sm hover:bg-white/20 sm:py-2">
        Annuler
      </button>
      <button
        onClick={() => void save()}
        disabled={busy}
        className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-black hover:bg-accent-soft disabled:opacity-40 sm:py-2"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );

  return (
    <Modal title={pose.title} onClose={onClose} className="sm:max-w-2xl" z="z-30" footer={footer}>
      {/* Aperçus collés en haut : on voit le résultat pendant qu'on choisit les pièces. */}
      <div className="sticky top-0 z-10 -mx-5 mb-3 bg-panel/95 px-5 pb-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          <figure className="flex flex-col items-center gap-1.5">
            <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl bg-white p-2">
              <img
                src={posePreviewUrl('epaper', look)}
                alt="Aperçu e-paper"
                className="size-full"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <figcaption className="text-[11px] text-white/55">E-paper · 1 image/s</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1.5">
            <div className="grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl bg-white/[0.05] p-2">
              <ClawdLive look={look} size={220} className="size-full" title="Aperçu web" gaze />
            </div>
            <figcaption className="text-[11px] text-white/55">Web · en direct</figcaption>
          </figure>
        </div>
      </div>

      <div className="space-y-4">
        {PART_ORDER.map((part) => (
          <fieldset key={part}>
            <legend className="mb-1.5 text-xs font-medium text-white/70">{PART_LABELS[part]}</legend>
            {/* Mobile : une ligne qui défile au doigt ; ordinateur : pastilles sur plusieurs lignes. */}
            <div className="-mx-5 flex snap-x gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {Object.entries(parts[part]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLook((l) => ({ ...l, [part]: value }))}
                  aria-pressed={look[part] === value}
                  className={`shrink-0 snap-start whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors sm:py-1 sm:text-xs ${
                    look[part] === value ? 'bg-accent text-black' : 'bg-white/[0.08] text-white/85 hover:bg-white/15'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Modal>
  );
}
