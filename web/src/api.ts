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

/* ------------------------------ sprites poses ------------------------------ */

export type SpriteVariant = 'epaper' | 'web';

export interface PoseAssetInfo {
  animated: boolean;
  custom: boolean;
}

export interface PoseInfo {
  key: string;
  title: string;
  /** Pose contextuelle (déclenchée par un état) plutôt qu'en rotation. */
  special: boolean;
  /** Pose ajoutée par l'utilisateur (renommable ET supprimable). */
  userAdded: boolean;
  /** Pose de base retirée de la rotation (masquée, réversible). */
  disabled: boolean;
  epaper: PoseAssetInfo;
  web: PoseAssetInfo;
}

export async function listPoses(): Promise<PoseInfo[]> {
  const r = await fetch('/api/poses');
  return (await r.json()).poses ?? [];
}

/** Renomme une humeur (base ou personnalisée). */
export async function renamePose(key: string, title: string): Promise<void> {
  const r = await fetch(`/api/poses/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'rename-failed');
}

/** Ajoute une humeur de rotation personnalisée. */
export async function addRotationPose(title: string): Promise<void> {
  const r = await fetch('/api/poses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'add-failed');
}

/** Supprime une humeur personnalisée (et ses visuels). */
export async function deletePose(key: string): Promise<void> {
  await fetch(`/api/poses/${key}`, { method: 'DELETE' });
}

/** Masque (retire de la rotation) ou réaffiche une pose de base. */
export async function setPoseEnabled(key: string, enabled: boolean): Promise<void> {
  const r = await fetch(`/api/poses/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled: !enabled }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'toggle-failed');
}

export function poseAssetUrl(variant: SpriteVariant, key: string, bump = 0): string {
  return `/api/poses/${variant}/${key}?v=${bump}`;
}

/** Remplace le visuel d'une pose (PNG ou GIF envoyé tel quel). */
export async function uploadPoseAsset(variant: SpriteVariant, key: string, file: File): Promise<void> {
  const r = await fetch(`/api/poses/${variant}/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'upload-failed');
}

/** Supprime la personnalisation d'une pose (retour au visuel par défaut). */
export async function resetPoseAsset(variant: SpriteVariant, key: string): Promise<void> {
  await fetch(`/api/poses/${variant}/${key}`, { method: 'DELETE' });
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

export interface VersionInfo {
  version: string;
  commit: string;
  date: string;
}
export async function getVersion(): Promise<VersionInfo> {
  return (await fetch('/api/system/version', { cache: 'no-store' })).json();
}

export interface UpdateCheck {
  behind: number;
  current?: string;
  latest?: string;
  /** Version (package.json) telle qu'elle est sur le dépôt distant. */
  latestVersion?: string;
  subject?: string;
  error?: string;
}
export async function checkUpdate(): Promise<UpdateCheck> {
  return (await fetch('/api/system/update-check')).json();
}

/** Déclenche la mise à jour (git pull + build + redémarrage) côté serveur. */
export async function systemUpdate(): Promise<{ started: boolean }> {
  const r = await fetch('/api/system/update', { method: 'POST' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'update-failed');
  return r.json();
}
