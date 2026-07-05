import { EventEmitter } from 'node:events';
import { getValidAccessToken } from './credentials.js';
import { fetchUsage } from './usage.js';
import { loadConfig, saveConfig } from './config.js';
import {
  deriveStats,
  forcedPose,
  levelInfo,
  poseByKey,
  selectPose,
  SHUFFLE_POOL,
  type Pose,
} from './mascot.js';
import type { PollerState, UsageSnapshot } from './types.js';

/**
 * Poll périodiquement l'endpoint usage, met en cache le dernier état,
 * calcule les dérivés (pose, stats, niveau) — source de vérité unique pour le
 * dashboard web ET le rendu e-paper — et émet `state` à chaque changement.
 */
export class UsagePoller extends EventEmitter {
  state: PollerState = {
    snapshot: null,
    authenticated: false,
    lastError: null,
    lastFetchedAt: null,
    lastActivityAt: null,
    usageXp: loadConfig().usageXp,
    pose: SHUFFLE_POOL[0],
    stats: [],
    level: 1,
    ageLabel: '0 h',
    poseManual: false,
  };

  /** Pose forcée par l'utilisateur, honorée jusqu'à `manualUntil`. */
  private manualPose: Pose | null = null;
  private manualUntil = 0;

  private timer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  /** Recalcule pose/stats/niveau à partir de l'état + config courants. */
  private recompute(): void {
    const cfg = loadConfig();
    const now = new Date();
    // Un contexte fort (anniversaire / stress / nuit / inactivité) reprend la main sur le choix manuel.
    const snapshot = this.state.snapshot;
    const forced = forcedPose({ now, config: cfg, lastActivityAt: this.state.lastActivityAt, snapshot });
    const manualValid = this.manualPose && Date.now() < this.manualUntil;
    let pose: Pose;
    let manual = false;
    if (forced) {
      pose = forced;
    } else if (manualValid) {
      pose = this.manualPose as Pose;
      manual = true;
    } else {
      this.manualPose = null;
      pose = selectPose({ now, config: cfg, lastActivityAt: this.state.lastActivityAt, snapshot });
    }
    const { level, label } = levelInfo(cfg.bornAt, this.state.usageXp);
    this.state.pose = pose;
    this.state.poseManual = manual;
    this.state.stats = deriveStats(this.state.snapshot, this.state.lastActivityAt);
    this.state.level = level;
    this.state.ageLabel = label;
  }

  /** Force une pose aléatoire (hors poses contextuelles), honorée un moment. */
  shufflePose(): Pose {
    const cfg = loadConfig();
    const current = this.state.pose.key;
    const choices = SHUFFLE_POOL.filter((p) => p.key !== current);
    const pick = choices[Math.floor(Math.random() * choices.length)] ?? SHUFFLE_POOL[0];
    this.manualPose = pick;
    // Honorée le temps d'une fenêtre de rotation (min 30 min), puis retour à l'auto.
    this.manualUntil = Date.now() + Math.max(30, cfg.rotateMinutes) * 60_000;
    this.recompute();
    this.emit('state', this.state);
    return pick;
  }

  /** Repasse en sélection automatique. */
  resetPose(): void {
    this.manualPose = null;
    this.manualUntil = 0;
    this.recompute();
    this.emit('state', this.state);
  }

  setPose(key: string): Pose | null {
    const pose = poseByKey(key);
    if (!pose) return null;
    const cfg = loadConfig();
    this.manualPose = pose;
    this.manualUntil = Date.now() + Math.max(30, cfg.rotateMinutes) * 60_000;
    this.recompute();
    this.emit('state', this.state);
    return pose;
  }

  async tick(): Promise<void> {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        this.state.authenticated = false;
        this.state.lastError = 'no credentials';
        this.recompute();
        this.emit('state', this.state);
        return;
      }
      this.state.authenticated = true;
      const snap = await fetchUsage(token);
      const prev = this.state.snapshot;
      this.state.snapshot = snap;
      this.state.lastError = null;
      this.state.lastFetchedAt = snap.fetchedAt;

      const utilChanged =
        prev &&
        (prev.fiveHour.utilization !== snap.fiveHour.utilization ||
          prev.sevenDay.utilization !== snap.sevenDay.utilization);
      if (!prev || utilChanged) this.state.lastActivityAt = snap.fetchedAt;

      if (prev) {
        const gained =
          Math.max(0, snap.fiveHour.utilization - prev.fiveHour.utilization) +
          Math.max(0, snap.sevenDay.utilization - prev.sevenDay.utilization);
        if (gained > 0) {
          this.state.usageXp += gained;
          saveConfig({ usageXp: this.state.usageXp });
        }
      }

      this.recompute();
      this.emit('state', this.state);
      if (!prev || utilChanged) this.emit('change', snap, prev ?? null);
    } catch (e) {
      this.state.lastError = e instanceof Error ? e.message : String(e);
      this.recompute();
      this.emit('state', this.state);
    }
  }

  start(): void {
    const cfg = loadConfig();
    this.recompute();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), cfg.pollIntervalMs);
    // Rafraîchit la pose (rotation / nuit / expiration du manuel) sans re-fetch.
    this.refreshTimer = setInterval(() => {
      const before = this.state.pose.key;
      this.recompute();
      if (this.state.pose.key !== before) this.emit('state', this.state);
    }, 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.timer = null;
    this.refreshTimer = null;
  }

  restart(): void {
    this.stop();
    this.start();
  }
}

export const poller = new UsagePoller();
export type { UsageSnapshot };
