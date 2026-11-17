import { useState } from 'react';
import { posePreviewUrl, savePoseLook, type Look, type LookPart, type LookParts, type PoseInfo } from '../api';
import { ClawdLive } from './ClawdLive';
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

  return (
    <Modal title={`Modifier le look de « ${pose.title} »`} onClose={onClose} className="max-w-2xl" z="z-20">

        <div className="mb-4 flex flex-wrap items-end justify-center gap-6">
          <figure className="flex flex-col items-center gap-1">
            <div className="rounded-xl bg-white p-2">
              <img
                src={posePreviewUrl('epaper', look)}
                alt="Aperçu e-paper"
                className="h-[236px] w-[236px]"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <figcaption className="text-[11px] text-white/55">E-paper · 1 image/s</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1">
            <div className="rounded-xl bg-white/[0.04] p-2">
              <ClawdLive look={look} size={236} title="Aperçu web" gaze />
            </div>
            <figcaption className="text-[11px] text-white/55">Web · en direct</figcaption>
          </figure>
        </div>

        <div className="space-y-3">
          {PART_ORDER.map((part) => (
            <div key={part}>
              <div className="mb-1 text-xs font-medium text-white/70">{PART_LABELS[part]}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(parts[part]).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setLook((l) => ({ ...l, [part]: value }))}
                    aria-pressed={look[part] === value}
                    className={`rounded-full px-3 py-1 text-xs ${
                      look[part] === value ? 'bg-accent text-black' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-2 text-xs text-bad">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => setLook(randomLook(parts))}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
          >
            🎲 Au hasard
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-1.5 text-xs hover:bg-white/20">
              Annuler
            </button>
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-black hover:bg-accent-soft disabled:opacity-40"
            >
              {busy ? 'Enregistrement…' : 'Enregistrer le look'}
            </button>
          </div>
        </div>
    </Modal>
  );
}
