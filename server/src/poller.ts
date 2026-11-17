import { EventEmitter } from 'node:events';
import { forceRefresh, resolveAccess, type ConnectionInfo } from './credentials.js';
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

/** Refresh refusé (400/401) : la connexion est expirée ou révoquée, il faut se reconnecter. */
function friendlyAccessError(error: string): string {
  return /^refresh failed: (400|401)\b/.test(error)
    ? 'connexion à Claude expirée ou révoquée (refresh refusé) — reconnecte-toi dans Config'
    : redactSecrets(error);
}

/** Premier délai de nouvel essai après une erreur passagère, puis ×2 à chaque échec. */
const RETRY_BASE_MS = 15_000;
/** Plafond du délai entre deux essais en cas d'erreurs répétées. */
const RETRY_MAX_MS = 15 * 60_000;
/** Erreur passagère tolérée sans passer « hors ligne » tant que les données ont moins de… */
const STALE_GRACE_MS = 10 * 60_000;

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
    online: false,
    connection: { source: 'none', connectedAt: null, account: null },
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
  /** Échecs consécutifs (backoff) et nature du dernier (passager ou non). */
  private failures = 0;
  private transientError = false;
  private retryAfterMs: number | null = null;

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
    this.state.online = this.computeOnline();
  }

  /**
   * « En ligne » pour la dalle : données présentes et à jour. Une erreur
   * PASSAGÈRE (réseau, 429, panne API) ne fait pas basculer en « HORS LIGNE »
   * tant que les dernières données sont récentes : un hoquet d'une seconde ne
   * doit pas faire clignoter l'écran.
   */
  private computeOnline(): boolean {
    const st = this.state;
    if (!st.snapshot || !st.authenticated) return false;
    if (!st.lastError) return true;
    if (!this.transientError || !st.lastFetchedAt) return false;
    const grace = Math.max(STALE_GRACE_MS, 3 * loadConfig().pollIntervalMs);
    return Date.now() - new Date(st.lastFetchedAt).getTime() < grace;
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
    this.failures = 0;
    this.transientError = false;
    this.retryAfterMs = null;
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

  /** Note un échec : passager (on réessaiera vite, sans passer hors ligne) ou non. */
  private fail(message: string, transient: boolean, retryAfterMs: number | null = null): void {
    this.failures += 1;
    this.transientError = transient;
    this.retryAfterMs = retryAfterMs;
    this.state.lastError = message;
    this.recompute();
    this.emit('state', this.state);
  }

  async tick(): Promise<void> {
    try {
      const { info, accessToken, error } = await resolveAccess();
      this.state.connection = info;
      if (!accessToken) {
        if (error) {
          // Refresh refusé (400/401) : définitif jusqu'à reconnexion. Sinon (réseau…) : passager.
          const refused = /^refresh failed: (400|401)\b/.test(error);
          this.fail(friendlyAccessError(error), !refused);
        } else {
          this.state.authenticated = false;
          this.fail('no credentials', false);
        }
        return;
      }
      this.state.authenticated = true;
      let snap;
      try {
        snap = await fetchUsage(accessToken);
      } catch (e) {
        // 401 alors que le token n'avait pas expiré : un refresh forcé, puis un seul nouvel essai.
        // Une seule fois par série d'échecs : si l'API refuse encore, on ne fait pas
        // tourner le refresh token à chaque tick.
        if (!(e instanceof UsageError && e.status === 401) || this.failures > 0) throw e;
        const fresh = await forceRefresh();
        if (!fresh) throw e;
        snap = await fetchUsage(fresh);
      }
      this.ingest(snap);
    } catch (e) {
      const message = redactSecrets(e instanceof Error ? e.message : String(e));
      if (e instanceof UsageError) this.fail(message, e.transient, e.retryAfterMs);
      else this.fail(/^refresh failed: (400|401)\b/.test(message) ? friendlyAccessError(message) : message, !/^refresh failed: (400|401)\b/.test(message));
    }
  }

  /** Délai avant le prochain appel : l'intervalle normal, ou un backoff après échec. */
  private nextDelay(): number {
    const interval = loadConfig().pollIntervalMs;
    if (this.failures === 0) return interval;
    if (!this.transientError) return interval; // erreur durable : inutile d'insister plus vite
    const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (this.failures - 1));
    return Math.max(backoff, this.retryAfterMs ?? 0);
  }

  /**
   * Boucle de polling : un appel à la fois, le suivant planifié à la fin du
   * précédent. `generation` invalide une boucle dont le tick était en vol lors
   * d'un `restart()` (sinon deux boucles tourneraient en parallèle).
   */
  private generation = 0;
  private async loop(gen: number): Promise<void> {
    await this.tick();
    if (gen === this.generation) this.timer = setTimeout(() => void this.loop(gen), this.nextDelay());
  }

  start(): void {
    const gen = ++this.generation;
    this.recompute();
    void this.loop(gen);
    // Rafraîchit la pose (rotation / nuit / expiration du manuel) sans re-fetch.
    this.refreshTimer = setInterval(() => {
      const before = this.state.pose.key;
      const wasOnline = this.state.online;
      this.recompute();
      if (this.state.pose.key !== before || this.state.online !== wasOnline) this.emit('state', this.state);
    }, 30_000);
  }

  stop(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
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
