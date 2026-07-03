import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { poller } from '../poller.js';
import { loadConfig, saveConfig } from '../config.js';
import { importFromSource } from '../credentials.js';
import { renderEpaperPng } from '../render.js';
import {
  authenticationOptions,
  clearSession,
  isAuthed,
  isConfigured,
  issueSession,
  registrationOptions,
  requireAuth,
  verifyAuthentication,
  verifyRecovery,
  verifyRegistration,
} from '../auth.js';

export const apiRouter = Router();

// Racine du projet, résolue depuis ce module (indépendant du cwd : dev via le
// workspace server/ comme prod via systemd). src/routes ou dist/routes → ../../..
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

const execFileAsync = promisify(execFile);
/** Lance une commande git dans le repo (PATH élargi pour le contexte systemd). */
async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: PROJECT_ROOT,
    timeout: 20_000,
    env: { ...process.env, PATH: `/usr/bin:/usr/local/bin:${process.env.PATH ?? ''}` },
  });
  return stdout.trim();
}

/* ---------------------------------- auth ---------------------------------- */

apiRouter.get('/auth/state', (req, res) => {
  res.json({ configured: isConfigured(), authenticated: isAuthed(req) });
});

apiRouter.post('/auth/register/options', async (req, res) => {
  // 1re configuration libre ; réenregistrement (reset passkey) réservé à une session valide.
  if (isConfigured() && !isAuthed(req)) {
    res.status(403).json({ error: 'already-configured' });
    return;
  }
  try {
    res.json(await registrationOptions(req));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

apiRouter.post('/auth/register/verify', async (req, res) => {
  if (isConfigured() && !isAuthed(req)) {
    res.status(403).json({ error: 'already-configured' });
    return;
  }
  try {
    const result = await verifyRegistration(req, req.body);
    if (!result) {
      res.status(400).json({ error: 'verification-failed' });
      return;
    }
    issueSession(res);
    const recoveryQr = result.recoveryCode
      ? await QRCode.toDataURL(result.recoveryCode, { margin: 1, width: 320 })
      : '';
    res.json({ recoveryCode: result.recoveryCode, recoveryQr });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

apiRouter.post('/auth/login/options', async (req, res) => {
  try {
    res.json(await authenticationOptions(req));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

apiRouter.post('/auth/login/verify', async (req, res) => {
  try {
    const ok = await verifyAuthentication(req, req.body);
    if (!ok) {
      res.status(401).json({ error: 'verification-failed' });
      return;
    }
    issueSession(res);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

apiRouter.post('/auth/recover', (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code || !verifyRecovery(code)) {
    res.status(401).json({ error: 'invalid-code' });
    return;
  }
  issueSession(res);
  res.json({ ok: true });
});

apiRouter.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/* ------------------------------ rendu e-paper ------------------------------ */

/** Aperçu / sortie physique : le PNG exact envoyé à l'e-paper. */
apiRouter.get('/render.png', requireAuth, (req, res) => {
  try {
    const layout = req.query.layout === 'full' || req.query.layout === 'compact' ? req.query.layout : undefined;
    const palette = req.query.palette === 'bw' || req.query.palette === 'bwr' ? req.query.palette : undefined;
    const scale = req.query.scale ? Math.min(6, Math.max(1, Number(req.query.scale))) : undefined;
    const rotate = req.query.rotate === '180' ? 180 : req.query.rotate === '0' ? 0 : undefined;
    const png = renderEpaperPng({ layout, palette, scale, rotate });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* -------------------------------- données --------------------------------- */

apiRouter.get('/status', requireAuth, (_req, res) => {
  res.json({
    authenticated: poller.state.authenticated,
    lastError: poller.state.lastError,
    lastFetchedAt: poller.state.lastFetchedAt,
  });
});

apiRouter.get('/usage', requireAuth, (_req, res) => {
  res.json(poller.state);
});

/** Flux SSE : pousse l'état à chaque tick pour animer le personnage en direct. */
apiRouter.get('/usage/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = () => res.write(`data: ${JSON.stringify(poller.state)}\n\n`);
  send();
  const onState = () => send();
  poller.on('state', onState);
  req.on('close', () => poller.off('state', onState));
});

/** Change la mascotte (pose aléatoire hors poses contextuelles). */
apiRouter.post('/pose/shuffle', requireAuth, (_req, res) => {
  res.json({ pose: poller.shufflePose() });
});
apiRouter.post('/pose/reset', requireAuth, (_req, res) => {
  poller.resetPose();
  res.json({ ok: true });
});

apiRouter.get('/config', requireAuth, (_req, res) => {
  res.json(loadConfig());
});

apiRouter.put('/config', requireAuth, (req, res) => {
  const cfg = saveConfig(req.body ?? {});
  poller.restart();
  res.json(cfg);
});

apiRouter.post('/auth/import', requireAuth, (_req, res) => {
  const creds = importFromSource();
  void poller.tick();
  res.json({ imported: Boolean(creds) });
});

/** Version courante : numéro (package.json) + commit git + date. */
apiRouter.get('/system/version', requireAuth, async (_req, res) => {
  let version = '0.0.0';
  try {
    version = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version ?? version;
  } catch {
    /* ignore */
  }
  let commit = '';
  let date = '';
  try {
    commit = await git(['rev-parse', '--short', 'HEAD']);
    date = await git(['log', '-1', '--format=%cI']);
  } catch {
    /* pas un repo git / git absent */
  }
  res.json({ version, commit, date });
});

/** Vérifie s'il y a des commits en amont (git fetch + comparaison origin/main). */
apiRouter.get('/system/update-check', requireAuth, async (_req, res) => {
  try {
    await git(['fetch', '--quiet', 'origin', 'main']);
    const behind = Number(await git(['rev-list', '--count', 'HEAD..origin/main']));
    const current = await git(['rev-parse', '--short', 'HEAD']);
    const latest = await git(['rev-parse', '--short', 'origin/main']);
    const subject = behind > 0 ? await git(['log', '-1', '--format=%s', 'origin/main']) : '';
    res.json({ behind, current, latest, subject });
  } catch (e) {
    res.json({ behind: 0, error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * Lance `scripts/self-update.sh` en détaché (git pull + build + redémarrage via
 * systemd). Nécessite l'install en service (make services). Répond aussitôt ;
 * le serveur redémarrera de lui-même à la fin.
 */
apiRouter.post('/system/update', requireAuth, (_req, res) => {
  try {
    const script = path.join(PROJECT_ROOT, 'scripts', 'self-update.sh');
    const child = spawn('sh', [script], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `/usr/bin:/usr/local/bin:${path.dirname(process.execPath)}:${process.env.PATH ?? ''}`,
        NODE_PID: String(process.pid),
      },
    });
    child.unref();
    res.json({ started: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
