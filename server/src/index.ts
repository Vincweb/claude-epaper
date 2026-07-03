import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poller } from './poller.js';
import { createDisplay } from './display.js';
import { apiRouter } from './routes/api.js';
import { loadConfig, saveConfig } from './config.js';

// Date de naissance de Clawd : fixée une seule fois, au tout premier lancement.
if (!loadConfig().bornAt) saveConfig({ bornAt: new Date().toISOString() });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

const app = express();
// Derrière un reverse proxy (CasaOS / domaine HTTPS) : fait confiance à
// X-Forwarded-Proto pour que WebAuthn calcule le bon origin.
app.set('trust proxy', true);
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);

// Sert le build React (server/dist -> ../../web/dist).
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(webDist, 'index.html'));
  }
  next();
});

// Répercute chaque changement de limite sur l'affichage physique.
const display = createDisplay();
poller.on('change', (snap) => {
  void display.render(snap).catch((e) => console.error('[display]', e));
});
poller.start();

app.listen(PORT, () => {
  console.log(`claude-epaper server sur http://localhost:${PORT}`);
});
