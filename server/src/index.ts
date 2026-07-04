import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { poller } from './poller.js';
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
// Assets hashés (/assets/index-XXXX.js) : immuables → cache long.
// index.html : JAMAIS mis en cache, sinon après une mise à jour le navigateur
// recharge un vieil index.html pointant vers l'ancien JS (UI inchangée alors
// que la version « monte »).
const webDist = path.resolve(__dirname, '../../web/dist');
app.use(
  express.static(webDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.join(webDist, 'index.html'));
  }
  next();
});

poller.start();

app.listen(PORT, () => {
  console.log(`claude-epaper server sur http://localhost:${PORT}`);
});
