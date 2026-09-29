import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import { ALL_POSES, SPECIAL_POSES, lookFromName, sanitizeLook, type Look, type Pose } from './mascot.js';

/**
 * Personnalisation des poses persistée dans CONFIG_DIR/poses.json :
 *  - `titles` : renommage d'une pose (spéciale de base OU personnalisée).
 *  - `custom` : humeurs ajoutées par l'utilisateur — elles CONSTITUENT la rotation
 *    (aucune pose de rotation n'est codée en dur ; seules les spéciales le sont).
 *  - `looks`  : look composé dans l'éditeur (yeux, bouche, accessoire, chapeau,
 *    animation) → le sprite est généré à partir de lui (cf. sprites.ts).
 * Sans look enregistré, une humeur perso prend le look tiré de son nom (`seed`,
 * figé à la création : la renommer ne change pas sa tête).
 */
interface CustomPose {
  key: string;
  title: string;
  seed?: string;
}
interface UserPoses {
  titles: Record<string, string>;
  custom: CustomPose[];
  looks: Record<string, Look>;
}

const MAX_TITLE = 40;
const MAX_CUSTOM = 24;

function file(): string {
  return path.join(getConfigDir(), 'poses.json');
}

function load(): UserPoses {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const looks: Record<string, Look> = {};
    if (raw.looks && typeof raw.looks === 'object')
      for (const [k, v] of Object.entries(raw.looks)) looks[k] = sanitizeLook(v);
    return {
      titles: raw.titles && typeof raw.titles === 'object' ? raw.titles : {},
      custom: Array.isArray(raw.custom) ? raw.custom.filter((c: CustomPose) => c?.key && c?.title) : [],
      looks,
    };
  } catch {
    return { titles: {}, custom: [], looks: {} };
  }
}

function save(u: UserPoses): void {
  fs.mkdirSync(getConfigDir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(u, null, 2));
}

function customToPose(c: CustomPose, looks: UserPoses['looks']): Pose {
  return { ...(looks[c.key] ?? lookFromName(c.seed ?? c.title)), key: c.key, title: c.title };
}

/** Poses personnalisées (rotation), avec leur look (enregistré ou tiré du nom). */
export function customPoses(): Pose[] {
  const u = load();
  return u.custom.map((c) => customToPose(c, u.looks));
}

/** Applique la personnalisation utilisateur (titre + look) sur une pose. */
export function resolvePose(pose: Pose): Pose {
  const u = load();
  const title = u.titles[pose.key] ?? pose.title;
  const look = u.looks[pose.key];
  return look ? { ...pose, ...look, title } : { ...pose, title };
}

/** Le look de cette pose a-t-il été composé dans l'éditeur ? */
export function hasLookOverride(key: string): boolean {
  return Object.hasOwn(load().looks, key);
}

/** Cherche une pose par clé (base + personnalisées), titre et look résolus. */
export function findPose(key: string): Pose | undefined {
  const base = ALL_POSES.find((p) => p.key === key);
  if (base) return resolvePose(base);
  return customPoses().find((p) => p.key === key);
}

/** Pool de rotation : uniquement les humeurs personnalisées. */
export function rotationPoses(): Pose[] {
  return customPoses();
}

/** Toutes les poses (personnalisées + spéciales), titres résolus — galerie. */
export function allPosesResolved(): Pose[] {
  return [...customPoses(), ...SPECIAL_POSES.map(resolvePose)];
}

/** Renomme une pose (spéciale de base ou personnalisée). */
export function renamePose(key: string, title: string): boolean {
  const t = title.trim().slice(0, MAX_TITLE);
  if (!t) return false;
  const u = load();
  const custom = u.custom.find((c) => c.key === key);
  if (custom) {
    custom.seed ??= custom.title; // fige la tête avant de changer le nom
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

/** Enregistre le look composé dans l'éditeur (pose de base ou personnalisée). */
export function saveLook(key: string, look: unknown): Look | null {
  if (!findPose(key)) return null;
  const u = load();
  u.looks[key] = sanitizeLook(look);
  save(u);
  return u.looks[key];
}

/** Oublie le look composé : retour au dessin d'origine (ou au look du nom). */
export function deleteLook(key: string): boolean {
  const u = load();
  if (!Object.hasOwn(u.looks, key)) return false;
  delete u.looks[key];
  save(u);
  return true;
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
  const custom = { key: `custom${n}`, title: t, seed: t };
  u.custom.push(custom);
  save(u);
  return customToPose(custom, u.looks);
}

/** Supprime une pose personnalisée (renommage et look associés aussi). */
export function deleteCustomPose(key: string): boolean {
  const u = load();
  const i = u.custom.findIndex((c) => c.key === key);
  if (i < 0) return false;
  u.custom.splice(i, 1);
  delete u.titles[key];
  delete u.looks[key];
  save(u);
  return true;
}
