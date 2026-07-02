import type { UsageSnapshot, UsageWindow } from './types.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

function toWindow(o: unknown): UsageWindow {
  const w = (o ?? {}) as Record<string, unknown>;
  return {
    utilization: Number(w.utilization ?? 0),
    resetsAt: typeof w.resets_at === 'string' ? w.resets_at : null,
  };
}

/** Interroge l'endpoint oauth/usage — le même que la commande /usage de Claude Code. */
export async function fetchUsage(accessToken: string): Promise<UsageSnapshot> {
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/2.0.32',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`usage failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  return {
    fiveHour: toWindow(j.five_hour),
    sevenDay: toWindow(j.seven_day),
    sevenDayOpus: j.seven_day_opus ? toWindow(j.seven_day_opus) : undefined,
    raw: j,
    fetchedAt: new Date().toISOString(),
  };
}
