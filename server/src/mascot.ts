import type { UsageSnapshot } from './types.js';
import type { AppConfig } from './config.js';

// Logique de mascotte partagée (miroir de web/src/lib/usage.ts) pour le rendu e-paper.

export type ClawdEyes = 'square' | 'wide' | 'happy' | 'sleep' | 'spiral' | 'wink' | 'shades';
export type ClawdMouth = 'none' | 'line' | 'open' | 'kiss';
export type ClawdAccessory = 'none' | 'laptop' | 'coffee' | 'ball' | 'wand' | 'heart';
export type ClawdOverhead = 'none' | 'party' | 'zzz' | 'sparkle-hat' | 'sun' | 'umbrella';

export interface Pose {
  key: string;
  title: string;
  eyes: ClawdEyes;
  mouth?: ClawdMouth;
  accessory?: ClawdAccessory;
  overhead?: ClawdOverhead;
}

export interface Stat {
  key: string;
  label: string;
  value: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const NEUTRAL: Pose = { key: 'neutral', title: 'Tranquille', eyes: 'square' };
const WORKING: Pose = { key: 'working', title: 'Au travail', eyes: 'square', accessory: 'laptop' };
const CONTENT: Pose = { key: 'content', title: 'Content', eyes: 'happy' };
const MAGIC: Pose = { key: 'magic', title: 'Un peu de magie', eyes: 'square', accessory: 'wand' };
const COFFEE: Pose = { key: 'coffee', title: 'Pause café', eyes: 'square', accessory: 'coffee' };
const SUNNY: Pose = { key: 'sunny', title: 'Au soleil', eyes: 'shades', overhead: 'sun' };
const RAINY: Pose = { key: 'rainy', title: 'Sous la pluie', eyes: 'square', overhead: 'umbrella' };
const KISS: Pose = { key: 'kiss', title: 'Bisou', eyes: 'wink', mouth: 'kiss', accessory: 'heart' };
const BALL: Pose = { key: 'ball', title: 'Football', eyes: 'happy', accessory: 'ball' };
const DIZZY: Pose = { key: 'dizzy', title: 'Étourdi', eyes: 'spiral' };
const SLEEP: Pose = { key: 'sleep', title: 'Dodo', eyes: 'sleep', overhead: 'zzz' };
const BIRTHDAY: Pose = { key: 'birthday', title: 'Joyeux anniversaire !', eyes: 'happy', overhead: 'sparkle-hat' };

const MORNING_POOL: Pose[] = [COFFEE, WORKING, NEUTRAL, CONTENT];
const DAY_POOL: Pose[] = [NEUTRAL, WORKING, CONTENT, MAGIC, SUNNY, KISS];

// Poses choisissables manuellement (bouton "changer la mascotte") : on exclut
// les poses purement contextuelles (anniversaire, dodo).
export const SHUFFLE_POOL: Pose[] = [
  NEUTRAL, WORKING, CONTENT, MAGIC, COFFEE, SUNNY, RAINY, KISS, BALL, DIZZY,
];

export function poseByKey(key: string): Pose | undefined {
  return SHUFFLE_POOL.find((p) => p.key === key);
}

export function birthdayKey(birthday: string): string | null {
  const m = birthday.match(/(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** Un contexte force-t-il une pose (anniversaire / dodo) ? Sinon rotation libre. */
export function forcedPose(opts: {
  now: Date;
  config: Pick<AppConfig, 'birthday' | 'inactivityMinutes'>;
  lastActivityAt: string | null;
}): Pose | null {
  const { now, config, lastActivityAt } = opts;
  const hour = now.getHours();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (config.birthday && birthdayKey(config.birthday) === today) return BIRTHDAY;
  const inactiveMs = lastActivityAt ? now.getTime() - new Date(lastActivityAt).getTime() : 0;
  const isNight = hour >= 22 || hour < 6;
  if (isNight || inactiveMs > Math.max(1, config.inactivityMinutes) * 60_000) return SLEEP;
  return null;
}

export function selectPose(opts: {
  now: Date;
  config: AppConfig;
  lastActivityAt: string | null;
}): Pose {
  const forced = forcedPose(opts);
  if (forced) return forced;
  const { now, config } = opts;
  const hour = now.getHours();
  const rot = config.rotateMinutes > 0 ? config.rotateMinutes : 30;
  const bucket = Math.floor(now.getTime() / (rot * 60_000));
  const pool = hour >= 6 && hour < 11 ? MORNING_POOL : DAY_POOL;
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

export function formatReset(resetsAt: string | null): string {
  if (!resetsAt) return '-';
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 'maintenant';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}j ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}`;
  return `${m} min`;
}
