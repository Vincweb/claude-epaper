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

/** `dashboard` = connexion propre à l'app ; `claude-code` = credentials importés (partagés). */
export type CredentialSource = 'dashboard' | 'claude-code' | 'none';

/** Source des credentials active (aucun jeton n'est exposé). */
export interface ConnectionInfo {
  source: CredentialSource;
  connectedAt: string | null;
  account: string | null;
}

export interface PollerState {
  snapshot: UsageSnapshot | null;
  authenticated: boolean;
  lastError: string | null;
  /** Données à jour pour l'affichage (même verdict que la dalle). */
  online?: boolean;
  connection?: ConnectionInfo;
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

/** Couleurs franches par palier (lisibles d'un coup d'œil, pas 4 nuances d'orange). */
const MOOD_COLOR: Record<Mood, string> = {
  calm: '#7bbf6a',
  alert: '#e0a458',
  worried: '#e57a3c',
  panic: '#e5352a',
};

/** Libellés alignés sur les poses de stress de Clawd. */
export const MOOD_LABEL: Record<Mood, string> = {
  calm: 'tranquille',
  alert: 'sous pression',
  worried: 'stressé',
  panic: 'cramé',
};

export function moodColor(mood: Mood): string {
  return MOOD_COLOR[mood];
}

/** Message d'erreur du poller (technique, parfois en anglais) → phrase lisible. */
export function describeError(error: string): string {
  if (error === 'no credentials') return 'Aucune connexion à Claude';
  if (/^usage failed: 429\b/.test(error)) return 'API Claude saturée (429), nouvel essai bientôt';
  if (/^usage failed: 401\b/.test(error)) return 'Accès refusé par l’API (401)';
  if (/^usage failed: réseau/.test(error)) return 'Réseau indisponible';
  return error;
}

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

/* ----------------------------- Poses de Clawd ----------------------------- */

// Types partagés avec le serveur (dessin, look, animations) : cf. lib/clawd.ts.
export type { ClawdAccessory, ClawdEyes, ClawdMotion, ClawdMouth, ClawdOverhead, Look, Pose } from './clawd';
import type { Pose } from './clawd';
