import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import { ALL_POSES, SHUFFLE_POOL, SPECIAL_POSES, type Pose } from './mascot.js';

/**
 * Personnalisation des poses persistée dans CONFIG_DIR/poses.json :
 *  - `titles` : renommage d'une pose existante (base) OU personnalisée.
 *  - `custom` : nouvelles poses ajoutées par l'utilisateur (rotation uniquement).
 * Les poses de base restent définies dans mascot.ts (dessin vectoriel de secours) ;
 * ici on ne fait que renommer et étendre le pool de rotation.
 */
interface CustomPose {
  key: string;
  title: string;
}
interface UserPoses {
  titles: Record<string, string>;
  custom: CustomPose[];
  /** Poses de base (rotation) masquées = retirées de la rotation, réversible. */
  disabled: string[];
}

const MAX_TITLE = 40;
const MAX_CUSTOM = 24;

function file(): string {
  return path.join(getConfigDir(), 'poses.json');
}

function load(): UserPoses {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return {
      titles: raw.titles && typeof raw.titles === 'object' ? raw.titles : {},
      custom: Array.isArray(raw.custom) ? raw.custom.filter((c: CustomPose) => c?.key && c?.title) : [],
      disabled: Array.isArray(raw.disabled) ? raw.disabled.filter((k: unknown) => typeof k === 'string') : [],
    };
  } catch {
    return { titles: {}, custom: [], disabled: [] };
  }
}

function save(u: UserPoses): void {
  fs.mkdirSync(getConfigDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(u, null, 2));
}

/** Poses personnalisées (rotation), avec un rendu par défaut neutre. */
export function customPoses(): Pose[] {
  return load().custom.map((c) => ({ key: c.key, title: c.title, eyes: 'square' as const }));
}

/** Applique le renommage utilisateur sur une pose de base. */
export function withTitle(pose: Pose): Pose {
  const t = load().titles[pose.key];
  return t ? { ...pose, title: t } : pose;
}

/** Cherche une pose par clé (base + personnalisées), titre résolu. */
export function findPose(key: string): Pose | undefined {
  const base = ALL_POSES.find((p) => p.key === key);
  if (base) return withTitle(base);
  return customPoses().find((p) => p.key === key);
}

/** Clés des poses de base masquées (retirées de la rotation). */
export function disabledKeys(): string[] {
  return load().disabled;
}

/** Pool de rotation ACTIF : poses de base non masquées + personnalisées. */
export function rotationPoses(): Pose[] {
  const dis = new Set(load().disabled);
  return [...SHUFFLE_POOL.filter((p) => !dis.has(p.key)).map(withTitle), ...customPoses()];
}

/** Toutes les poses (rotation même masquée + spéciales), titres résolus — galerie. */
export function allPosesResolved(): Pose[] {
  return [...SHUFFLE_POOL.map(withTitle), ...customPoses(), ...SPECIAL_POSES.map(withTitle)];
}

/** Masque / réaffiche une pose de base en rotation (pas les spéciales ni perso). */
export function setPoseDisabled(key: string, disabled: boolean): boolean {
  if (!SHUFFLE_POOL.some((p) => p.key === key)) return false;
  const u = load();
  const has = u.disabled.includes(key);
  if (disabled && !has) u.disabled.push(key);
  else if (!disabled && has) u.disabled = u.disabled.filter((k) => k !== key);
  else return true;
  save(u);
  return true;
}

/** Renomme une pose (base ou personnalisée). */
export function renamePose(key: string, title: string): boolean {
  const t = title.trim().slice(0, MAX_TITLE);
  if (!t) return false;
  const u = load();
  const custom = u.custom.find((c) => c.key === key);
  if (custom) {
    custom.title = t;
    save(u);
    return true;
  }
  if (ALL_POSES.some((p) => p.key === key)) {
    u.titles[key] = t;
    save(u);
    return true;
  }
  return false;
}

/** Ajoute une pose de rotation personnalisée. Renvoie la pose créée. */
export function addCustomPose(title: string): Pose | null {
  const t = title.trim().slice(0, MAX_TITLE);
  if (!t) return null;
  const u = load();
  if (u.custom.length >= MAX_CUSTOM) return null;
  const taken = new Set([...ALL_POSES.map((p) => p.key), ...u.custom.map((c) => c.key)]);
  let n = 1;
  while (taken.has(`custom${n}`)) n++;
  const key = `custom${n}`;
  u.custom.push({ key, title: t });
  save(u);
  return { key, title: t, eyes: 'square' };
}

/** Supprime une pose personnalisée (le renommage associé aussi). */
export function deleteCustomPose(key: string): boolean {
  const u = load();
  const i = u.custom.findIndex((c) => c.key === key);
  if (i < 0) return false;
  u.custom.splice(i, 1);
  delete u.titles[key];
  save(u);
  return true;
}

export function isCustomPose(key: string): boolean {
  return load().custom.some((c) => c.key === key);
}
