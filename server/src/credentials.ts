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
  if (!creds && cfg.useMacKeychain) creds = readFromKeychain();
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
