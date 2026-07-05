import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listPoses,
  poseAssetUrl,
  resetPoseAsset,
  uploadPoseAsset,
  type PoseInfo,
  type SpriteVariant,
} from '../api';

/** Descriptions & déclencheurs (informative ; les visuels viennent du serveur). */
const POSE_DESC: Record<string, string> = {
  neutral: 'pose par défaut',
  working: 'code / skateboard',
  coffee: 'le matin',
  content: 'tout roule',
  magic: 'un peu de magie',
  kiss: 'plein d’amour',
  sunny: 'lunettes + soleil',
  rainy: 'sous la pluie',
  ball: 'football',
  dizzy: 'fatigué / étourdi',
  sleep: 'la nuit ou après inactivité',
  birthday: 'le jour J (date en config)',
  alert: 'jauge au 1ᵉʳ seuil',
  worried: 'jauge au 2ᵉ seuil',
  panic: 'jauge au maximum',
};

const VARIANT_INFO: Record<SpriteVariant, { label: string; hint: string; frame: string }> = {
  epaper: {
    label: 'E-paper (noir & blanc)',
    hint: 'Affiché 1:1 sur la dalle — PNG ou GIF 118×118, noir & blanc, fond transparent.',
    frame: 'bg-white',
  },
  web: {
    label: 'Web (couleur)',
    hint: 'Affiché sur le dashboard — PNG ou GIF 236×236, couleur, fond transparent.',
    frame: 'bg-white/[0.04]',
  },
};

function PoseCard({
  pose,
  variant,
  bump,
  onChanged,
}: {
  pose: PoseInfo;
  variant: SpriteVariant;
  bump: number;
  onChanged: () => void;
}) {
  const info = pose[variant];
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ext = info.animated ? 'gif' : 'png';

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await uploadPoseAsset(variant, pose.key, file);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'échec de l’envoi');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await resetPoseAsset(variant, pose.key);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className={`rounded-xl p-2 ${VARIANT_INFO[variant].frame}`}>
        <img
          src={poseAssetUrl(variant, pose.key, bump)}
          alt={pose.title}
          className="h-[118px] w-[118px] object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <div className="mt-2 text-center">
        <div className="text-sm font-semibold">{pose.title}</div>
        <div className="text-xs text-white/45">{POSE_DESC[pose.key] ?? ''}</div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          <span className="rounded-full bg-white/10 px-2 text-[10px] text-white/50">
            {info.animated ? 'GIF animé' : 'PNG'}
          </span>
          {info.custom && (
            <span className="rounded-full bg-[#d97757]/25 px-2 text-[10px] text-[#e0956f]">personnalisé</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/gif"
          className="hidden"
          onChange={(e) => void onUpload(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
        >
          Remplacer…
        </button>
        <a
          href={poseAssetUrl(variant, pose.key, bump)}
          download={`${pose.key}-${variant}.${ext}`}
          className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
        >
          Télécharger
        </a>
        {info.custom && (
          <button
            onClick={() => void onReset()}
            disabled={busy}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
          >
            Réinitialiser
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-[10px] text-red-400">{error}</div>}
    </div>
  );
}

function PoseGrid({
  poses,
  variant,
  bump,
  onChanged,
}: {
  poses: PoseInfo[];
  variant: SpriteVariant;
  bump: number;
  onChanged: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {poses.map((p) => (
        <PoseCard key={`${variant}-${p.key}`} pose={p} variant={variant} bump={bump} onChanged={onChanged} />
      ))}
    </div>
  );
}

/** Galerie des poses : visuels e-paper (N&B) et web (couleur), en deux groupes
 * (rotation / spéciales). Chaque pose = un PNG (fixe) ou GIF (animé) remplaçable. */
export function StylesGallery() {
  const [poses, setPoses] = useState<PoseInfo[]>([]);
  const [variant, setVariant] = useState<SpriteVariant>('epaper');
  const [bump, setBump] = useState(1); // cache-bust des <img> après un changement

  const reload = useCallback(() => {
    void listPoses().then(setPoses);
    setBump((b) => b + 1);
  }, []);

  useEffect(() => reload(), [reload]);

  const rotation = poses.filter((p) => !p.special);
  const special = poses.filter((p) => p.special);

  return (
    <div className="w-full">
      <p className="mb-3 text-center text-sm text-white/50">
        Chaque pose est un fichier image remplaçable : PNG pour une pose fixe, GIF pour une pose
        animée. Sur la dalle, un GIF est lu à 1 image/seconde avec une pause de 10 s entre les
        boucles ; sur le web il s'anime nativement.
      </p>

      <div className="mb-1 flex justify-center">
        <div className="flex overflow-hidden rounded-lg bg-white/10 text-xs">
          {(['epaper', 'web'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`px-4 py-1.5 ${variant === v ? 'bg-[#d97757] text-black' : ''}`}
            >
              {VARIANT_INFO[v].label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-5 text-center text-xs text-white/40">{VARIANT_INFO[variant].hint}</p>

      <h3 className="mb-1 text-sm font-semibold text-white/80">En rotation</h3>
      <p className="mb-3 text-xs text-white/40">Choisies au fil de la journée (et via le bouton 🎲).</p>
      <PoseGrid poses={rotation} variant={variant} bump={bump} onChanged={reload} />

      <h3 className="mb-1 mt-8 text-sm font-semibold text-white/80">Spéciales</h3>
      <p className="mb-3 text-xs text-white/40">
        Déclenchées par un état : niveau des jauges (sous pression → stressé → cramé), nuit/inactivité
        (dodo) ou anniversaire.
      </p>
      <PoseGrid poses={special} variant={variant} bump={bump} onChanged={reload} />
    </div>
  );
}
