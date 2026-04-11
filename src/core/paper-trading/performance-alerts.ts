/**
 * Performance Alerts — Early Warning System
 *
 * Monitora il drawdown delle sessioni di paper trading e genera alert
 * Telegram PRIMA che il circuit breaker scatti.
 *
 * Warning level 1 (giallo): drawdown >= 50% del limite CB
 * Warning level 2 (arancione): drawdown >= 75% del limite CB
 *
 * Cooldown: minimo 2 ore tra un alert e l'altro (stessa sessione + livello).
 * Upgrade da level 1 a level 2 bypassa il cooldown.
 */

// ---------------------------------------------------------------------------
// Constants (esportate per test e configurazione)
// ---------------------------------------------------------------------------

/** Warning a 50% del limite circuit breaker */
export const WARNING_LEVEL_1_THRESHOLD = 0.5;

/** Warning a 75% del limite circuit breaker */
export const WARNING_LEVEL_2_THRESHOLD = 0.75;

/** Cooldown minimo tra alert dello stesso livello (ms) — 2 ore */
export const WARNING_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceWarningInput {
  sessionId: string;
  strategyCode: string;
  strategyName: string;
  area: 'crypto' | 'polymarket' | 'stocks' | 'betfair' | 'forex';
  /** Drawdown attuale in percentuale (es. 8.5 = 8.5%) */
  currentDrawdownPct: number;
  /** Limite circuit breaker in percentuale (es. 15 = 15%) */
  circuitBreakerLimitPct: number;
  /** Ultimo livello di warning inviato (null se mai inviato) */
  lastWarningLevel: number | null;
  /** Timestamp dell'ultimo warning inviato (ISO string o null) */
  lastWarningAt: string | null;
  /** Timestamp di inizio sessione (ISO string) */
  startedAt: string;
}

export interface PerformanceWarningResult {
  /** Se true, occorre inviare un alert */
  shouldAlert: boolean;
  /** Livello del warning (1 o 2), null se shouldAlert=false */
  warningLevel: 1 | 2 | null;
  /** Drawdown attuale in % */
  currentDrawdownPct: number;
  /** Limite CB in % */
  circuitBreakerLimitPct: number;
  /** Soglia triggerata in % */
  thresholdPct: number | null;
}

// ---------------------------------------------------------------------------
// Core logic — funzione pura, testabile senza DB
// ---------------------------------------------------------------------------

/**
 * Valuta se una sessione deve ricevere un performance warning.
 *
 * @param input - dati della sessione
 * @param now - timestamp corrente (default: Date.now()), iniettabile per test
 */
export function evaluatePerformanceWarning(
  input: PerformanceWarningInput,
  now: number = Date.now(),
): PerformanceWarningResult {
  const {
    currentDrawdownPct,
    circuitBreakerLimitPct,
    lastWarningLevel,
    lastWarningAt,
  } = input;

  const noAlert: PerformanceWarningResult = {
    shouldAlert: false,
    warningLevel: null,
    currentDrawdownPct,
    circuitBreakerLimitPct,
    thresholdPct: null,
  };

  // Nessun drawdown o limite non configurato
  if (circuitBreakerLimitPct <= 0 || currentDrawdownPct <= 0) {
    return noAlert;
  }

  // Calcola soglie assolute
  const level2Threshold = circuitBreakerLimitPct * WARNING_LEVEL_2_THRESHOLD;
  const level1Threshold = circuitBreakerLimitPct * WARNING_LEVEL_1_THRESHOLD;

  // Determina il livello di warning attuale
  let candidateLevel: 1 | 2 | null = null;

  if (currentDrawdownPct >= level2Threshold) {
    candidateLevel = 2;
  } else if (currentDrawdownPct >= level1Threshold) {
    candidateLevel = 1;
  }

  if (candidateLevel === null) {
    return noAlert;
  }

  // Upgrade da level 1 a level 2: bypassa il cooldown
  if (candidateLevel === 2 && lastWarningLevel === 1) {
    return {
      shouldAlert: true,
      warningLevel: 2,
      currentDrawdownPct,
      circuitBreakerLimitPct,
      thresholdPct: level2Threshold,
    };
  }

  // Se lo stesso livello è già stato inviato, controlla cooldown
  if (lastWarningLevel !== null && candidateLevel <= lastWarningLevel) {
    if (lastWarningAt) {
      const lastTime = new Date(lastWarningAt).getTime();
      if (now - lastTime < WARNING_COOLDOWN_MS) {
        return noAlert;
      }
    }
  }

  return {
    shouldAlert: true,
    warningLevel: candidateLevel,
    currentDrawdownPct,
    circuitBreakerLimitPct,
    thresholdPct: candidateLevel === 2 ? level2Threshold : level1Threshold,
  };
}
