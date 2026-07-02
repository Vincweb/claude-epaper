import { Router } from 'express';
import { poller } from '../poller.js';
import { loadConfig, saveConfig } from '../config.js';
import { importFromSource } from '../credentials.js';
import { renderEpaperPng } from '../render.js';

export const apiRouter = Router();

/** Aperçu / sortie physique : le PNG exact envoyé à l'e-paper. */
apiRouter.get('/render.png', (req, res) => {
  try {
    const layout = req.query.layout === 'full' || req.query.layout === 'compact' ? req.query.layout : undefined;
    const palette = req.query.palette === 'bw' || req.query.palette === 'bwr' ? req.query.palette : undefined;
    const scale = req.query.scale ? Math.min(6, Math.max(1, Number(req.query.scale))) : undefined;
    const png = renderEpaperPng({ layout, palette, scale });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

apiRouter.get('/status', (_req, res) => {
  res.json({
    authenticated: poller.state.authenticated,
    lastError: poller.state.lastError,
    lastFetchedAt: poller.state.lastFetchedAt,
  });
});

apiRouter.get('/usage', (_req, res) => {
  res.json(poller.state);
});

/** Flux SSE : pousse l'état à chaque tick pour animer le personnage en direct. */
apiRouter.get('/usage/stream', (req, res) => {
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

apiRouter.get('/config', (_req, res) => {
  res.json(loadConfig());
});

apiRouter.put('/config', (req, res) => {
  const cfg = saveConfig(req.body ?? {});
  poller.restart();
  res.json(cfg);
});

apiRouter.post('/auth/import', (_req, res) => {
  const creds = importFromSource();
  void poller.tick();
  res.json({ imported: Boolean(creds) });
});
