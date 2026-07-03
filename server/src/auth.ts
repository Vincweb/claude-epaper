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
}

const RP_NAME = 'Claude e-paper';
const SESSION_MAX_AGE = 30 * 24 * 3600_000; // 30 j
const authPath = () => path.join(getConfigDir(), 'auth.json');

// Challenge WebAuthn en cours (un seul utilisateur, un seul flux à la fois).
let currentChallenge: string | null = null;

function read(): AuthData | null {
  try {
    return JSON.parse(fs.readFileSync(authPath(), 'utf8')) as AuthData;
  } catch {
    return null;
  }
}
function write(d: AuthData): void {
  ensureConfigDir();
  fs.writeFileSync(authPath(), JSON.stringify(d, null, 2), { mode: 0o600 });
}

export function isConfigured(): boolean {
  const d = read();
  return Boolean(d && d.credentials.length > 0);
}
export function authFilePath(): string {
  return authPath();
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

export function verifyRecovery(code: string): boolean {
  const d = read();
  if (!d) return false;
  const h = hashRecovery(code, d.recoverySalt);
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(d.recoveryHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* -------------------------------- middleware ------------------------------- */

function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Protège une route : configurée + session valide (ou boucle locale). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isLoopback(req)) return next();
  if (!isConfigured()) {
    res.status(401).json({ error: 'not-configured' });
    return;
  }
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
