import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getConfigDir } from './config.js';
import { writeFileAtomic } from './fsutil.js';

/**
 * Version et suivi des mises à jour.
 *
 * ⚠ La version affichée est celle du PROCESSUS EN COURS, figée au démarrage —
 * jamais relue sur le disque. Pendant une mise à jour, `git pull` change le
 * dépôt en quelques secondes alors que la construction dure des minutes : lire
 * le disque faisait croire à la page que la nouvelle version était en ligne et
 * elle rechargeait l'ancienne app.
 */

export const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

function gitSync(args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: PROJECT_ROOT,
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, PATH: `/usr/bin:/usr/local/bin:${process.env.PATH ?? ''}` },
    })
      .toString()
      .trim();
  } catch {
    return ''; // pas un dépôt git / git absent
  }
}

function readVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Version du code qui tourne (lue une seule fois, au démarrage du serveur). */
export const RUNNING = {
  version: readVersion(),
  commit: gitSync(['rev-parse', '--short', 'HEAD']),
  date: gitSync(['log', '-1', '--format=%cI']),
  startedAt: new Date().toISOString(),
};

/* ------------------------------ statut de mise à jour ------------------------------ */
// Écrit par scripts/self-update.sh (une ligne « état|message ») et relu par la page.

export type UpdateState = 'idle' | 'running' | 'failed' | 'restarting' | 'done';

const statusFile = () => path.join(getConfigDir(), 'update.status');
const logFile = () => path.join(getConfigDir(), 'update.log');

export function writeUpdateStatus(state: UpdateState, message = ''): void {
  writeFileAtomic(statusFile(), `${state}|${message.replace(/\n/g, ' ')}\n`);
}

/** Dernières lignes du journal de mise à jour (affichées en cas d'échec). */
function logTail(lines = 30): string {
  try {
    const all = fs.readFileSync(logFile(), 'utf8').trimEnd().split('\n');
    // Seulement la dernière mise à jour (depuis son en-tête).
    const start = all.map((l) => l.startsWith('=== update ')).lastIndexOf(true);
    return all.slice(Math.max(start, all.length - lines)).join('\n');
  } catch {
    return '';
  }
}

export function readUpdateStatus(): { state: UpdateState; message: string; updatedAt: string | null; log: string } {
  try {
    const raw = fs.readFileSync(statusFile(), 'utf8').trim();
    const [state, ...rest] = raw.split('|');
    const known: UpdateState[] = ['idle', 'running', 'failed', 'restarting', 'done'];
    const s = (known.includes(state as UpdateState) ? state : 'idle') as UpdateState;
    return {
      state: s,
      message: rest.join('|'),
      updatedAt: fs.statSync(statusFile()).mtime.toISOString(),
      log: s === 'failed' ? logTail() : '',
    };
  } catch {
    return { state: 'idle', message: '', updatedAt: null, log: '' };
  }
}

/** Une mise à jour est-elle réellement en cours ? (statut « running » de moins de 30 min) */
export function updateInProgress(): boolean {
  const st = readUpdateStatus();
  return st.state === 'running' && !!st.updatedAt && Date.now() - Date.parse(st.updatedAt) < 30 * 60_000;
}

/**
 * Au démarrage : si une mise à jour venait de relancer le serveur, elle est
 * terminée — on l'écrit, avec la version désormais en service.
 */
export function markUpdateFinishedOnBoot(): void {
  // « running » aussi : un ancien script (qui n'écrit pas de statut) a pu relancer le serveur.
  const { state } = readUpdateStatus();
  if (state === 'restarting' || state === 'running') {
    writeUpdateStatus('done', `version ${RUNNING.version} (${RUNNING.commit}) en service`);
  }
}
