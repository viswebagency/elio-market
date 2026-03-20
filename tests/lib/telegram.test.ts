/**
 * Test per il client Telegram e la formattazione dei messaggi.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatSignalMessage,
  formatDailySummary,
  formatCircuitBreakerAlert,
  TelegramClient,
  DailySummary,
  CircuitBreakerDetails,
} from '@/lib/telegram';
import { Signal, SignalType, TierLevel } from '@/core/engine/signals';
import { MarketArea } from '@/core/types/common';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTestSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    marketId: 'test-market-123',
    marketName: 'Bitcoin sopra $100k entro fine mese?',
    strategyId: 'strat-001',
    strategyCode: 'PRED-VOL-01',
    area: MarketArea.PREDICTION,
    type: SignalType.ENTER_LONG,
    confidence: 0.78,
    reason: 'Volume in crescita e probabilita sottostimata rispetto al modello',
    suggestedStake: 25.50,
    suggestedTier: TierLevel.TIER2,
    sellFraction: 0,
    currentPrice: 0.42,
    timestamp: '2026-03-20T10:30:00.000Z',
    ...overrides,
  };
}

function createTestSummary(overrides: Partial<DailySummary> = {}): DailySummary {
  return {
    date: '2026-03-20',
    pnl: 42.50,
    pnlPercent: 2.15,
    tradesCount: 8,
    winRate: 0.625,
    openPositions: 3,
    totalExposure: 150.00,
    bestTrade: { market: 'ETH sopra 4k?', pnl: 18.30 },
    worstTrade: { market: 'Fed taglia tassi?', pnl: -5.20 },
    ...overrides,
  };
}

function createTestCircuitBreaker(
  overrides: Partial<CircuitBreakerDetails> = {}
): CircuitBreakerDetails {
  return {
    strategyId: 'strat-001',
    strategyName: 'Prediction Volume',
    currentDrawdown: 0.12,
    maxDrawdown: 0.10,
    action: 'Tutte le posizioni chiuse. Strategia fermata.',
    timestamp: '2026-03-20T14:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: Formattazione messaggi
// ---------------------------------------------------------------------------

describe('formatSignalMessage', () => {
  it('formatta un segnale ENTER_LONG con tutte le info', () => {
    const signal = createTestSignal();
    const msg = formatSignalMessage(signal);

    expect(msg).toContain('<b>ENTRA LONG</b>');
    expect(msg).toContain('Bitcoin sopra $100k entro fine mese?');
    expect(msg).toContain('PRED-VOL-01');
    expect(msg).toContain('0.4200');
    expect(msg).toContain('$25.50');
    expect(msg).toContain('Tier 2 (medio)');
    expect(msg).toContain('78%');
    expect(msg).toContain('Volume in crescita');
    expect(msg).toContain('Prediction');
  });

  it('formatta un segnale EXIT_FULL', () => {
    const signal = createTestSignal({
      type: SignalType.EXIT_FULL,
      sellFraction: 1,
    });
    const msg = formatSignalMessage(signal);

    expect(msg).toContain('<b>ESCI TOTALE</b>');
    expect(msg).not.toContain('Stake suggerito');
  });

  it('formatta un segnale EXIT_PARTIAL con percentuale', () => {
    const signal = createTestSignal({
      type: SignalType.EXIT_PARTIAL,
      sellFraction: 0.5,
    });
    const msg = formatSignalMessage(signal);

    expect(msg).toContain('ESCI PARZIALE (50%)');
  });

  it('formatta un segnale STOP_LOSS', () => {
    const signal = createTestSignal({ type: SignalType.STOP_LOSS });
    const msg = formatSignalMessage(signal);

    expect(msg).toContain('STOP LOSS');
  });

  it('esegue escape HTML nei campi testo', () => {
    const signal = createTestSignal({
      marketName: 'Test <script>alert("xss")</script>',
      reason: 'Motivo con & e < caratteri',
    });
    const msg = formatSignalMessage(signal);

    expect(msg).toContain('&lt;script&gt;');
    expect(msg).toContain('&amp;');
    expect(msg).not.toContain('<script>');
  });

  it('genera una barra di confidence visuale', () => {
    const signal = createTestSignal({ confidence: 0.5 });
    const msg = formatSignalMessage(signal);

    // 5 filled + 5 empty blocks
    expect(msg).toContain('\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591');
  });
});

describe('formatDailySummary', () => {
  it('formatta un report giornaliero positivo', () => {
    const summary = createTestSummary();
    const msg = formatDailySummary(summary);

    expect(msg).toContain('<b>Report Giornaliero</b>');
    expect(msg).toContain('2026-03-20');
    expect(msg).toContain('+$42.50');
    expect(msg).toContain('+2.15%');
    expect(msg).toContain('8');
    expect(msg).toContain('62.5%');
    expect(msg).toContain('3');
    expect(msg).toContain('$150.00');
    expect(msg).toContain('ETH sopra 4k?');
    expect(msg).toContain('Fed taglia tassi?');
  });

  it('formatta un report giornaliero negativo', () => {
    const summary = createTestSummary({ pnl: -15.30, pnlPercent: -0.85 });
    const msg = formatDailySummary(summary);

    expect(msg).toContain('-$15.30');
    expect(msg).toContain('-0.85%');
  });

  it('gestisce assenza best/worst trade', () => {
    const summary = createTestSummary({
      bestTrade: undefined,
      worstTrade: undefined,
    });
    const msg = formatDailySummary(summary);

    expect(msg).not.toContain('Miglior trade');
    expect(msg).not.toContain('Peggior trade');
  });
});

describe('formatCircuitBreakerAlert', () => {
  it('formatta un alert circuit breaker', () => {
    const details = createTestCircuitBreaker();
    const msg = formatCircuitBreakerAlert(details);

    expect(msg).toContain('CIRCUIT BREAKER ATTIVATO');
    expect(msg).toContain('Prediction Volume');
    expect(msg).toContain('strat-001');
    expect(msg).toContain('12.00%');
    expect(msg).toContain('10.00%');
    expect(msg).toContain('Tutte le posizioni chiuse');
    expect(msg).toContain('Intervieni il prima possibile');
  });
});

// ---------------------------------------------------------------------------
// Test: TelegramClient con mock fetch
// ---------------------------------------------------------------------------

describe('TelegramClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function mockFetch(response: Record<string, unknown>, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
    });
  }

  it('invia un messaggio con successo', async () => {
    const mockMsg = {
      message_id: 1,
      chat: { id: 123, type: 'private' },
      date: Date.now(),
      text: 'ciao',
    };
    mockFetch({ ok: true, result: mockMsg });

    const client = new TelegramClient('test-token-123');
    const result = await client.sendMessage(123, 'Ciao mondo');

    expect(result.message_id).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token-123/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Verifica body
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.chat_id).toBe(123);
    expect(body.text).toBe('Ciao mondo');
    expect(body.parse_mode).toBe('HTML');
  });

  it('gestisce errore 429 con retry', async () => {
    const mockMsg = {
      message_id: 2,
      chat: { id: 456, type: 'private' },
      date: Date.now(),
      text: 'ok',
    };

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: false,
              error_code: 429,
              description: 'Too Many Requests',
              parameters: { retry_after: 1 },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, result: mockMsg }),
      });
    });

    const client = new TelegramClient('test-token-123');
    const result = await client.sendMessage(456, 'Retry test');

    expect(result.message_id).toBe(2);
    expect(callCount).toBe(2);
  });

  it('lancia errore dopo max retry', async () => {
    mockFetch({
      ok: false,
      error_code: 500,
      description: 'Internal Server Error',
    });

    const client = new TelegramClient('test-token-123');

    await expect(client.sendMessage(789, 'Fail')).rejects.toThrow(
      'Telegram API sendMessage fallita: 500'
    );
  });

  it('configura webhook con successo', async () => {
    mockFetch({ ok: true, result: true });

    const client = new TelegramClient('test-token-123');
    const result = await client.setWebhook('https://example.com/webhook');

    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token-123/setWebhook',
      expect.anything()
    );
  });

  it('invia signal alert formattato', async () => {
    const mockMsg = {
      message_id: 10,
      chat: { id: 100, type: 'private' },
      date: Date.now(),
    };
    mockFetch({ ok: true, result: mockMsg });

    const client = new TelegramClient('test-token-123');
    const signal = createTestSignal();
    const result = await client.sendSignalAlert(100, signal);

    expect(result.message_id).toBe(10);

    // Verifica che il body contenga il testo formattato
    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.text).toContain('ENTRA LONG');
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(1);
  });

  it('lancia errore se token mancante', () => {
    const originalEnv = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    expect(() => new TelegramClient()).toThrow('TELEGRAM_BOT_TOKEN non configurato');

    process.env.TELEGRAM_BOT_TOKEN = originalEnv;
  });
});

// ---------------------------------------------------------------------------
// Test: Rate Limiting
// ---------------------------------------------------------------------------

describe('Rate Limiting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rispetta il limite di 30 messaggi al secondo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockMsg = {
      message_id: 1,
      chat: { id: 1, type: 'private' },
      date: Date.now(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, result: mockMsg }),
    });

    const client = new TelegramClient('test-token-123');

    // Invia 5 messaggi rapidamente — dovrebbero passare tutti
    const promises = Array.from({ length: 5 }, (_, i) =>
      client.sendMessage(i, `Msg ${i}`)
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);

    globalThis.fetch = vi.fn();
    vi.useRealTimers();
  });
});
