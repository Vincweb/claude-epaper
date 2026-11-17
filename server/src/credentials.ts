import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getConfigDir, ensureConfigDir, loadConfig } from './config.js';

/** client_id public utilisé par Claude Code pour le flux OAuth. */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';

export interface OAuthCreds {
  accessToken: string;
  refreshToken: string;
  /** Expiration en ms epoch. */
  expiresAt: number;
  scopes?: string[];
}

/** Notre copie gérée des credentials (on ne touche jamais au fichier de Claude Code). */
const storePath = () => path.join(getConfigDir(), 'credentials.json');

/**
 * Normalise différents formats:
 * - fichier Claude Code: { claudeAiOauth: { accessToken, refreshToken, expiresAt } }
 * - fichier plat: { accessToken, refreshToken, expiresAt }
 */
function normalize(obj: unknown): OAuthCreds | null {
  if (!obj || typeof obj !== 'object') return null;
  const src = (obj as Record<string, unknown>).claudeAiOauth ?? obj;
  const o = src as Record<string, unknown>;
  if (typeof o.accessToken !== 'string' || typeof o.refreshToken !== 'string') return null;
  return {
    accessToken: o.accessToken,
    refreshToken: o.refreshToken,
    expiresAt: Number(o.expiresAt) || 0,
    scopes: Array.isArray(o.scopes) ? (o.scopes as string[]) : undefined,
  };
}

function readFromFile(p: string): OAuthCreds | null {
  try {
    return normalize(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
}

/** macOS: Claude Code stocke les credentials dans le Keychain. */
function readFromKeychain(): OAuthCreds | null {
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8' },
    );
    return normalize(JSON.parse(out));
  } catch {
    return null;
  }
}

/** Importe les credentials depuis la source (fichier puis Keychain) vers notre store. */
export function importFromSource(): OAuthCreds | null {
  const cfg = loadConfig();
  let creds = readFromFile(cfg.credentialsPath);
  // Sur macOS, Claude Code stocke aussi ses credentials dans le Keychain.
  if (!creds && process.platform === 'darwin') creds = readFromKeychain();
  if (creds) saveStore(creds);
  return creds;
}

export function loadStore(): OAuthCreds | null {
  return readFromFile(storePath()) ?? importFromSource();
}

export function saveStore(creds: OAuthCreds): void {
  ensureConfigDir();
  fs.writeFileSync(storePath(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export async function refreshToken(creds: OAuthCreds): Promise<OAuthCreds> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) {
    throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  const next: OAuthCreds = {
    accessToken: String(j.access_token),
    refreshToken: typeof j.refresh_token === 'string' ? j.refresh_token : creds.refreshToken,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    scopes: creds.scopes,
  };
  saveStore(next);
  return next;
}

/** Renvoie un access token valide (rafraîchi si expiré), ou null si non authentifié. */
export async function getValidAccessToken(): Promise<string | null> {
  let creds = loadStore();
  if (!creds) return null;
  // Marge de 60s avant expiration.
  if (creds.expiresAt - Date.now() < 60_000) {
    creds = await refreshToken(creds);
  }
  return creds.accessToken;
}

/* ------------------------- token longue durée ------------------------------ */
// Token issu de « claude setup-token » : pas de refresh token, jamais rafraîchi,
// utilisé tel quel. Prioritaire sur les credentials Claude Code (partager ces
// derniers entre deux machines déconnecte l'une quand l'autre rafraîchit).

interface LongTokenRecord {
  token: string;
  /** Date ISO d'enregistrement. */
  savedAt: string;
  /** Date ISO du dernier 401 : le token est expiré/révoqué, on ne le rappelle plus. */
  rejectedAt?: string | null;
}

/** Fichier dédié (jamais dans config.json, renvoyé tel quel par GET /config). */
const longTokenPath = () => path.join(getConfigDir(), 'claude-token.json');

function writeLongToken(rec: LongTokenRecord): void {
  ensureConfigDir();
  const p = longTokenPath();
  fs.writeFileSync(p, JSON.stringify(rec, null, 2), { mode: 0o600 });
  // `mode` ne s'applique qu'à la création : on force aussi sur un fichier existant.
  fs.chmodSync(p, 0o600);
}

function readLongToken(): LongTokenRecord | null {
  try {
    const j = JSON.parse(fs.readFileSync(longTokenPath(), 'utf8')) as Partial<LongTokenRecord>;
    if (typeof j.token !== 'string' || !j.token) return null;
    return { token: j.token, savedAt: String(j.savedAt ?? ''), rejectedAt: j.rejectedAt ?? null };
  } catch {
    return null;
  }
}

/** Nettoie un token collé (le terminal coupe souvent les longues lignes). */
export function normalizeLongToken(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
}

/** Validation de forme volontairement permissive : le vrai juge est l'appel de test. */
export function longTokenFormatError(token: string): string | null {
  if (!token) return 'Token vide.';
  if (token.length < 20) return 'Token trop court : colle la ligne complète affichée par « claude setup-token ».';
  if (token.length > 1000) return 'Token trop long : vérifie ce que tu as collé.';
  if (!/^[\x21-\x7e]+$/.test(token)) return 'Le token contient des caractères inattendus.';
  return null;
}

export function saveLongToken(token: string): void {
  writeLongToken({ token, savedAt: new Date().toISOString(), rejectedAt: null });
}

export function deleteLongToken(): void {
  fs.rmSync(longTokenPath(), { force: true });
}

/**
 * Marque le token comme refusé (401) : plus aucun appel tant qu'il n'est pas
 * remplacé. Ne touche le fichier que s'il contient toujours CE token (un tick en
 * vol ne doit pas condamner un token enregistré entre-temps).
 */
export function markLongTokenRejected(token: string): boolean {
  const rec = readLongToken();
  if (!rec || rec.token !== token) return false;
  if (!rec.rejectedAt) writeLongToken({ ...rec, rejectedAt: new Date().toISOString() });
  return true;
}

export type CredentialSource = 'long-token' | 'claude-code' | 'none';

/** Ce qui peut être exposé (API, SSE) : jamais le token lui-même. */
export interface ConnectionInfo {
  source: CredentialSource;
  /** 4 derniers caractères du token longue durée. */
  tokenLast4: string | null;
  tokenSavedAt: string | null;
  /** Le token longue durée a reçu un 401 : expiré ou révoqué, à régénérer. */
  tokenRejected: boolean;
}

export interface ResolvedAccess {
  info: ConnectionInfo;
  /** Token à utiliser, ou null (aucune source, token longue durée refusé, refresh en échec). */
  accessToken: string | null;
  /** Échec d'obtention du token (ex. refresh des credentials Claude Code). */
  error?: string;
}

/**
 * Résolveur unique de la source : token longue durée s'il existe (sans jamais
 * toucher aux credentials Claude Code ni rafraîchir), sinon le mécanisme
 * historique (copie gérée + refresh), inchangé.
 */
export async function resolveAccess(): Promise<ResolvedAccess> {
  const rec = readLongToken();
  if (rec) {
    return {
      info: {
        source: 'long-token',
        tokenLast4: rec.token.slice(-4),
        tokenSavedAt: rec.savedAt || null,
        tokenRejected: Boolean(rec.rejectedAt),
      },
      accessToken: rec.rejectedAt ? null : rec.token,
    };
  }
  // Source déterminée AVANT tout appel réseau : elle doit rester juste même si
  // le refresh échoue (credentials partagés dont le refresh token est mort).
  const info: ConnectionInfo = {
    source: loadStore() ? 'claude-code' : 'none',
    tokenLast4: null,
    tokenSavedAt: null,
    tokenRejected: false,
  };
  try {
    return { info, accessToken: await getValidAccessToken() };
  } catch (e) {
    return { info, accessToken: null, error: e instanceof Error ? e.message : String(e) };
  }
}
