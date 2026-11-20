import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { poller } from '../poller.js';
import { getConfigDir, loadConfig, sanitizeConfigPatch, saveConfig } from '../config.js';
import { readUpdateStatus, RUNNING, updateInProgress, writeUpdateStatus } from '../system.js';
import {
  connectionInfo,
  deleteStore,
  exchangeDashboardCode,
  importFromSource,
  LoginError,
  saveStore,
  startDashboardLogin,
} from '../credentials.js';
import { fetchUsage, redactSecrets, UsageError } from '../usage.js';
import { epaperCalm, normalizeLayout, renderEpaperPng } from '../render.js';
import { clearSpriteCache, generateSprite, poseAssetInfo, readPoseAsset, SPRITE_SIZE, type SpriteVariant } from '../sprites.js';
import { LOOK_PARTS, SPECIAL_POSES, sanitizeLook, type Pose } from '../mascot.js';
import {
  addCustomPose,
  allPosesResolved,
  customPoses,
  deleteCustomPose,
  deleteLook,
  findPose,
  hasLookOverride,
  isDefaultMood,
  missingDefaultMoods,
  renamePose,
  restoreDefaultMoods,
  saveLook,
} from '../poses.js';
import {
  authenticationOptions,
  clearSession,
  generateApiToken,
  getApiToken,
  isAuthed,
  isConfigured,
  issueSession,
  registrationOptions,
  allowRecoveryAttempt,
  requireAuth,
  requireAuthOrLocal,
  revokeApiToken,
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

apiRouter.post('/auth/recover', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!allowRecoveryAttempt()) {
    res.status(429).json({ error: 'too-many-attempts' });
    return;
  }
  if (!code || !(await verifyRecovery(code))) {
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

/* ---------------------- clé d'API (app iOS / widget) ---------------------- */

/** Construit le deep-link d'appairage `clawd://setup?base=…&key=…` + son QR. */
async function iosSetup(req: express.Request, token: string) {
  const base = `${req.protocol}://${req.get('host')}`;
  const deeplink = `clawd://setup?base=${encodeURIComponent(base)}&key=${encodeURIComponent(token)}`;
  const qr = await QRCode.toDataURL(deeplink, { margin: 1, width: 320 });
  return { token, base, deeplink, qr };
}

/** Clé d'API courante (+ deep-link/QR d'appairage si elle existe). */
apiRouter.get('/auth/token', requireAuth, async (req, res) => {
  const token = getApiToken();
  res.json(token ? await iosSetup(req, token) : { token: null });
});

/** (Re)génère la clé d'API et renvoie le nouveau deep-link/QR. */
apiRouter.post('/auth/token', requireAuth, async (req, res) => {
  const token = generateApiToken();
  if (!token) {
    res.status(400).json({ error: 'not-configured' });
    return;
  }
  res.json(await iosSetup(req, token));
});

/** Révoque la clé d'API (déconnecte l'app iOS / le widget). */
apiRouter.delete('/auth/token', requireAuth, (_req, res) => {
  revokeApiToken();
  res.json({ ok: true });
});

/* ------------------------------ rendu e-paper ------------------------------ */

/** Aperçu / sortie physique : le PNG exact envoyé à l'e-paper (toujours N&B).
 * Seule route ouverte à la boucle locale directe (script e-paper du Pi). */
apiRouter.get('/render.png', requireAuthOrLocal, (req, res) => {
  try {
    const layout = normalizeLayout(req.query.layout);
    const scale = req.query.scale ? Math.min(6, Math.max(1, Number(req.query.scale) || 1)) : undefined;
    const rotate = req.query.rotate === '180' ? 180 : req.query.rotate === '0' ? 0 : undefined;
    const png = renderEpaperPng({ layout, scale, rotate });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    // Signale le mode repos à la boucle e-paper (pas de refresh complet périodique la nuit).
    res.set('X-Epaper-Calm', epaperCalm() ? '1' : '0');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ------------------------------ sprites poses ------------------------------ */

function parsePoseParams(variant: string, key: string): { variant: SpriteVariant; pose: Pose } | null {
  if (variant !== 'epaper' && variant !== 'web') return null;
  const pose = findPose(key);
  return pose ? { variant, pose } : null;
}

/** Liste des poses + look + état de leurs sprites (animés ou non),
 * et le catalogue des pièces de l'éditeur (yeux, bouche, accessoires…). */
apiRouter.get('/poses', requireAuth, (_req, res) => {
  const specialKeys = new Set(SPECIAL_POSES.map((p) => p.key));
  const customKeys = new Set(customPoses().map((p) => p.key));
  res.json({
    poses: allPosesResolved().map((p) => ({
      key: p.key,
      title: p.title,
      special: specialKeys.has(p.key),
      userAdded: customKeys.has(p.key), // humeur de rotation (supprimable)
      builtin: isDefaultMood(p.key), // humeur par défaut (DEFAULT_MOODS)
      look: sanitizeLook(p),
      lookCustom: hasLookOverride(p.key), // look composé dans l'éditeur
      epaper: poseAssetInfo('epaper', p),
      web: poseAssetInfo('web', p),
    })),
    parts: LOOK_PARTS,
    // Humeurs par défaut supprimées, que la galerie propose de remettre.
    missingDefaults: missingDefaultMoods().map((p) => ({ key: p.key, title: p.title })),
  });
});

/** Aperçu d'un look (éditeur) : sprite généré à la volée, rien n'est enregistré.
 * Query : variant, eyes, mouth, accessory, overhead, motion, size (web). */
apiRouter.get('/poses/preview', requireAuth, (req, res) => {
  const variant: SpriteVariant = req.query.variant === 'web' ? 'web' : 'epaper';
  // e-paper : toujours 118 (1:1 dalle) ; web : aperçu réduit par défaut (rapide sur le Pi).
  const size =
    variant === 'web' ? Math.max(60, Math.min(SPRITE_SIZE.web, Number(req.query.size) || 240)) : SPRITE_SIZE.epaper;
  try {
    const { buf, type } = generateSprite(sanitizeLook(req.query), variant, size);
    res.set('Content-Type', type);
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Crée une humeur de rotation personnalisée (titre requis, visuel par défaut). */
apiRouter.post('/poses', requireAuth, (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const pose = addCustomPose(title);
  if (!pose) {
    res.status(400).json({ error: 'titre invalide ou limite atteinte' });
    return;
  }
  poller.refresh();
  res.json({ ok: true, pose });
});

/** Remet en rotation les humeurs par défaut supprimées (nom et look d'origine). */
apiRouter.post('/poses/defaults', requireAuth, (_req, res) => {
  const restored = restoreDefaultMoods();
  poller.refresh();
  res.json({ ok: true, restored: restored.map((p) => p.key) });
});

/** Renomme une humeur (spéciale de base ou personnalisée). */
apiRouter.put('/poses/:key', requireAuth, (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  if (!renamePose(req.params.key, title)) {
    res.status(400).json({ error: 'renommage impossible' });
    return;
  }
  poller.refresh();
  res.json({ ok: true });
});

/** Supprime une humeur personnalisée (et ses visuels). */
apiRouter.delete('/poses/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  if (!deleteCustomPose(key)) {
    res.status(400).json({ error: 'humeur non supprimable' });
    return;
  }
  poller.refresh();
  res.json({ ok: true });
});

// ⚠ Routes « look » AVANT « GET /poses/:variant/:key » : même forme d'URL,
// Express prend la première qui correspond.

/** Enregistre le look composé dans l'éditeur → le sprite (e-paper + web) est
 * généré à partir de lui. */
apiRouter.put('/poses/:key/look', requireAuth, (req, res) => {
  const look = saveLook(req.params.key, req.body?.look);
  if (!look) {
    res.status(404).json({ error: 'pose inconnue' });
    return;
  }
  clearSpriteCache();
  poller.refresh();
  res.json({ ok: true, look });
});

/** Oublie le look composé (retour au dessin d'origine / au look tiré du nom). */
apiRouter.delete('/poses/:key/look', requireAuth, (req, res) => {
  deleteLook(req.params.key);
  clearSpriteCache();
  poller.refresh();
  res.json({ ok: true });
});

/** Sprite d'une pose (GIF e-paper animé, PNG web), généré depuis son look.
 * Volontairement SANS auth : affiché sur l'écran de connexion (mascotte),
 * aucune donnée sensible — liste, upload et suppression restent protégés. */
apiRouter.get('/poses/:variant/:key', (req, res) => {
  const parsed = parsePoseParams(req.params.variant, req.params.key);
  if (!parsed) {
    res.status(404).json({ error: 'pose inconnue' });
    return;
  }
  try {
    const { buf, type } = readPoseAsset(parsed.variant, parsed.pose);
    res.set('Content-Type', type);
    // Gardé en cache mais revalidé (ETag auto d'Express → 304 sans renvoyer l'image).
    res.set('Cache-Control', 'no-cache');
    res.send(buf);
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
    // Désactive la mise en tampon des reverse proxies (nginx & co).
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = () => res.write(`data: ${JSON.stringify(poller.state)}\n\n`);
  send();
  const onState = () => send();
  poller.on('state', onState);
  // Commentaire SSE toutes les 25 s : un proxy qui coupe les connexions muettes
  // (souvent après 60 s) garde le flux ouvert entre deux polls.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    poller.off('state', onState);
  });
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
  const before = loadConfig().pollIntervalMs;
  // Champs validés et bornés ; `bornAt`/`usageXp` (gérés par le serveur) ignorés.
  const cfg = saveConfig(sanitizeConfigPatch(req.body));
  // Ne relance le polling (et donc un appel à l'API) que si l'intervalle change.
  if (cfg.pollIntervalMs !== before) poller.restart();
  else poller.refresh();
  res.json(cfg);
});

apiRouter.post('/auth/import', requireAuth, (_req, res) => {
  const creds = importFromSource();
  void poller.tick();
  res.json({ imported: Boolean(creds) });
});

/* ------------------ connexion à Claude (OAuth depuis le dashboard) ------------------ */
// Identifiants PROPRES à l'app (aucun Claude Code ne les rafraîchit). ⚠ Aucun
// jeton n'apparaît dans une réponse, un log ou le SSE.

/** Source active : « dashboard », « claude-code » (import) ou « none ». */
apiRouter.get('/claude/connection', requireAuth, (_req, res) => {
  res.json(poller.state.connection);
});

/** Traduit un échec de l'appel de test en message clair (et en statut HTTP de NOTRE API :
 * jamais 401, réservé à la session du dashboard). */
function usageTestError(e: unknown): { status: number; code: string; error: string } {
  if (e instanceof UsageError) {
    if (e.status === 401)
      return { status: 400, code: 'invalid', error: 'Connexion refusée par l’API (401) : recommence depuis « Se connecter à Claude ».' };
    if (e.status === 403)
      return { status: 400, code: 'forbidden', error: 'Droits insuffisants (403) : cette connexion ne permet pas de lire les limites du compte.' };
    if (e.status === 429)
      return { status: 502, code: 'rate-limited', error: 'Trop de requêtes (429) : réessaie dans quelques minutes.' };
    if (e.status === null)
      return { status: 502, code: 'network', error: `Erreur réseau : impossible de joindre api.anthropic.com (${e.message.replace(/^usage failed: réseau \((.*)\)$/, '$1')}).` };
    return { status: 502, code: 'upstream', error: `Réponse inattendue de l’API Anthropic (${e.status}).` };
  }
  return { status: 500, code: 'internal', error: redactSecrets(e instanceof Error ? e.message : String(e)) };
}

/** Étape 1 : renvoie l'URL d'autorisation Claude à ouvrir (PKCE, valable 10 min). */
apiRouter.post('/claude/login/start', requireAuth, (_req, res) => {
  res.json({ url: startDashboardLogin() });
});

/** Étape 2 : échange le code `code#state` affiché par Claude, teste l'endpoint usage
 * et n'enregistre les identifiants que si ce test réussit. */
apiRouter.post('/claude/login/finish', requireAuth, async (req, res) => {
  let creds;
  try {
    creds = await exchangeDashboardCode(req.body?.code);
  } catch (e) {
    if (e instanceof LoginError) {
      res.status(e.code === 'network' ? 502 : 400).json({ code: e.code, error: e.message });
    } else {
      res.status(500).json({ code: 'internal', error: redactSecrets(e instanceof Error ? e.message : String(e)) });
    }
    return;
  }
  try {
    const snap = await fetchUsage(creds.accessToken);
    saveStore(creds);
    const connection = connectionInfo(creds);
    poller.ingest(snap, connection);
    res.json({
      ok: true,
      fiveHour: snap.fiveHour.utilization,
      sevenDay: snap.sevenDay.utilization,
      connection,
    });
  } catch (e) {
    const { status, code, error } = usageTestError(e);
    res.status(status).json({ code, error });
  }
});

/** Se déconnecter : oublie les identifiants gérés (connexion ou import). */
apiRouter.delete('/claude/login', requireAuth, async (_req, res) => {
  deleteStore();
  await poller.tick();
  res.json({ ok: true, connection: poller.state.connection });
});

/** Version du code EN SERVICE (figée au démarrage, cf. system.ts) — pas celle du disque. */
apiRouter.get('/system/version', requireAuth, (_req, res) => {
  res.json(RUNNING);
});

/** Avancement de la mise à jour (écrit par self-update.sh) + journal en cas d'échec. */
apiRouter.get('/system/update-status', requireAuth, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...readUpdateStatus(), running: RUNNING });
});

/** Vérifie s'il y a des commits en amont (git fetch + comparaison origin/main). */
apiRouter.get('/system/update-check', requireAuth, async (_req, res) => {
  try {
    await git(['fetch', '--quiet', 'origin', 'main']);
    // Comparé à la version EN SERVICE (pas au disque : après un git pull dont la
    // construction a échoué, le disque est en avance sur ce qui tourne).
    const base = RUNNING.commit || 'HEAD';
    const behind = Number(await git(['rev-list', '--count', `${base}..origin/main`]));
    const current = RUNNING.commit || (await git(['rev-parse', '--short', 'HEAD']));
    const latest = await git(['rev-parse', '--short', 'origin/main']);
    // Version telle qu'elle est SUR le dépôt distant (pas la copie locale).
    let latestVersion = '';
    try {
      latestVersion = JSON.parse(await git(['show', 'origin/main:package.json'])).version ?? '';
    } catch {
      /* ignore */
    }
    const subject = behind > 0 ? await git(['log', '-1', '--format=%s', 'origin/main']) : '';
    res.json({ behind, current, latest, latestVersion, subject });
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
  if (updateInProgress()) {
    res.status(409).json({ error: 'Une mise à jour est déjà en cours.' });
    return;
  }
  try {
    // Statut posé AVANT le lancement : la page ne lit jamais celui d'une mise à jour précédente.
    writeUpdateStatus('running', 'Démarrage…');
    const script = path.join(PROJECT_ROOT, 'scripts', 'self-update.sh');
    const child = spawn('sh', [script], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `/usr/bin:/usr/local/bin:${path.dirname(process.execPath)}:${process.env.PATH ?? ''}`,
        NODE_PID: String(process.pid),
        CONFIG_DIR: getConfigDir(),
      },
    });
    child.unref();
    res.json({ started: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
