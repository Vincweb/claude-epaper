import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { getConfigDir, ensureConfigDir } from './config.js';
import { writeJsonAtomic } from './fsutil.js';

/**
 * Auth WebAuthn (passkey) pour l'utilisateur unique du dashboard.
 * - une passkey enregistrée à la 1re connexion ;
 * - un code de récupération (affiché en QR à sauvegarder) pour se connecter si
 *   la passkey est perdue ;
 * - accès direct à la machine : le code (haché) et l'état sont dans
 *   CONFIG_DIR/auth.json — supprimer ce fichier réinitialise l'auth.
 */

interface StoredCredential {
  id: string; // base64url
  publicKey: string; // base64
  counter: number;
  transports?: string[];
}
interface AuthData {
  credentials: StoredCredential[];
  recoveryHash: string; // scrypt(hex)
  recoverySalt: string; // hex
  sessionSecret: string; // hex
  createdAt: string;
  /** Clé d'API (Bearer) pour les clients natifs — app iOS / widget. Optionnelle. */
  apiToken?: string;
}

const RP_NAME = 'Claude e-paper';
const SESSION_MAX_AGE = 30 * 24 * 3600_000; // 30 j
const authPath = () => path.join(getConfigDir(), 'auth.json');

// Challenge WebAuthn en cours (un seul utilisateur, un seul flux à la fois).
let currentChallenge: string | null = null;

/**
 * Lit auth.json. `corrupt` = le fichier existe mais est illisible : on ne doit
 * surtout PAS le traiter comme « pas encore configuré » (sinon n'importe qui
 * pourrait enregistrer sa passkey) → l'accès reste verrouillé.
 */
function readState(): { data: AuthData | null; corrupt: boolean } {
  let text: string;
  try {
    text = fs.readFileSync(authPath(), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { data: null, corrupt: false };
    console.error(`[auth] auth.json illisible (${(e as Error).message}) — accès verrouillé`);
    return { data: null, corrupt: true };
  }
  try {
    const d = JSON.parse(text) as AuthData;
    if (!Array.isArray(d?.credentials) || typeof d.sessionSecret !== 'string') throw new Error('format');
    return { data: d, corrupt: false };
  } catch {
    console.error('[auth] auth.json corrompu — accès verrouillé (supprimer le fichier réinitialise l’auth)');
    return { data: null, corrupt: true };
  }
}
function read(): AuthData | null {
  return readState().data;
}
function write(d: AuthData): void {
  ensureConfigDir();
  writeJsonAtomic(authPath(), d, 0o600);
}

export function isConfigured(): boolean {
  const { data, corrupt } = readState();
  return corrupt || Boolean(data && data.credentials.length > 0);
}
export function authFilePath(): string {
  return authPath();
}

/* ------------------------------- clé d'API -------------------------------- */

/** Clé d'API courante (Bearer) exposée aux clients natifs, ou null. */
export function getApiToken(): string | null {
  return read()?.apiToken ?? null;
}

/** (Re)génère la clé d'API. Nécessite une auth déjà configurée. */
export function generateApiToken(): string | null {
  const d = read();
  if (!d) return null;
  d.apiToken = crypto.randomBytes(24).toString('base64url'); // 32 caractères URL-safe
  write(d);
  return d.apiToken;
}

/** Révoque la clé d'API (les clients existants sont déconnectés). */
export function revokeApiToken(): void {
  const d = read();
  if (!d?.apiToken) return;
  delete d.apiToken;
  write(d);
}

/** Compare (temps constant) un token présenté à la clé stockée. */
export function verifyApiToken(token: string): boolean {
  const stored = read()?.apiToken;
  if (!stored || !token) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extrait la clé d'un en-tête `Authorization: Bearer …` ou `X-API-Key`. */
function bearerToken(req: Request): string | null {
  const h = req.get('authorization');
  if (h && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
  const x = req.get('x-api-key');
  return x ? x.trim() : null;
}

/** rpID + origin dérivés de la requête (gère reverse proxy via trust proxy). */
function rp(req: Request): { rpID: string; origin: string } {
  const host = req.get('host') || 'localhost';
  const rpID = host.split(':')[0];
  return { rpID, origin: `${req.protocol}://${host}` };
}

const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

function hashRecovery(code: string, salt: string): string {
  return crypto.scryptSync(normCode(code), Buffer.from(salt, 'hex'), 32).toString('hex');
}

/** Version asynchrone (vérification) : scrypt coûte ~200 ms sur le Pi, il ne
 * doit pas bloquer la boucle d'événements (rendu de la dalle, SSE). */
function hashRecoveryAsync(code: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(normCode(code), Buffer.from(salt, 'hex'), 32, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

function genRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus
  const bytes = crypto.randomBytes(25);
  let s = '';
  for (let i = 0; i < 25; i++) {
    s += alphabet[bytes[i] % alphabet.length];
    if (i % 5 === 4 && i < 24) s += '-';
  }
  return s; // ex. ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2
}

/* --------------------------------- sessions -------------------------------- */

function sign(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
export function issueSession(res: Response): void {
  const d = read();
  if (!d) return;
  const iat = Date.now().toString();
  res.cookie('sid', `${iat}.${sign(d.sessionSecret, iat)}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}
export function clearSession(res: Response): void {
  res.clearCookie('sid', { path: '/' });
}
export function isAuthed(req: Request): boolean {
  const d = read();
  if (!d) return false;
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.sid;
  if (!token) return false;
  const [iat, sig] = token.split('.');
  if (!iat || !sig) return false;
  if (sign(d.sessionSecret, iat) !== sig) return false;
  return Date.now() - Number(iat) < SESSION_MAX_AGE;
}

/* ------------------------------- registration ------------------------------ */

export async function registrationOptions(req: Request) {
  const { rpID } = rp(req);
  const existing = read();
  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: 'admin',
    userDisplayName: 'Admin',
    userID: new TextEncoder().encode('claude-epaper-user'),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    excludeCredentials: (existing?.credentials ?? []).map((c) => ({
      id: c.id,
      transports: c.transports as never,
    })),
  });
  currentChallenge = opts.challenge;
  return opts;
}

/** Vérifie l'enregistrement. Renvoie le code de récup (1re config uniquement). */
export async function verifyRegistration(
  req: Request,
  response: RegistrationResponseJSON,
): Promise<{ recoveryCode: string } | null> {
  if (!currentChallenge) return null;
  const { rpID, origin } = rp(req);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: currentChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  currentChallenge = null;
  if (!verification.verified || !verification.registrationInfo) return null;
  const cred = verification.registrationInfo.credential;
  const existing = read();

  let recoveryHash: string;
  let recoverySalt: string;
  let sessionSecret: string;
  let recoveryCode = '';
  if (existing) {
    ({ recoveryHash, recoverySalt, sessionSecret } = existing);
  } else {
    recoveryCode = genRecoveryCode();
    recoverySalt = crypto.randomBytes(16).toString('hex');
    recoveryHash = hashRecovery(recoveryCode, recoverySalt);
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  write({
    // Garde les champs existants (clé d'API du widget iOS notamment).
    ...existing,
    credentials: [
      {
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey).toString('base64'),
        counter: cred.counter,
        transports: response.response.transports ?? cred.transports,
      },
    ],
    recoveryHash,
    recoverySalt,
    sessionSecret,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
  return { recoveryCode };
}

/* ------------------------------ authentication ----------------------------- */

export async function authenticationOptions(req: Request) {
  const { rpID } = rp(req);
  const d = read();
  const opts = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (d?.credentials ?? []).map((c) => ({
      id: c.id,
      transports: c.transports as never,
    })),
    userVerification: 'preferred',
  });
  currentChallenge = opts.challenge;
  return opts;
}

export async function verifyAuthentication(
  req: Request,
  response: AuthenticationResponseJSON,
): Promise<boolean> {
  if (!currentChallenge) return false;
  const { rpID, origin } = rp(req);
  const d = read();
  if (!d) return false;
  const cred = d.credentials.find((c) => c.id === response.id);
  if (!cred) return false;
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: currentChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.id,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')),
      counter: cred.counter,
      transports: cred.transports as never,
    },
  });
  currentChallenge = null;
  if (!verification.verified) return false;
  cred.counter = verification.authenticationInfo.newCounter;
  write(d);
  return true;
}

// Limiteur global (utilisateur unique) : 5 essais de code par minute. Global
// plutôt que par IP : derrière `trust proxy`, l'IP client est falsifiable.
const RECOVER_WINDOW_MS = 60_000;
const RECOVER_MAX = 5;
let recoverAttempts: number[] = [];

/** Vrai si un essai de code de récupération est autorisé maintenant (et le compte). */
export function allowRecoveryAttempt(now = Date.now()): boolean {
  recoverAttempts = recoverAttempts.filter((t) => now - t < RECOVER_WINDOW_MS);
  if (recoverAttempts.length >= RECOVER_MAX) return false;
  recoverAttempts.push(now);
  return true;
}

export async function verifyRecovery(code: string): Promise<boolean> {
  const d = read();
  if (!d) return false;
  const a = await hashRecoveryAsync(code, d.recoverySalt);
  const b = Buffer.from(d.recoveryHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* -------------------------------- middleware ------------------------------- */

/**
 * Requête émise par la machine elle-même (boucle e-paper). Une requête relayée
 * par un reverse proxy installé sur le Pi arrive AUSSI de 127.0.0.1 : la
 * présence d'un en-tête de proxy l'exclut, sinon Internet passerait pour local.
 */
function isDirectLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const proxied = Boolean(
    req.get('x-forwarded-for') || req.get('x-forwarded-host') || req.get('x-real-ip') || req.get('forwarded'),
  );
  return loopback && !proxied;
}

/**
 * Comme `requireAuth`, mais laisse passer la boucle locale directe. Réservé au
 * rendu de la dalle (`GET /render.png`) : aucune autre route n'est exemptée.
 */
export function requireAuthOrLocal(req: Request, res: Response, next: NextFunction): void {
  if (isDirectLoopback(req)) return next();
  requireAuth(req, res, next);
}

/** Protège une route : clé d'API (Bearer) ou session valide. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (token && verifyApiToken(token)) return next(); // app iOS / widget
  if (!isConfigured()) {
    res.status(401).json({ error: 'not-configured' });
    return;
  }
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
