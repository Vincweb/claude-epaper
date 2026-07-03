import { Router } from 'express';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

/**
 * Lance `scripts/self-update.sh` en détaché (git pull + build + redémarrage via
 * systemd). Nécessite l'install en service (make services). Répond aussitôt ;
 * le serveur redémarrera de lui-même à la fin.
 */
apiRouter.post('/system/update', requireAuth, (_req, res) => {
  try {
    const script = path.join(process.cwd(), 'scripts', 'self-update.sh');
    const child = spawn('sh', [script], {
      cwd: process.cwd(),
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
