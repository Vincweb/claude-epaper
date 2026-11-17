import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeJsonAtomic } from './fsutil.js';

export interface AppConfig {
  /** Intervalle de polling de l'endpoint usage (ms). */
  pollIntervalMs: number;
  /** Fichier source des credentials Claude Code à importer. */
  credentialsPath: string;
  /** Seuils (en %) qui colorent les jauges. */
  thresholds: { alert: number; worried: number; panic: number };
  /** Orientation de la dalle 2,13" (250x122) : paysage ou portrait. */
  epaperLayout: 'horizontal' | 'vertical';
  /** Rotation de l'affichage e-paper (dalle montée à l'envers). */
  epaperRotate: 0 | 180;
  /** Date d'anniversaire (YYYY-MM-DD ou MM-DD) pour la pose spéciale. */
  birthday: string;
  /** Minutes sans activité avant que Clawd s'endorme. */
  inactivityMinutes: number;
  /** Minutes entre deux changements de pose. */
  rotateMinutes: number;
  /** Date ISO de "naissance" de Clawd (auto-initialisée au 1er lancement). */
  bornAt: string;
  /** XP cumulée depuis la conso (accélère le niveau). */
  usageXp: number;
}

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(os.homedir(), '.claude-epaper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS: AppConfig = {
  pollIntervalMs: 60_000,
  credentialsPath: path.join(os.homedir(), '.claude', '.credentials.json'),
  thresholds: { alert: 50, worried: 75, panic: 90 },
  epaperLayout: 'horizontal',
  epaperRotate: 0,
  birthday: '',
  inactivityMinutes: 30,
  rotateMinutes: 30,
  bornAt: '',
  usageXp: 0,
};

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Migre les anciennes valeurs de layout (compact/full/tall…) vers les 2 orientations. */
function normalizeStoredLayout(v: unknown): AppConfig['epaperLayout'] {
  if (v === 'vertical' || v === 'compact-tall' || v === 'tall') return 'vertical';
  return 'horizontal';
}

/** Bornes de l'intervalle de polling : en dessous de 30 s on martèle l'API (429). */
export const POLL_MIN_MS = 30_000;
export const POLL_MAX_MS = 3_600_000;

const clampInt = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/**
 * Valide un patch de config venu de l'API : champs inconnus ou invalides
 * ignorés, nombres bornés, seuils remis dans l'ordre alerte ≤ stressé ≤ panique.
 * `bornAt` et `usageXp` sont gérés par le serveur : jamais acceptés ici (sinon
 * un formulaire ouvert depuis longtemps écraserait l'XP gagnée entre-temps).
 */
export function sanitizeConfigPatch(raw: unknown): Partial<AppConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<AppConfig> = {};
  const poll = clampInt(r.pollIntervalMs, POLL_MIN_MS, POLL_MAX_MS);
  if (poll !== undefined) out.pollIntervalMs = poll;
  if (typeof r.credentialsPath === 'string' && r.credentialsPath.trim()) out.credentialsPath = r.credentialsPath.trim();
  if (r.thresholds && typeof r.thresholds === 'object') {
    const t = r.thresholds as Record<string, unknown>;
    const cur = loadConfig().thresholds;
    const vals = [
      clampInt(t.alert, 1, 100) ?? cur.alert,
      clampInt(t.worried, 1, 100) ?? cur.worried,
      clampInt(t.panic, 1, 100) ?? cur.panic,
    ].sort((a, b) => a - b);
    out.thresholds = { alert: vals[0], worried: vals[1], panic: vals[2] };
  }
  if (r.epaperLayout !== undefined) out.epaperLayout = normalizeStoredLayout(r.epaperLayout);
  if (r.epaperRotate !== undefined) out.epaperRotate = Number(r.epaperRotate) === 180 ? 180 : 0;
  if (typeof r.birthday === 'string') {
    const b = r.birthday.trim();
    if (b === '' || /^(\d{4}-)?\d{2}-\d{2}$/.test(b)) out.birthday = b;
  }
  const inactivity = clampInt(r.inactivityMinutes, 1, 1440);
  if (inactivity !== undefined) out.inactivityMinutes = inactivity;
  const rotate = clampInt(r.rotateMinutes, 1, 1440);
  if (rotate !== undefined) out.rotateMinutes = rotate;
  return out;
}

export function loadConfig(): AppConfig {
  ensureConfigDir();
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      // Garde-fou : une valeur aberrante dans le fichier ne doit pas faire boucler le poller.
      pollIntervalMs: clampInt(raw.pollIntervalMs, POLL_MIN_MS, POLL_MAX_MS) ?? DEFAULTS.pollIntervalMs,
      epaperLayout: normalizeStoredLayout(raw.epaperLayout),
      thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds || {}) },
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Ne pas écraser silencieusement un fichier illisible (bornAt, XP…) : on le met de côté.
      const aside = `${CONFIG_FILE}.illisible-${Date.now()}`;
      try {
        fs.renameSync(CONFIG_FILE, aside);
        console.error(`[config] config.json illisible, mis de côté dans ${aside}`);
      } catch {
        /* ignore */
      }
    }
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const merged: AppConfig = {
    ...current,
    ...patch,
    thresholds: { ...current.thresholds, ...(patch.thresholds || {}) },
  };
  writeJsonAtomic(CONFIG_FILE, merged);
  return merged;
}
