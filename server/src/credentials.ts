import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { getConfigDir, ensureConfigDir, loadConfig } from './config.js';

/** client_id public utilisé par Claude Code pour le flux OAuth. */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
/** Connexion « compte Claude » (abonnement Pro/Max), comme `claude` → /login. */
const AUTHORIZE_URL = 'https://claude.com/cai/oauth/authorize';
/** Redirection « manuelle » : la page de Claude affiche un code `code#state` à recopier. */
const MANUAL_REDIRECT_URL = 'https://platform.claude.com/oauth/code/callback';
/** `user:profile` est exigé par l'endpoint usage (un token `claude setup-token`,
 * limité à `user:inference`, y reçoit un 403). */
const LOGIN_SCOPES = ['user:profile', 'user:inference'];
const LOGIN_TTL_MS = 10 * 60_000;

/**
 * Origine des credentials gérés :
 * - `dashboard` : connexion OAuth faite depuis le dashboard → identifiants
 *   PROPRES à cette app, qu'aucun Claude Code ne rafraîchit (recommandé) ;
 * - `import` : copie des credentials d'un Claude Code → partagés : quand l'un
 *   rafraîchit, l'autre est déconnecté.
 */
export type CredsOrigin = 'dashboard' | 'import';

export interface OAuthCreds {
  accessToken: string;
  refreshToken: string;
  /** Expiration en ms epoch. */
  expiresAt: number;
  scopes?: string[];
  origin?: CredsOrigin;
  /** Date ISO de la connexion / de l'import. */
  connectedAt?: string;
  /** E-mail du compte (connexion depuis le dashboard, si l'API le fournit). */
  account?: string;
}

/** Notre copie gérée des credentials (on ne touche jamais au fichier de Claude Code). */
const storePath = () => path.join(getConfigDir(), 'credentials.json');

/**
 * Normalise différents formats:
 * - fichier Claude Code: { claudeAiOauth: { accessToken, refreshToken, expiresAt } }
 * - fichier plat (notre store): { accessToken, refreshToken, expiresAt, origin… }
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
    origin: o.origin === 'dashboard' || o.origin === 'import' ? o.origin : undefined,
    connectedAt: typeof o.connectedAt === 'string' ? o.connectedAt : undefined,
    account: typeof o.account === 'string' ? o.account : undefined,
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
  if (creds) {
    creds = { ...creds, origin: 'import', connectedAt: new Date().toISOString(), account: undefined };
    saveStore(creds);
  }
  return creds;
}

export function loadStore(): OAuthCreds | null {
  return readFromFile(storePath()) ?? importFromSource();
}

export function saveStore(creds: OAuthCreds): void {
  ensureConfigDir();
  const p = storePath();
  fs.writeFileSync(p, JSON.stringify(creds, null, 2), { mode: 0o600 });
  // `mode` ne s'applique qu'à la création : on force aussi sur un fichier existant.
  fs.chmodSync(p, 0o600);
}

/** Oublie les credentials gérés (« Se déconnecter »). */
export function deleteStore(): void {
  fs.rmSync(storePath(), { force: true });
}

async function postToken(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`.trim());
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as Record<string, unknown>;
}

async function doRefresh(creds: OAuthCreds): Promise<OAuthCreds> {
  let j: Record<string, unknown>;
  try {
    j = await postToken({ grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: CLIENT_ID });
  } catch (e) {
    throw new Error(`refresh failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const next: OAuthCreds = {
    ...creds, // conserve origine, date de connexion et compte
    accessToken: String(j.access_token),
    refreshToken: typeof j.refresh_token === 'string' ? j.refresh_token : creds.refreshToken,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
  saveStore(next);
  return next;
}

/**
 * Un seul refresh à la fois : le refresh token est à usage unique (rotation),
 * deux refresh concurrents feraient échouer l'un et pourraient invalider la
 * connexion — fatal pour des identifiants propres à l'app.
 */
let refreshing: Promise<OAuthCreds> | null = null;
export function refreshToken(creds: OAuthCreds): Promise<OAuthCreds> {
  refreshing ??= doRefresh(creds).finally(() => {
    refreshing = null;
  });
  return refreshing;
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

/* -------------------- connexion OAuth depuis le dashboard -------------------- */
// Même flux que `claude` → /login (compte Claude), en mode « code à recopier » :
// PKCE S256, la page de Claude affiche `code#state`, qu'on échange ici contre
// des identifiants propres à l'app.

interface PendingLogin {
  verifier: string;
  state: string;
  expiresAt: number;
}
/** Un seul utilisateur, une seule connexion en cours. */
let pendingLogin: PendingLogin | null = null;

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Démarre une connexion : renvoie l'URL d'autorisation à ouvrir. */
export function startDashboardLogin(): string {
  const verifier = b64url(crypto.randomBytes(32));
  const state = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  pendingLogin = { verifier, state, expiresAt: Date.now() + LOGIN_TTL_MS };
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.append('code', 'true');
  url.searchParams.append('client_id', CLIENT_ID);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('redirect_uri', MANUAL_REDIRECT_URL);
  url.searchParams.append('scope', LOGIN_SCOPES.join(' '));
  url.searchParams.append('code_challenge', challenge);
  url.searchParams.append('code_challenge_method', 'S256');
  url.searchParams.append('state', state);
  return url.toString();
}

/** Erreur de connexion avec un message prêt à afficher. */
export class LoginError extends Error {
  constructor(
    message: string,
    readonly code: 'no-pending' | 'format' | 'state' | 'exchange' | 'network',
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

/**
 * Échange le code collé (`code#state`) contre des identifiants. Ne les
 * enregistre PAS : l'appelant les teste d'abord (endpoint usage) puis appelle
 * `saveStore`. La connexion en attente est consommée (un code = un essai).
 */
export async function exchangeDashboardCode(pasted: unknown): Promise<OAuthCreds> {
  const pending = pendingLogin;
  if (!pending || Date.now() > pending.expiresAt) {
    pendingLogin = null;
    throw new LoginError('Aucune connexion en cours (ou plus de 10 min) : clique à nouveau sur « Se connecter à Claude ».', 'no-pending');
  }
  const raw = typeof pasted === 'string' ? pasted.replace(/\s+/g, '') : '';
  const [code, state] = raw.split('#');
  if (!code || !state) {
    throw new LoginError('Code incomplet : copie tout le code affiché par Claude (il contient un « # »).', 'format');
  }
  if (state !== pending.state) {
    throw new LoginError('Ce code ne correspond pas à la dernière connexion lancée : recommence depuis « Se connecter à Claude ».', 'state');
  }
  pendingLogin = null;
  let j: Record<string, unknown>;
  try {
    j = await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: MANUAL_REDIRECT_URL,
      client_id: CLIENT_ID,
      code_verifier: pending.verifier,
      state,
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === undefined) throw new LoginError('Erreur réseau : impossible de joindre platform.claude.com.', 'network');
    throw new LoginError(
      status === 400 || status === 401
        ? `Code refusé (${status}) : il est expiré ou déjà utilisé. Recommence depuis « Se connecter à Claude ».`
        : `Échange du code impossible (${status}).`,
      'exchange',
    );
  }
  if (typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') {
    throw new LoginError('Réponse inattendue de Claude (pas de jeton).', 'exchange');
  }
  const account = (j.account ?? {}) as Record<string, unknown>;
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    scopes: typeof j.scope === 'string' ? j.scope.split(' ').filter(Boolean) : LOGIN_SCOPES,
    origin: 'dashboard',
    connectedAt: new Date().toISOString(),
    account: typeof account.email_address === 'string' ? account.email_address : undefined,
  };
}

/* ------------------------------ source active ------------------------------ */

/** `dashboard` = connexion propre à l'app ; `claude-code` = credentials importés (partagés). */
export type CredentialSource = 'dashboard' | 'claude-code' | 'none';

/** Ce qui est exposé (API, SSE) : jamais de jeton. */
export interface ConnectionInfo {
  source: CredentialSource;
  /** Date ISO de la connexion / de l'import (inconnue pour un ancien store). */
  connectedAt: string | null;
  /** E-mail du compte connecté, si connu. */
  account: string | null;
}

export function connectionInfo(creds: OAuthCreds | null): ConnectionInfo {
  return {
    source: !creds ? 'none' : creds.origin === 'dashboard' ? 'dashboard' : 'claude-code',
    connectedAt: creds?.connectedAt ?? null,
    account: creds?.account ?? null,
  };
}

export interface ResolvedAccess {
  info: ConnectionInfo;
  /** Token à utiliser, ou null (aucune source, ou refresh en échec). */
  accessToken: string | null;
  /** Échec d'obtention du token (ex. refresh). */
  error?: string;
}

/** Source déterminée AVANT tout appel réseau : elle reste juste même si le refresh échoue. */
export async function resolveAccess(): Promise<ResolvedAccess> {
  const info = connectionInfo(loadStore());
  try {
    return { info, accessToken: await getValidAccessToken() };
  } catch (e) {
    return { info, accessToken: null, error: e instanceof Error ? e.message : String(e) };
  }
}
