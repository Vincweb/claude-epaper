import { useCallback, useEffect, useState } from 'react';
import {
  addRotationPose,
  deletePose,
  loadGallery,
  poseAssetUrl,
  renamePose,
  resetPoseLook,
  restoreDefaultMoods,
  type Gallery,
  type LookParts,
  type PoseInfo,
  type SpriteVariant,
} from '../api';
import { ClawdLive } from './ClawdLive';
import { Icon } from './Icon';
import { PoseEditor } from './PoseEditor';

/** Déclencheurs des poses spéciales (informatif). */
const POSE_DESC: Record<string, string> = {
  neutral: 'pose par défaut',
  sleep: 'la nuit ou après inactivité',
  birthday: 'le jour J (date en config)',
  alert: 'jauge au 1ᵉʳ seuil',
  worried: 'jauge au 2ᵉ seuil',
  panic: 'jauge au maximum',
};

const VARIANT_INFO: Record<SpriteVariant, { label: string; hint: string; frame: string }> = {
  epaper: {
    label: 'E-paper (noir & blanc)',
    hint: 'Le sprite exact de la dalle : GIF 118×118, noir & blanc, 1 image/s.',
    frame: 'bg-white',
  },
  web: {
    label: 'Web (couleur, HD)',
    hint: 'Dessiné en direct sur le dashboard (couleur, fluide).',
    frame: 'bg-white/[0.04]',
  },
};

function PoseCard({
  pose,
  variant,
  bump,
  onChanged,
  onGenerate,
}: {
  pose: PoseInfo;
  variant: SpriteVariant;
  bump: number;
  onChanged: () => void;
  /** Ouvre l'éditeur de look (absent tant que le catalogue n'est pas chargé). */
  onGenerate?: () => void;
}) {
  const info = pose[variant];
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

  const saveName = async () => {
    const t = name.trim();
    setEditing(false);
    if (t && t !== pose.title) await run(() => renamePose(pose.key, t));
    else setName(pose.title);
  };

  // Web : Clawd dessiné en direct, comme sur l'écran principal.
  const live = variant === 'web';
  const onReset = () => void run(() => resetPoseLook(pose.key));

  // Seules les humeurs de rotation sont supprimables (une par défaut peut être remise).
  const onRemove = () => {
    const back = pose.builtin ? ' Tu pourras la remettre plus tard.' : '';
    if (window.confirm(`Supprimer l'humeur « ${pose.title} » ?${back}`)) void run(() => deletePose(pose.key));
  };

  return (
    <div className="card flex flex-col items-center p-3">
      <div className={`rounded-xl p-2 ${VARIANT_INFO[variant].frame}`}>
        {live ? (
          <ClawdLive look={pose.look} size={118} title={pose.title} />
        ) : (
          <img
            src={poseAssetUrl(variant, pose.key, bump)}
            alt={pose.title}
            className="h-[118px] w-[118px] object-contain"
            style={variant === 'epaper' ? { imageRendering: 'pixelated' } : undefined}
          />
        )}
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
            className="field py-1 text-center font-semibold"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Renommer"
            aria-label={`Renommer « ${pose.title} »`}
            className="text-sm font-semibold hover:text-accent-soft"
          >
            <span className="inline-flex items-center gap-1.5">
              {pose.title} <Icon name="pencil" className="size-3.5 text-white/45" />
            </span>
          </button>
        )}
        <div className="text-xs text-white/55">
          {POSE_DESC[pose.key] ?? (pose.builtin ? 'humeur par défaut' : 'humeur personnalisée')}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/60">
            {live ? 'vectoriel animé' : info.animated ? 'GIF animé' : 'PNG'}
          </span>
          {pose.lookCustom && (
            <span className="rounded-full bg-accent/25 px-2 text-[10px] text-accent-soft">généré</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={busy}
            title="Composer le look (yeux, bouche, accessoires, animation)"
            className="btn btn-sm btn-primary"
          >
            Modifier le look
          </button>
        )}
        <a
          href={poseAssetUrl(variant, pose.key, bump)}
          download={`${pose.key}-${variant}.${ext}`}
          className="btn btn-sm"
        >
          Télécharger
        </a>
        {pose.lookCustom && (
          <button
            onClick={onReset}
            disabled={busy}
            title="Revenir au dessin d'origine"
            className="btn btn-sm"
          >
            Réinitialiser
          </button>
        )}
        {pose.userAdded && (
          <button
            onClick={onRemove}
            disabled={busy}
            className="btn btn-sm btn-danger"
          >
            Supprimer
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-[10px] text-bad">{error}</div>}
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
    <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-white/15 p-3 text-center">
      <div className="text-2xl text-white/55">＋</div>
      <div className="mb-2 text-sm font-semibold text-white/70">Nouvelle humeur</div>
      <div className="text-xs text-white/55">
        Ajoutée à la rotation, avec une tête tirée de son nom. Change-la ensuite avec « Modifier le look ».
      </div>
      <input
        value={name}
        maxLength={40}
        placeholder="Nom de l'humeur"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
        className="field mt-3 text-center"
      />
      <button
        onClick={() => void add()}
        disabled={busy || !name.trim()}
        className="btn btn-sm btn-primary mt-2"
      >
        Ajouter
      </button>
      {error && <div className="mt-1 text-[10px] text-bad">{error}</div>}
    </div>
  );
}

/** Humeurs par défaut supprimées : un bouton pour les remettre en rotation. */
function RestoreDefaults({ missing, onRestored }: { missing: Gallery['missingDefaults']; onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!missing.length) return null;
  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      await restoreDefaultMoods();
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'échec');
    } finally {
      setBusy(false);
    }
  };
  const names = missing.map((m) => `« ${m.title} »`).join(', ');
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button onClick={() => void restore()} disabled={busy} className="btn btn-sm">
        <Icon name="undo" className="size-4" />
        {missing.length > 1 ? 'Remettre les humeurs par défaut' : 'Remettre l’humeur par défaut'}
      </button>
      <span className="text-xs text-white/55">{names}</span>
      {error && <span className="text-[10px] text-bad">{error}</span>}
    </div>
  );
}

/** Galerie des poses : visuels e-paper (N&B) et web (couleur), en deux groupes
 * (rotation / spéciales). Chaque pose = un sprite généré depuis son look (éditeur),
 * renommable ; les poses de rotation s'ajoutent/suppriment, celles par défaut
 * (Réfléchit, Travaille, Terminé…) se remettent si on les a supprimées. */
export function StylesGallery() {
  const [poses, setPoses] = useState<PoseInfo[]>([]);
  const [parts, setParts] = useState<LookParts | null>(null);
  const [missingDefaults, setMissingDefaults] = useState<Gallery['missingDefaults']>([]);
  const [editing, setEditing] = useState<PoseInfo | null>(null);
  const [variant, setVariant] = useState<SpriteVariant>('epaper');
  const [bump, setBump] = useState(1); // cache-bust des <img> après un changement

  const reload = useCallback(() => {
    void loadGallery().then((g) => {
      setPoses(g.poses);
      setParts(g.parts);
      setMissingDefaults(g.missingDefaults);
    });
    setBump((b) => b + 1);
  }, []);

  useEffect(() => reload(), [reload]);

  const rotation = poses.filter((p) => !p.special);
  const special = poses.filter((p) => p.special);

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-center">
        <div className="segmented text-xs">
          {(['epaper', 'web'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              aria-pressed={variant === v}
              className="seg px-4"
            >
              {VARIANT_INFO[v].label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-5 text-center text-xs text-white/55">{VARIANT_INFO[variant].hint}</p>

      <h3 className="mb-1 text-sm font-semibold text-white/80">En rotation</h3>
      <p className="mb-3 text-xs text-white/55">
        Choisies au fil de la journée (et via le dé de l’écran principal). Celles marquées « humeur par défaut »
        sont fournies d’office ; ajoute les tiennes, renomme-les, génère leur look ou supprime-les.{' '}
        {rotation.length === 0 && 'Aucune pour l’instant — Clawd reste Tranquille.'}
      </p>
      <RestoreDefaults missing={missingDefaults} onRestored={reload} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rotation.map((p) => (
          <PoseCard
            key={`${variant}-${p.key}`}
            pose={p}
            variant={variant}
            bump={bump}
            onChanged={reload}
            onGenerate={parts ? () => setEditing(p) : undefined}
          />
        ))}
        <AddPoseCard onAdded={reload} />
      </div>

      <h3 className="mb-1 mt-8 text-sm font-semibold text-white/80">Spéciales</h3>
      <p className="mb-3 text-xs text-white/55">
        Poses de base, déclenchées par un état : <strong>Tranquille</strong> (par défaut / repli),
        niveau des jauges (sous pression → stressé → cramé), nuit/inactivité (dodo) ou anniversaire.
        Renommables, mais pas supprimables.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {special.map((p) => (
          <PoseCard
            key={`${variant}-${p.key}`}
            pose={p}
            variant={variant}
            bump={bump}
            onChanged={reload}
            onGenerate={parts ? () => setEditing(p) : undefined}
          />
        ))}
      </div>

      {editing && parts && (
        <PoseEditor pose={editing} parts={parts} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  );
}
