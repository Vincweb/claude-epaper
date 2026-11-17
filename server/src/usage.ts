import type { UsageSnapshot, UsageWindow } from './types.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const TIMEOUT_MS = 15_000;

/** Erreur d'appel à l'endpoint usage ; `status` null = erreur réseau / timeout. */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Délai demandé par l'API avant de réessayer (en-tête Retry-After), en ms. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'UsageError';
  }

  /** Erreur passagère (réseau, saturation, panne côté API) : on réessaiera. */
  get transient(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

/** En-tête Retry-After : secondes ou date HTTP. */
function parseRetryAfter(v: string | null): number | null {
  if (!v) return null;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.max(0, t - Date.now());
}

/** Masque tout ce qui ressemble à un token Anthropic (au cas où une réponse le renverrait). */
export function redactSecrets(s: string): string {
  return s.replace(/sk-ant-[\w-]+/g, 'sk-ant-…');
}

function toWindow(o: unknown): UsageWindow {
  const w = (o ?? {}) as Record<string, unknown>;
  return {
    utilization: Number(w.utilization ?? 0),
    resetsAt: typeof w.resets_at === 'string' ? w.resets_at : null,
  };
}

/** Interroge l'endpoint oauth/usage — le même que la commande /usage de Claude Code. */
export async function fetchUsage(accessToken: string): Promise<UsageSnapshot> {
  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.0.32',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    const what = e instanceof Error && e.name === 'TimeoutError' ? 'délai dépassé' : cause ?? (e instanceof Error ? e.message : String(e));
    throw new UsageError(`usage failed: réseau (${what})`, null);
  }
  if (!res.ok) {
    const body = redactSecrets((await res.text().catch(() => '')).slice(0, 300));
    throw new UsageError(`usage failed: ${res.status} ${body}`.trim(), res.status, parseRetryAfter(res.headers.get('retry-after')));
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
