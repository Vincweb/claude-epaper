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
