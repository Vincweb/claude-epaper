import { EventEmitter } from 'node:events';
import { getValidAccessToken } from './credentials.js';
import { fetchUsage } from './usage.js';
import { loadConfig, saveConfig } from './config.js';
import type { PollerState, UsageSnapshot } from './types.js';

/**
 * Poll périodiquement l'endpoint usage, met en cache le dernier état,
 * et émet `state` à chaque tick + `change` quand un pourcentage bouge.
 */
export class UsagePoller extends EventEmitter {
  state: PollerState = {
    snapshot: null,
    authenticated: false,
    lastError: null,
    lastFetchedAt: null,
    lastActivityAt: null,
    usageXp: loadConfig().usageXp,
  };

  private timer: NodeJS.Timeout | null = null;

  async tick(): Promise<void> {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        this.state.authenticated = false;
        this.state.lastError = 'no credentials';
        this.emit('state', this.state);
        return;
      }
      this.state.authenticated = true;
      const snap = await fetchUsage(token);
      const prev = this.state.snapshot;
      this.state.snapshot = snap;
      this.state.lastError = null;
      this.state.lastFetchedAt = snap.fetchedAt;
      this.emit('state', this.state);

      const utilChanged =
        prev &&
        (prev.fiveHour.utilization !== snap.fiveHour.utilization ||
          prev.sevenDay.utilization !== snap.sevenDay.utilization);
      // Première conso connue ou variation => activité.
      if (!prev || utilChanged) this.state.lastActivityAt = snap.fetchedAt;

      // XP : chaque point de conso consommé (5h + 7j) fait grimper le niveau.
      if (prev) {
        const gained =
          Math.max(0, snap.fiveHour.utilization - prev.fiveHour.utilization) +
          Math.max(0, snap.sevenDay.utilization - prev.sevenDay.utilization);
        if (gained > 0) {
          this.state.usageXp += gained;
          saveConfig({ usageXp: this.state.usageXp });
        }
      }

      if (!prev || utilChanged) this.emit('change', snap, prev ?? null);
    } catch (e) {
      this.state.lastError = e instanceof Error ? e.message : String(e);
      this.emit('state', this.state);
    }
  }

  start(): void {
    const cfg = loadConfig();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  restart(): void {
    this.stop();
    this.start();
  }
}

export const poller = new UsagePoller();
export type { UsageSnapshot };
