import type { UsageSnapshot } from './types.js';
import type { AppConfig } from './config.js';

// Logique de mascotte partagée (miroir de web/src/lib/usage.ts) pour le rendu e-paper.

export {
  LOOK_PARTS,
  lookFromName,
  sanitizeLook,
  type ClawdAccessory,
  type ClawdEyes,
  type ClawdMotion,
  type ClawdMouth,
  type ClawdOverhead,
  type Look,
  type Pose,
} from './look.js';
import type { Pose } from './look.js';

export interface Stat {
  key: string;
  label: string;
  value: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Pose par défaut / repli (spéciale) : affichée quand rien d'autre ne s'applique.
const NEUTRAL: Pose = { key: 'neutral', title: 'Tranquille', eyes: 'square', motion: 'idle' };
// Poses contextuelles (déclenchées par un état, jamais par la rotation).
const SLEEP: Pose = { key: 'sleep', title: 'Dodo', eyes: 'sleep', overhead: 'zzz', motion: 'sleep' };
const BIRTHDAY: Pose = {
  key: 'birthday',
  title: 'Joyeux anniversaire !',
  eyes: 'happy',
  overhead: 'sparkle-hat',
  motion: 'bounce',
};
// Poses de stress selon la jauge la plus contrainte (seuils de config).
const ALERT: Pose = { key: 'alert', title: 'Sous pression', eyes: 'square', mouth: 'line', motion: 'nervous' };
const WORRIED: Pose = { key: 'worried', title: 'Stressé', eyes: 'square', mouth: 'open', motion: 'shake' };
const PANIC: Pose = { key: 'panic', title: 'Cramé', eyes: 'cross', mouth: 'open', motion: 'shake' };

/** Pose de repli, affichée par défaut (rotation vide, aucune personnalisée). */
export const DEFAULT_POSE: Pose = NEUTRAL;

/* Humeurs PAR DÉFAUT : ce que fait Claude, dans l'ordre d'une tâche — il
 * réfléchit, cherche, travaille, parle, a terminé, fait une pause. Inspirées
 * des visuels officiels : Travaille = le GIF où Clawd se tourne de 3/4 pour
 * taper sur son ordinateur ; Recherche = le sticker du détective (chapeau, œil
 * plissé, loupe qui grossit l'autre œil) ; Terminé = le drapeau à damier du
 * GIF ; Pause café = le sticker de la tasse ; Réfléchit = la bulle de pensée.
 * Clés STABLES : ce sont elles que viseront les événements Claude Code (cf.
 * ROADMAP, plugin multi-appareils). Elles ne sont pas codées dans la rotation :
 * poses.ts les SÈME une fois chacune dans les humeurs perso (poses.json) →
 * renommables, look modifiable, supprimables comme les autres ;
 * « Réinitialiser » revient au look dessiné ici. */
const THINK: Pose = { key: 'think', title: 'Réfléchit', eyes: 'square', overhead: 'bubble', motion: 'think' };
const WORK: Pose = { key: 'work', title: 'Travaille', eyes: 'square', accessory: 'laptop-side', motion: 'type' };
const SEARCH: Pose = {
  key: 'search',
  title: 'Recherche',
  eyes: 'peer',
  accessory: 'magnifier',
  overhead: 'detective',
  motion: 'search',
};
const TALK: Pose = { key: 'talk', title: 'Parle', eyes: 'square', mouth: 'talk', overhead: 'speech', motion: 'sway' };
const DONE: Pose = { key: 'done', title: 'Terminé', eyes: 'happy', accessory: 'flag', motion: 'bounce' };
const COFFEE: Pose = { key: 'coffee', title: 'Pause café', eyes: 'square', accessory: 'coffee', motion: 'idle' };

/** Humeurs fournies d'office dans la rotation (semées une fois, cf. poses.ts). */
export const DEFAULT_MOODS: Pose[] = [THINK, SEARCH, WORK, TALK, DONE, COFFEE];

/** La rotation ne contient AUCUNE pose codée : elle est entièrement composée
 * des humeurs de poses.json — les humeurs par défaut semées une fois, puis
 * celles ajoutées par l'utilisateur (cf. poses.ts). */
export const SHUFFLE_POOL: Pose[] = [];

/** Poses spéciales (déclenchées par un état, pas la rotation) — pour la galerie. */
export const SPECIAL_POSES: Pose[] = [NEUTRAL, ALERT, WORRIED, PANIC, SLEEP, BIRTHDAY];

/** Toutes les poses de base (spéciales) — sert à générer les sprites pixel art. */
export const ALL_POSES: Pose[] = [...SPECIAL_POSES];

export function poseByKey(key: string): Pose | undefined {
  return ALL_POSES.find((p) => p.key === key);
}

export function birthdayKey(birthday: string): string | null {
  const m = birthday.match(/(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** Un contexte force-t-il une pose ? Ordre : anniversaire → cramé (jauge au max)
 * → dodo (nuit/inactif) → stressé → sous pression. Sinon rotation libre. */
export function forcedPose(opts: {
  now: Date;
  config: Pick<AppConfig, 'birthday' | 'inactivityMinutes' | 'thresholds'>;
  lastActivityAt: string | null;
  snapshot?: UsageSnapshot | null;
}): Pose | null {
  const { now, config, lastActivityAt, snapshot } = opts;
  const hour = now.getHours();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (config.birthday && birthdayKey(config.birthday) === today) return BIRTHDAY;
  // Jauge la plus contrainte (comme l'humeur globale du web).
  const worst = snapshot ? Math.max(snapshot.fiveHour.utilization, snapshot.sevenDay.utilization) : 0;
  const t = config.thresholds;
  if (worst >= t.panic) return PANIC;
  const inactiveMs = lastActivityAt ? now.getTime() - new Date(lastActivityAt).getTime() : 0;
  const isNight = hour >= 22 || hour < 6;
  if (isNight || inactiveMs > Math.max(1, config.inactivityMinutes) * 60_000) return SLEEP;
  if (worst >= t.worried) return WORRIED;
  if (worst >= t.alert) return ALERT;
  return null;
}

export function selectPose(opts: {
  now: Date;
  config: AppConfig;
  lastActivityAt: string | null;
  snapshot?: UsageSnapshot | null;
  /** Poses de rotation (personnalisées par l'utilisateur) — seule source de rotation. */
  rotation?: Pose[];
}): Pose {
  const forced = forcedPose(opts);
  if (forced) return forced;
  const pool = opts.rotation ?? [];
  if (!pool.length) return DEFAULT_POSE; // rien de personnalisé → pose par défaut
  const { now, config } = opts;
  const rot = config.rotateMinutes > 0 ? config.rotateMinutes : 30;
  const bucket = Math.floor(now.getTime() / (rot * 60_000));
  return pool[bucket % pool.length];
}

export function deriveStats(snap: UsageSnapshot | null, lastActivityAt: string | null): Stat[] {
  const five = snap?.fiveHour.utilization ?? 0;
  const seven = snap?.sevenDay.utilization ?? 0;
  const energie = clamp(100 - five);
  const forme = clamp(100 - seven);
  const inactiveMin = lastActivityAt ? (Date.now() - new Date(lastActivityAt).getTime()) / 60_000 : 0;
  const repu = clamp(100 - (inactiveMin / 360) * 100);
  const bonheur = clamp((energie + forme + repu) / 3);
  return [
    { key: 'energie', label: 'Énergie', value: energie },
    { key: 'forme', label: 'Forme', value: forme },
    { key: 'repu', label: 'Repu', value: repu },
    { key: 'bonheur', label: 'Bonheur', value: bonheur },
  ];
}

export const XP_PER_LEVEL = 100;

export function levelInfo(bornAt: string, usageXp = 0): { level: number; label: string } {
  const t = bornAt ? new Date(bornAt).getTime() : Date.now();
  const ms = Math.max(0, Date.now() - t);
  const days = Math.floor(ms / 86_400_000);
  const level = 1 + Math.floor(days / 7) + Math.floor(usageXp / XP_PER_LEVEL);
  const label = days >= 1 ? `${days} j` : `${Math.floor(ms / 3_600_000)} h`;
  return { level, label };
}
