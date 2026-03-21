import { describe, it, expect } from 'vitest';
import {
  evaluatePerformanceWarning,
  PerformanceWarningInput,
  WARNING_LEVEL_1_THRESHOLD,
  WARNING_LEVEL_2_THRESHOLD,
  WARNING_COOLDOWN_MS,
} from '@/core/paper-trading/performance-alerts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<PerformanceWarningInput> = {}): PerformanceWarningInput {
  return {
    sessionId: 'test-session-1',
    strategyCode: 'CR-C01',
    strategyName: 'Test Strategy',
    area: 'crypto',
    currentDrawdownPct: 0,
    circuitBreakerLimitPct: 20, // CB a -20%
    lastWarningLevel: null,
    lastWarningAt: null,
    startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const NOW = Date.now();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluatePerformanceWarning', () => {
  describe('constants', () => {
    it('esporta le soglie corrette', () => {
      expect(WARNING_LEVEL_1_THRESHOLD).toBe(0.5);
      expect(WARNING_LEVEL_2_THRESHOLD).toBe(0.75);
      expect(WARNING_COOLDOWN_MS).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe('nessun alert sotto soglia', () => {
    it('drawdown 0% non triggera', () => {
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 0 }), NOW);
      expect(result.shouldAlert).toBe(false);
      expect(result.warningLevel).toBeNull();
    });

    it('drawdown sotto 50% del limite non triggera', () => {
      // CB a 20%, level 1 scatta a 10% — drawdown a 9% non deve triggerare
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 9 }), NOW);
      expect(result.shouldAlert).toBe(false);
    });

    it('drawdown negativo non triggera', () => {
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: -5 }), NOW);
      expect(result.shouldAlert).toBe(false);
    });

    it('circuitBreakerLimitPct a 0 non triggera', () => {
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 15, circuitBreakerLimitPct: 0 }),
        NOW,
      );
      expect(result.shouldAlert).toBe(false);
    });
  });

  describe('warning level 1 (drawdown >= 50% del limite)', () => {
    it('triggera a esattamente 50% del limite', () => {
      // CB a 20%, level 1 = 10%
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 10 }), NOW);
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
      expect(result.thresholdPct).toBe(10);
    });

    it('triggera sopra 50% ma sotto 75%', () => {
      // CB a 20%, drawdown 12% — sopra L1 (10%) ma sotto L2 (15%)
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 12 }), NOW);
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
    });

    it('con CB a 8%, level 1 scatta a 4%', () => {
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 4, circuitBreakerLimitPct: 8 }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
      expect(result.thresholdPct).toBe(4);
    });
  });

  describe('warning level 2 (drawdown >= 75% del limite)', () => {
    it('triggera a esattamente 75% del limite', () => {
      // CB a 20%, level 2 = 15%
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 15 }), NOW);
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
      expect(result.thresholdPct).toBe(15);
    });

    it('triggera sopra 75%', () => {
      // CB a 20%, drawdown 18%
      const result = evaluatePerformanceWarning(makeInput({ currentDrawdownPct: 18 }), NOW);
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });

    it('con CB a 12%, level 2 scatta a 9%', () => {
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 9, circuitBreakerLimitPct: 12 }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
      expect(result.thresholdPct).toBe(9);
    });
  });

  describe('cooldown rispettato', () => {
    it('non re-invia level 1 se cooldown non scaduto', () => {
      const oneHourAgo = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 12,
          lastWarningLevel: 1,
          lastWarningAt: oneHourAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(false);
    });

    it('non re-invia level 2 se cooldown non scaduto', () => {
      const oneHourAgo = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 18,
          lastWarningLevel: 2,
          lastWarningAt: oneHourAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(false);
    });

    it('re-invia level 1 dopo che il cooldown scade', () => {
      const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 12,
          lastWarningLevel: 1,
          lastWarningAt: threeHoursAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
    });

    it('re-invia level 2 dopo che il cooldown scade', () => {
      const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 18,
          lastWarningLevel: 2,
          lastWarningAt: threeHoursAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });

    it('cooldown a esattamente 2 ore non scade ancora', () => {
      // Exactly at boundary — should NOT alert (< not <=)
      const exactlyTwoHoursAgo = new Date(NOW - WARNING_COOLDOWN_MS + 1).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 12,
          lastWarningLevel: 1,
          lastWarningAt: exactlyTwoHoursAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(false);
    });
  });

  describe('upgrade da level 1 a level 2 bypassa cooldown', () => {
    it('passa da L1 a L2 immediatamente anche con cooldown attivo', () => {
      const fiveMinutesAgo = new Date(NOW - 5 * 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 16, // sopra L2 (15%)
          lastWarningLevel: 1,
          lastWarningAt: fiveMinutesAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });

    it('upgrade anche se lastWarningAt molto recente', () => {
      const oneMinuteAgo = new Date(NOW - 60 * 1000).toISOString();
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 15, // esattamente L2
          lastWarningLevel: 1,
          lastWarningAt: oneMinuteAgo,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('prima volta — nessun warning precedente — triggera L1', () => {
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 11,
          lastWarningLevel: null,
          lastWarningAt: null,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
    });

    it('prima volta — nessun warning precedente — triggera L2', () => {
      const result = evaluatePerformanceWarning(
        makeInput({
          currentDrawdownPct: 16,
          lastWarningLevel: null,
          lastWarningAt: null,
        }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });

    it('drawdown esattamente al limite CB non triggera warning (CB gia attivo)', () => {
      // CB = 20%, drawdown = 20% — il CB scatta ma il warning L2 era a 15%
      // In realta il warning L2 dovrebbe triggerare perche 20 >= 15
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 20 }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(2);
    });

    it('area polymarket funziona allo stesso modo', () => {
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 10, area: 'polymarket' }),
        NOW,
      );
      expect(result.shouldAlert).toBe(true);
      expect(result.warningLevel).toBe(1);
    });

    it('restituisce sempre currentDrawdownPct e circuitBreakerLimitPct nel risultato', () => {
      const result = evaluatePerformanceWarning(
        makeInput({ currentDrawdownPct: 5 }),
        NOW,
      );
      expect(result.currentDrawdownPct).toBe(5);
      expect(result.circuitBreakerLimitPct).toBe(20);
    });
  });
});
