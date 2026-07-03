import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type { AppConfig, PollerState } from './lib/usage';

export async function getConfig(): Promise<AppConfig> {
  const r = await fetch('/api/config');
  return r.json();
}

export async function putConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const r = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function importCredentials(): Promise<{ imported: boolean }> {
  const r = await fetch('/api/auth/import', { method: 'POST' });
  return r.json();
}

export async function shufflePose(): Promise<void> {
  await fetch('/api/pose/shuffle', { method: 'POST' });
}
export async function resetPose(): Promise<void> {
  await fetch('/api/pose/reset', { method: 'POST' });
}

/** Abonnement SSE à l'état du poller. Renvoie une fonction de désinscription. */
export function subscribeState(onState: (s: PollerState) => void): () => void {
  const es = new EventSource('/api/usage/stream');
  es.onmessage = (ev) => {
    try {
      onState(JSON.parse(ev.data) as PollerState);
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}

/* ---------------------------------- auth ---------------------------------- */

export interface AuthState {
  configured: boolean;
  authenticated: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  const r = await fetch('/api/auth/state');
  return r.json();
}

/** Enregistre une passkey. Renvoie le code de récup + son QR (1re config). */
export async function registerPasskey(): Promise<{ recoveryCode: string; recoveryQr: string }> {
  const optRes = await fetch('/api/auth/register/options', { method: 'POST' });
  if (!optRes.ok) throw new Error((await optRes.json()).error ?? 'options-failed');
  const optionsJSON = await optRes.json();
  const attResp = await startRegistration({ optionsJSON });
  const verifyRes = await fetch('/api/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(attResp),
  });
  if (!verifyRes.ok) throw new Error((await verifyRes.json()).error ?? 'verify-failed');
  return verifyRes.json();
}

export async function loginPasskey(): Promise<void> {
  const optRes = await fetch('/api/auth/login/options', { method: 'POST' });
  if (!optRes.ok) throw new Error((await optRes.json()).error ?? 'options-failed');
  const optionsJSON = await optRes.json();
  const authResp = await startAuthentication({ optionsJSON });
  const verifyRes = await fetch('/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authResp),
  });
  if (!verifyRes.ok) throw new Error((await verifyRes.json()).error ?? 'verify-failed');
}

export async function recoverWithCode(code: string): Promise<void> {
  const r = await fetch('/api/auth/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error('invalid-code');
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}
