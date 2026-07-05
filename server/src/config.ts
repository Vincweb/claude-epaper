import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

export function loadConfig(): AppConfig {
  ensureConfigDir();
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      epaperLayout: normalizeStoredLayout(raw.epaperLayout),
      thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const merged: AppConfig = {
    ...loadConfig(),
    ...patch,
    thresholds: { ...loadConfig().thresholds, ...(patch.thresholds || {}) },
  };
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  return merged;
}
