import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addRotationPose,
  deletePose,
  listPoses,
  poseAssetUrl,
  renamePose,
  resetPoseAsset,
  setPoseEnabled,
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
    label: 'Web (couleur, HD)',
    hint: 'Affiché sur le dashboard, lissé — PNG ou GIF couleur HD (≥ 480×480), fond transparent.',
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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pose.title);
  const ext = info.animated ? 'gif' : 'png';

  useEffect(() => setName(pose.title), [pose.title]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'échec');
    } finally {
      setBusy(false);
    }
  };

  const onUpload = (file: File | undefined) =>
    file &&
    run(() => uploadPoseAsset(variant, pose.key, file)).finally(() => {
      if (fileInput.current) fileInput.current.value = '';
    });

  const saveName = async () => {
    const t = name.trim();
    setEditing(false);
    if (t && t !== pose.title) await run(() => renamePose(pose.key, t));
    else setName(pose.title);
  };

  // « Supprimer » : réel pour une perso, masquage réversible pour une pose de base.
  // Uniquement en rotation (les spéciales ne sont pas supprimables).
  const removable = !pose.special;
  const onRemove = () => {
    if (pose.userAdded) {
      if (window.confirm(`Supprimer l'humeur « ${pose.title} » ?`)) void run(() => deletePose(pose.key));
    } else {
      void run(() => setPoseEnabled(pose.key, false));
    }
  };

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className={`rounded-xl p-2 ${VARIANT_INFO[variant].frame}`}>
        <img
          src={poseAssetUrl(variant, pose.key, bump)}
          alt={pose.title}
          className="h-[118px] w-[118px] object-contain"
          style={variant === 'epaper' ? { imageRendering: 'pixelated' } : undefined}
        />
      </div>
      <div className="mt-2 w-full text-center">
        {editing ? (
          <input
            value={name}
            autoFocus
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName();
              if (e.key === 'Escape') {
                setName(pose.title);
                setEditing(false);
              }
            }}
            className="w-full rounded bg-white/10 px-2 py-0.5 text-center text-sm font-semibold outline-none focus:bg-white/15"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Renommer"
            className="text-sm font-semibold hover:text-[#e0956f]"
          >
            {pose.title} <span className="text-white/30">✎</span>
          </button>
        )}
        <div className="text-xs text-white/45">{POSE_DESC[pose.key] ?? 'humeur personnalisée'}</div>
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
            onClick={() => void run(() => resetPoseAsset(variant, pose.key))}
            disabled={busy}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50"
          >
            Réinitialiser
          </button>
        )}
        {removable && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="rounded-lg bg-red-500/15 px-3 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-[10px] text-red-400">{error}</div>}
    </div>
  );
}

function AddPoseCard({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    const t = name.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      await addRotationPose(t);
      setName('');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'échec');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-center">
      <div className="text-2xl text-white/30">＋</div>
      <div className="mb-2 text-sm font-semibold text-white/70">Nouvelle humeur</div>
      <div className="text-xs text-white/40">Ajoutée à la rotation. Remplace ensuite son visuel.</div>
      <input
        value={name}
        maxLength={40}
        placeholder="Nom de l'humeur"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
        className="mt-3 w-full rounded-lg bg-white/10 px-2 py-1 text-center text-sm outline-none focus:bg-white/15"
      />
      <button
        onClick={() => void add()}
        disabled={busy || !name.trim()}
        className="mt-2 rounded-lg bg-[#d97757] px-4 py-1 text-xs font-medium text-black hover:bg-[#e0956f] disabled:opacity-40"
      >
        Ajouter
      </button>
      {error && <div className="mt-1 text-[10px] text-red-400">{error}</div>}
    </div>
  );
}

/** Galerie des poses : visuels e-paper (N&B) et web (couleur), en deux groupes
 * (rotation / spéciales). Chaque pose = un PNG (fixe) ou GIF (animé) remplaçable,
 * renommable ; les poses de rotation peuvent être ajoutées/supprimées. */
export function StylesGallery() {
  const [poses, setPoses] = useState<PoseInfo[]>([]);
  const [variant, setVariant] = useState<SpriteVariant>('epaper');
  const [bump, setBump] = useState(1); // cache-bust des <img> après un changement

  const reload = useCallback(() => {
    void listPoses().then(setPoses);
    setBump((b) => b + 1);
  }, []);

  useEffect(() => reload(), [reload]);

  const rotation = poses.filter((p) => !p.special && !p.disabled);
  const hidden = poses.filter((p) => !p.special && p.disabled); // poses de base retirées
  const special = poses.filter((p) => p.special);

  const restoreAll = () => {
    void Promise.all(hidden.map((p) => setPoseEnabled(p.key, true))).then(reload);
  };

  return (
    <div className="w-full">
      <p className="mb-3 text-center text-sm text-white/50">
        Chaque pose est un fichier image remplaçable (PNG fixe, GIF animé) et renommable. Sur la
        dalle, un GIF est lu à 1 image/seconde avec une pause de 10 s entre les boucles ; sur le web
        il s'anime nativement.
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

      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white/80">En rotation</h3>
          <p className="text-xs text-white/40">
            Choisies au fil de la journée (et via 🎲). Renommables, supprimables, extensibles.
          </p>
        </div>
        {hidden.length > 0 && (
          <button
            onClick={restoreAll}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
            title="Réafficher les humeurs de base retirées"
          >
            ↺ Restaurer {hidden.length} retirée{hidden.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rotation.map((p) => (
          <PoseCard key={`${variant}-${p.key}`} pose={p} variant={variant} bump={bump} onChanged={reload} />
        ))}
        <AddPoseCard onAdded={reload} />
      </div>

      <h3 className="mb-1 mt-8 text-sm font-semibold text-white/80">Spéciales</h3>
      <p className="mb-3 text-xs text-white/40">
        Déclenchées par un état : niveau des jauges (sous pression → stressé → cramé), nuit/inactivité
        (dodo) ou anniversaire. Renommables, mais pas supprimables.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {special.map((p) => (
          <PoseCard key={`${variant}-${p.key}`} pose={p} variant={variant} bump={bump} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}
