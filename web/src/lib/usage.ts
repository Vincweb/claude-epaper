export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  sevenDayOpus?: UsageWindow;
  fetchedAt: string;
}

export interface PollerState {
  snapshot: UsageSnapshot | null;
  authenticated: boolean;
  lastError: string | null;
  lastFetchedAt: string | null;
  /** Dernière fois qu'une conso a bougé (détection d'inactivité). */
  lastActivityAt: string | null;
  /** XP cumulée depuis la conso. */
  usageXp: number;
}

export interface AppConfig {
  pollIntervalMs: number;
  credentialsPath: string;
  useMacKeychain: boolean;
  thresholds: { alert: number; worried: number; panic: number };
  display: 'null' | 'epaper';
  /** Palette de l'e-paper: noir/blanc ou noir/blanc/rouge. */
  epaperPalette: 'bw' | 'bwr';
  /** Date d'anniversaire (YYYY-MM-DD ou MM-DD) pour la pose spéciale. */
  birthday: string;
  /** Minutes sans activité avant que Clawd s'endorme. */
  inactivityMinutes: number;
  /** Minutes entre deux changements de pose (rotation). */
  rotateMinutes: number;
  /** Date ISO de "naissance" de Clawd (auto-initialisée). */
  bornAt: string;
  /** XP cumulée depuis la conso. */
  usageXp: number;
}

export type Mood = 'calm' | 'alert' | 'worried' | 'panic';

export function moodFor(util: number, t: AppConfig['thresholds']): Mood {
  if (util >= t.panic) return 'panic';
  if (util >= t.worried) return 'worried';
  if (util >= t.alert) return 'alert';
  return 'calm';
}

/** L'humeur globale suit la fenêtre la plus contrainte. */
export function overallMood(snap: UsageSnapshot, t: AppConfig['thresholds']): Mood {
  const worst = Math.max(snap.fiveHour.utilization, snap.sevenDay.utilization);
  return moodFor(worst, t);
}

const MOOD_COLOR: Record<Mood, string> = {
  // Dégradé terracotta -> rouge, comme Clawd qui rougit quand ça chauffe.
  calm: '#d97757',
  alert: '#dd6a44',
  worried: '#db5334',
  panic: '#e5352a',
};

export function moodColor(mood: Mood): string {
  return MOOD_COLOR[mood];
}

/** Palette e-paper tri-color (type Waveshare noir/blanc/rouge). */
export const EPAPER = {
  paper: '#e7e3d8',
  ink: '#1b1b1a',
  red: '#b23a2e',
} as const;

/** "dans 2 h 14" à partir d'une date ISO de reset. */
export function formatReset(resetsAt: string | null): string {
  if (!resetsAt) return '—';
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'maintenant';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `dans ${Math.floor(h / 24)} j ${h % 24} h`;
  if (h > 0) return `dans ${h} h ${String(m).padStart(2, '0')}`;
  return `dans ${m} min`;
}

/* ---------------------------- Stats Tamagotchi ---------------------------- */

export interface Stat {
  key: string;
  label: string;
  icon: string;
  /** 0-100, où 100 = au top. */
  value: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Stats façon Tamagotchi dérivées de la conso + l'activité :
 * énergie (5h), forme (7j), repu (se vide sans activité), bonheur (moyenne).
 */
export function deriveStats(opts: {
  snap: UsageSnapshot;
  lastActivityAt: string | null;
}): Stat[] {
  const energie = clamp(100 - opts.snap.fiveHour.utilization);
  const forme = clamp(100 - opts.snap.sevenDay.utilization);
  const inactiveMin = opts.lastActivityAt
    ? (Date.now() - new Date(opts.lastActivityAt).getTime()) / 60_000
    : 0;
  // Repu tombe à 0 après ~6 h sans coder.
  const repu = clamp(100 - (inactiveMin / 360) * 100);
  const bonheur = clamp((energie + forme + repu) / 3);
  return [
    { key: 'energie', label: 'Énergie', icon: '⚡', value: energie },
    { key: 'forme', label: 'Forme', icon: '💪', value: forme },
    { key: 'repu', label: 'Repu', icon: '🍔', value: repu },
    { key: 'bonheur', label: 'Bonheur', icon: '😊', value: bonheur },
  ];
}

export function statColor(value: number): string {
  if (value >= 50) return '#7bbf6a';
  if (value >= 25) return '#e0a458';
  return '#e0533c';
}

const XP_PER_LEVEL = 100;

/**
 * Âge + niveau de Clawd. Le niveau monte avec le temps (1/semaine) ET avec
 * l'usage (chaque tranche de conso cumulée fait gagner un niveau).
 */
export function levelInfo(
  bornAt: string,
  usageXp = 0,
): { days: number; level: number; label: string; xpInLevel: number; xpToLevel: number } {
  const t = bornAt ? new Date(bornAt).getTime() : Date.now();
  const ms = Math.max(0, Date.now() - t);
  const days = Math.floor(ms / 86_400_000);
  const level = 1 + Math.floor(days / 7) + Math.floor(usageXp / XP_PER_LEVEL);
  const label = days >= 1 ? `${days} j` : `${Math.floor(ms / 3_600_000)} h`;
  return { days, level, label, xpInLevel: Math.round(usageXp % XP_PER_LEVEL), xpToLevel: XP_PER_LEVEL };
}

/* ----------------------------- Poses de Clawd ----------------------------- */

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

const NEUTRAL: Pose = { key: 'neutral', title: 'Tranquille', eyes: 'square' };
const WORKING: Pose = { key: 'working', title: 'Au travail', eyes: 'square', accessory: 'laptop' };
const CONTENT: Pose = { key: 'content', title: 'Content', eyes: 'happy' };
const MAGIC: Pose = { key: 'magic', title: 'Un peu de magie', eyes: 'square', accessory: 'wand' };
const COFFEE: Pose = { key: 'coffee', title: 'Pause café', eyes: 'square', accessory: 'coffee' };
const SLEEP: Pose = { key: 'sleep', title: 'Dodo', eyes: 'sleep', overhead: 'zzz' };
const BIRTHDAY: Pose = {
  key: 'birthday',
  title: 'Joyeux anniversaire !',
  eyes: 'happy',
  overhead: 'sparkle-hat',
};
const KISS: Pose = { key: 'kiss', title: 'Bisou', eyes: 'wink', mouth: 'kiss', accessory: 'heart' };
const SUNNY: Pose = { key: 'sunny', title: 'Au soleil', eyes: 'shades', overhead: 'sun' };
const RAINY: Pose = { key: 'rainy', title: 'Sous la pluie', eyes: 'square', overhead: 'umbrella' };

// Café réservé au matin ; les autres tournent au fil de la journée.
const MORNING_POOL: Pose[] = [COFFEE, WORKING, NEUTRAL, CONTENT];
const DAY_POOL: Pose[] = [NEUTRAL, WORKING, CONTENT, MAGIC, SUNNY, KISS];

// Exportées pour la galerie de styles.
export const EXTRA_POSES = { KISS, SUNNY, RAINY };

/** Normalise une date d'anniversaire en 'MM-DD'. */
export function birthdayKey(birthday: string): string | null {
  const m = birthday.match(/(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * Choisit la pose de Clawd selon le contexte (jamais le stress de la limite) :
 * anniversaire > dodo (nuit / inactif) > rotation (café le matin).
 */
export function selectPose(opts: {
  now: Date;
  config: Pick<AppConfig, 'birthday' | 'inactivityMinutes' | 'rotateMinutes'>;
  lastActivityAt: string | null;
}): Pose {
  const { now, config, lastActivityAt } = opts;
  const hour = now.getHours();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (config.birthday && birthdayKey(config.birthday) === today) return BIRTHDAY;

  const inactiveMs = lastActivityAt ? now.getTime() - new Date(lastActivityAt).getTime() : 0;
  const isNight = hour >= 22 || hour < 6;
  const inactive = inactiveMs > Math.max(1, config.inactivityMinutes) * 60_000;
  if (isNight || inactive) return SLEEP;

  const rot = config.rotateMinutes > 0 ? config.rotateMinutes : 30;
  const bucket = Math.floor(now.getTime() / (rot * 60_000));
  const morning = hour >= 6 && hour < 11;
  const pool = morning ? MORNING_POOL : DAY_POOL;
  return pool[bucket % pool.length];
}
