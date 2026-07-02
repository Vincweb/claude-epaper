import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface AppConfig {
  /** Intervalle de polling de l'endpoint usage (ms). */
  pollIntervalMs: number;
  /** Fichier source des credentials Claude Code à importer. */
  credentialsPath: string;
  /** Sur macOS, tenter de lire les credentials depuis le Keychain. */
  useMacKeychain: boolean;
  /** Seuils (en %) qui colorent les jauges. */
  thresholds: { alert: number; worried: number; panic: number };
  /** Cible d'affichage physique: 'null' (aucun) ou 'epaper'. */
  display: 'null' | 'epaper';
  /** Palette de l'e-paper: noir/blanc ou noir/blanc/rouge. */
  epaperPalette: 'bw' | 'bwr';
  /** Mise en page e-paper: 'compact' (2.13" 250x122) ou 'full' (800x480). */
  epaperLayout: 'compact' | 'full';
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
  useMacKeychain: process.platform === 'darwin',
  thresholds: { alert: 50, worried: 75, panic: 90 },
  display: 'null',
  epaperPalette: 'bwr',
  epaperLayout: 'compact',
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

export function loadConfig(): AppConfig {
  ensureConfigDir();
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
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
