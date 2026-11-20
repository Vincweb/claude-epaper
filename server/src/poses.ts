import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import { writeJsonAtomic } from './fsutil.js';
import { ALL_POSES, DEFAULT_MOODS, SPECIAL_POSES, lookFromName, sanitizeLook, type Look, type Pose } from './mascot.js';

/**
 * Personnalisation des poses persistée dans CONFIG_DIR/poses.json :
 *  - `titles` : renommage d'une pose (spéciale de base OU personnalisée).
 *  - `custom` : humeurs ajoutées par l'utilisateur — elles CONSTITUENT la rotation
 *    (aucune pose de rotation n'est codée en dur ; seules les spéciales le sont).
 *  - `looks`  : look composé dans l'éditeur (yeux, bouche, accessoire, chapeau,
 *    animation) → le sprite est généré à partir de lui (cf. sprites.ts).
 *  - `seeded` : humeurs par défaut (`DEFAULT_MOODS` : Réfléchit, Recherche,
 *    Travaille, Parle, Terminé, Pause café) déjà semées dans `custom` — chacune l'est UNE seule fois, une
 *    humeur par défaut supprimée ne revient donc pas toute seule.
 * Sans look enregistré, une humeur par défaut prend le look dessiné pour elle,
 * une humeur perso celui tiré de son nom (`seed`, figé à la création : la
 * renommer ne change pas sa tête).
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
  seeded: string[];
}

const MAX_TITLE = 40;
const MAX_CUSTOM = 24;

function file(): string {
  return path.join(getConfigDir(), 'poses.json');
}

const empty = (): UserPoses => ({ titles: {}, custom: [], looks: {}, seeded: [] });

/** Lit poses.json ; lève si le fichier manque (ENOENT) ou est illisible. */
function read(): UserPoses {
  const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
  const looks: Record<string, Look> = {};
  if (raw.looks && typeof raw.looks === 'object')
    for (const [k, v] of Object.entries(raw.looks)) looks[k] = sanitizeLook(v);
  return {
    titles: raw.titles && typeof raw.titles === 'object' ? raw.titles : {},
    custom: Array.isArray(raw.custom) ? raw.custom.filter((c: CustomPose) => c?.key && c?.title) : [],
    looks,
    seeded: Array.isArray(raw.seeded) ? raw.seeded.filter((k: unknown) => typeof k === 'string') : [],
  };
}

function load(): UserPoses {
  try {
    return read();
  } catch {
    return empty();
  }
}

function save(u: UserPoses): void {
  writeJsonAtomic(file(), u);
}

/** Look dessiné de chaque humeur par défaut (sans clé ni titre). */
const DEFAULT_LOOKS = new Map<string, Look>(DEFAULT_MOODS.map(({ key, title: _title, ...look }) => [key, look]));

/** Cette clé est-elle celle d'une humeur par défaut (`DEFAULT_MOODS`) ? */
export function isDefaultMood(key: string): boolean {
  return DEFAULT_LOOKS.has(key);
}

function customToPose(c: CustomPose, looks: UserPoses['looks']): Pose {
  const look = looks[c.key] ?? DEFAULT_LOOKS.get(c.key) ?? lookFromName(c.seed ?? c.title);
  return { ...look, key: c.key, title: c.title };
}

const fromDefault = ({ key, title }: Pose): CustomPose => ({ key, title });

/**
 * Sème les humeurs par défaut dans poses.json, UNE fois chacune (`seeded`) :
 * une installation neuve démarre avec toutes les humeurs par défaut en
 * rotation, une installation existante reçoit celles qu'elle n'a jamais eues
 * en tête de sa rotation à la mise à jour (ajouter une humeur à `DEFAULT_MOODS`
 * plus tard suffit donc à la livrer) ; une humeur supprimée ensuite ne revient
 * pas (cf. `restoreDefaultMoods`). Appelé au démarrage du serveur.
 * Fichier présent mais illisible → on n'écrit RIEN (sinon on écraserait les
 * humeurs de l'utilisateur avec une liste vide).
 */
export function seedDefaultMoods(): void {
  let u: UserPoses;
  try {
    u = read();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return;
    u = empty();
  }
  const fresh = DEFAULT_MOODS.filter((m) => !u.seeded.includes(m.key));
  if (!fresh.length) return;
  const absent = fresh.filter((m) => !u.custom.some((c) => c.key === m.key));
  // Une ancienne pose de base a pu porter la même clé (ex. `coffee`, avant que
  // la rotation devienne 100 % perso) : on oublie son nom et son look restés
  // dans le fichier, l'humeur arrive avec ceux dessinés pour elle.
  for (const m of absent) {
    delete u.titles[m.key];
    delete u.looks[m.key];
  }
  u.custom = [...absent.map(fromDefault), ...u.custom];
  u.seeded.push(...fresh.map((m) => m.key));
  save(u);
}

/** Humeurs par défaut absentes de la rotation (supprimées par l'utilisateur). */
export function missingDefaultMoods(): Pose[] {
  const keys = new Set(load().custom.map((c) => c.key));
  return DEFAULT_MOODS.filter((m) => !keys.has(m.key));
}

/** Remet en tête de rotation les humeurs par défaut supprimées, avec leur nom
 * et leur look d'origine. Renvoie celles qui ont été remises. */
export function restoreDefaultMoods(): Pose[] {
  const u = load();
  const missing = DEFAULT_MOODS.filter((m) => !u.custom.some((c) => c.key === m.key));
  if (!missing.length) return [];
  for (const m of missing) {
    delete u.titles[m.key];
    delete u.looks[m.key];
  }
  u.custom = [...missing.map(fromDefault), ...u.custom];
  u.seeded = [...new Set([...u.seeded, ...missing.map((m) => m.key)])];
  save(u);
  return missing;
}

/** Humeurs de rotation (par défaut + perso), avec leur look (enregistré, dessiné ou tiré du nom). */
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

/** Pool de rotation : les humeurs de poses.json (par défaut + perso). */
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

/** Oublie le look composé : retour au dessin d'origine (pose de base ou humeur
 * par défaut) ou au look tiré du nom (humeur perso). */
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

/** Supprime une humeur de rotation (renommage et look associés aussi). Une
 * humeur par défaut supprimée reste semée : elle ne revient que via
 * `restoreDefaultMoods`. */
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
