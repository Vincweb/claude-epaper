import { useEffect, useState } from 'react';
import { posePreviewUrl, savePoseLook, type Look, type LookPart, type LookParts, type PoseInfo } from '../api';
import { ClawdLive } from './ClawdLive';

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
  const uploads = [pose.epaper.custom && 'e-paper', pose.web.custom && 'web'].filter(Boolean);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#1a1613] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Générer « {pose.title} »</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>

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
            <figcaption className="text-[10px] text-white/40">E-paper · 1 image/s</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-1">
            <div className="rounded-xl bg-white/[0.04] p-2">
              <ClawdLive look={look} size={236} title="Aperçu web" gaze />
            </div>
            <figcaption className="text-[10px] text-white/40">Web · en direct</figcaption>
          </figure>
        </div>

        <div className="space-y-3">
          {PART_ORDER.map((part) => (
            <div key={part}>
              <div className="mb-1 text-xs font-medium text-white/60">{PART_LABELS[part]}</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(parts[part]).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setLook((l) => ({ ...l, [part]: value }))}
                    className={`rounded-full px-3 py-1 text-xs ${
                      look[part] === value ? 'bg-[#d97757] text-black' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {uploads.length > 0 && (
          <p className="mt-4 text-xs text-[#e0956f]">
            Générer remplacera ton fichier uploadé ({uploads.join(' + ')}).
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

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
              className="rounded-lg bg-[#d97757] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#e0956f] disabled:opacity-40"
            >
              {busy ? 'Génération…' : 'Générer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
