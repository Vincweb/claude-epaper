/** Une fenêtre de limite (5h ou 7j) renvoyée par l'endpoint oauth/usage. */
export interface UsageWindow {
  /** Pourcentage consommé, 0-100. */
  utilization: number;
  /** Date ISO de réinitialisation, ou null si absente. */
  resetsAt: string | null;
}

export interface UsageSnapshot {
  fiveHour: UsageWindow;
  sevenDay: UsageWindow;
  /** Certains comptes exposent un quota Opus 7j séparé. */
  sevenDayOpus?: UsageWindow;
  /** Payload brut de l'API, conservé pour debug / champs futurs. */
  raw: unknown;
  /** Date ISO du fetch côté serveur. */
  fetchedAt: string;
}

export interface PollerState {
  snapshot: UsageSnapshot | null;
  authenticated: boolean;
  lastError: string | null;
  lastFetchedAt: string | null;
  /** Dernière fois qu'une conso a bougé (détection d'inactivité). */
  lastActivityAt: string | null;
  /** XP cumulée depuis la conso (accélère le niveau). */
  usageXp: number;
}
