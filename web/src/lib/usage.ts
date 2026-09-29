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
  /** Pose courante (source de vérité serveur, identique à l'e-paper). */
  pose: Pose;
  /** Stats Tamagotchi calculées côté serveur. */
  stats: Stat[];
  /** Niveau de Clawd. */
  level: number;
  /** Âge lisible ("18 j"). */
  ageLabel: string;
  /** Pose forcée manuellement (bouton shuffle) ? */
  poseManual: boolean;
  /** Fichier web uploadé pour cette pose → affiché tel quel (sinon rendu live). */
  poseWebUpload: boolean;
}

export interface AppConfig {
  pollIntervalMs: number;
  credentialsPath: string;
  thresholds: { alert: number; worried: number; panic: number };
  /** Orientation de la dalle 2,13" (250x122) : paysage ou portrait. */
  epaperLayout: 'horizontal' | 'vertical';
  /** Rotation de l'affichage e-paper (dalle montée à l'envers). */
  epaperRotate: 0 | 180;
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

export const STAT_ICONS: Record<string, string> = {
  energie: '⚡',
  forme: '💪',
  repu: '🍔',
  bonheur: '😊',
};

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

// Types partagés avec le serveur (dessin, look, animations) : cf. lib/clawd.ts.
export type { ClawdAccessory, ClawdEyes, ClawdMotion, ClawdMouth, ClawdOverhead, Look, Pose } from './clawd';
import type { Pose } from './clawd';
