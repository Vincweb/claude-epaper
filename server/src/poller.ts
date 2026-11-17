import { EventEmitter } from 'node:events';
import { markLongTokenRejected, resolveAccess, type ConnectionInfo } from './credentials.js';
import { fetchUsage, redactSecrets, UsageError } from './usage.js';
import { loadConfig, saveConfig } from './config.js';
import {
  deriveStats,
  DEFAULT_POSE,
  forcedPose,
  levelInfo,
  selectPose,
  type Pose,
} from './mascot.js';
import { customPoses, findPose, resolvePose, rotationPoses } from './poses.js';
import type { PollerState, UsageSnapshot } from './types.js';

/** Message d'état quand le token longue durée reçoit un 401. */
export const TOKEN_REJECTED_MSG =
  'token longue durée refusé (401) : expiré ou révoqué — régénère-le avec « claude setup-token »';

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
    connection: { source: 'none', tokenLast4: null, tokenSavedAt: null, tokenRejected: false },
    lastFetchedAt: null,
    lastActivityAt: null,
    usageXp: loadConfig().usageXp,
    pose: DEFAULT_POSE,
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
      pose = selectPose({
        now,
        config: cfg,
        lastActivityAt: this.state.lastActivityAt,
        snapshot,
        rotation: customPoses(),
      });
    }
    const { level, label } = levelInfo(cfg.bornAt, this.state.usageXp);
    // Applique la personnalisation (titre + look) ; les poses perso sont déjà résolues.
    this.state.pose = resolvePose(pose);
    this.state.poseManual = manual;
    this.state.stats = deriveStats(this.state.snapshot, this.state.lastActivityAt);
    this.state.level = level;
    this.state.ageLabel = label;
  }

  /** Force une pose aléatoire parmi les humeurs personnalisées (rotation). */
  shufflePose(): Pose {
    const cfg = loadConfig();
    const pool = rotationPoses();
    const current = this.state.pose.key;
    const choices = pool.filter((p) => p.key !== current);
    const pick = choices[Math.floor(Math.random() * choices.length)] ?? pool[0] ?? DEFAULT_POSE;
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

  /** Recalcule et pousse l'état (ex. après renommage/ajout/suppression de pose). */
  refresh(): void {
    this.recompute();
    this.emit('state', this.state);
  }

  setPose(key: string): Pose | null {
    const pose = findPose(key);
    if (!pose) return null;
    const cfg = loadConfig();
    this.manualPose = pose;
    this.manualUntil = Date.now() + Math.max(30, cfg.rotateMinutes) * 60_000;
    this.recompute();
    this.emit('state', this.state);
    return pose;
  }

  /** Intègre un snapshot frais (tick, ou test d'un token tout juste enregistré). */
  ingest(snap: UsageSnapshot, connection?: ConnectionInfo): void {
    if (connection) this.state.connection = connection;
    this.state.authenticated = true;
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
  }

  async tick(): Promise<void> {
    let used: { source: ConnectionInfo['source']; token: string } | null = null;
    try {
      const { info, accessToken, error } = await resolveAccess();
      this.state.connection = info;
      if (accessToken) used = { source: info.source, token: accessToken };
      if (!accessToken) {
        // Échec du refresh (credentials Claude Code) : comportement historique,
        // seule l'erreur change. Sinon : pas de source, ou token longue durée
        // refusé → on n'appelle plus l'API (pas de boucle de 401) et on ne
        // retombe pas sur les credentials Claude Code.
        if (error) this.state.lastError = redactSecrets(error);
        else {
          this.state.authenticated = false;
          this.state.lastError = info.tokenRejected ? TOKEN_REJECTED_MSG : 'no credentials';
        }
        this.recompute();
        this.emit('state', this.state);
        return;
      }
      this.state.authenticated = true;
      this.ingest(await fetchUsage(accessToken));
    } catch (e) {
      if (e instanceof UsageError && e.status === 401 && used?.source === 'long-token') {
        // Token remplacé pendant l'appel : on ignore ce résultat périmé.
        if (!markLongTokenRejected(used.token)) return;
        this.state.connection = { ...this.state.connection, tokenRejected: true };
        this.state.authenticated = false;
        this.state.lastError = TOKEN_REJECTED_MSG;
      } else {
        this.state.lastError = redactSecrets(e instanceof Error ? e.message : String(e));
      }
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
