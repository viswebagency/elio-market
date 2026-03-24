#!/usr/bin/env npx tsx
/**
 * Polymarket Monitor Bot
 *
 * Bot standalone che monitora i mercati Polymarket, identifica opportunita'
 * secondo le 4 categorie della strategia, traccia posizioni aperte e invia
 * alert su Telegram.
 *
 * Usage:
 *   npx tsx scripts/polymarket-monitor.ts
 *   npx tsx scripts/polymarket-monitor.ts --scan-only     # una scansione e basta
 *   npx tsx scripts/polymarket-monitor.ts --interval 180   # scan ogni 3 minuti
 *
 * Comandi Telegram:
 *   /scan      — Scansiona mercati ora
 *   /positions — Mostra posizioni aperte
 *   /add       — Aggiungi posizione (es: /add <marketId> <qty> <entryPrice>)
 *   /remove    — Rimuovi posizione (es: /remove <marketId>)
 *   /watchlist — Mostra watchlist
 *   /watch     — Aggiungi a watchlist (es: /watch <marketId>)
 *   /unwatch   — Rimuovi da watchlist (es: /unwatch <marketId>)
 *   /status    — Stato del bot
 *   /help      — Comandi disponibili
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Leggi .env.local manualmente (no dipendenza da dotenv)
const ENV_PATH = path.join(__dirname, '..', '.env.local');
const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN non configurato in .env.local');
  process.exit(1);
}

const SCAN_INTERVAL_SEC = (() => {
  const idx = process.argv.indexOf('--interval');
  return idx >= 0 && process.argv[idx + 1] ? parseInt(process.argv[idx + 1], 10) : 300;
})();

const SCAN_ONLY = process.argv.includes('--scan-only');

// ---------------------------------------------------------------------------
// State — persisted to JSON
// ---------------------------------------------------------------------------

const STATE_PATH = path.join(__dirname, '..', 'data', 'polymarket-monitor-state.json');

interface Position {
  marketId: string;
  marketName: string;
  category: string;
  entryPrice: number;
  quantity: number;
  enteredAt: string;
  eventType: 'improvviso' | 'graduale';
  /** Scaglioni gia' venduti (per graduali) */
  soldTiers: number[];
}

interface WatchlistItem {
  marketId: string;
  marketName: string;
  addedAt: string;
  lastPrice: number;
  lastVolume24h: number;
}

interface MonitorState {
  chatId: number | null;
  positions: Position[];
  watchlist: WatchlistItem[];
  /** Cache dei volumi medi per rilevare spike */
  volumeBaselines: Record<string, { avg24h: number; lastChecked: string }>;
  /** Ultimo scan timestamp */
  lastScan: string | null;
}

function loadState(): MonitorState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch { /* corrupt file, start fresh */ }
  return { chatId: null, positions: [], watchlist: [], volumeBaselines: {}, lastScan: null };
}

function saveState(state: MonitorState): void {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

let state = loadState();

// ---------------------------------------------------------------------------
// Categorie di ingresso dalla strategia
// ---------------------------------------------------------------------------

interface EntryCategory {
  name: string;
  minPrice: number;
  maxPrice: number;
  minVolume: number;
  budgetPct: number;
}

const CATEGORIES: EntryCategory[] = [
  { name: 'Super Scommessa', minPrice: 0.01, maxPrice: 0.05, minVolume: 50_000, budgetPct: 15 },
  { name: 'Grande Scommessa', minPrice: 0.06, maxPrice: 0.10, minVolume: 100_000, budgetPct: 40 },
  { name: 'Scommessa', minPrice: 0.11, maxPrice: 0.15, minVolume: 100_000, budgetPct: 25 },
  { name: 'Conservativo', minPrice: 0.16, maxPrice: 0.20, minVolume: 100_000, budgetPct: 20 },
];

/** Scaglioni di uscita per eventi graduali (validati su 20 casi storici reali) */
const EXIT_TIERS_GRADUALE = [
  { multiplier: 3, sellPct: 10, label: '3x — Micro-recovery (79% va al 5x)' },
  { multiplier: 5, sellPct: 20, label: '5x — Primo profit reale' },
  { multiplier: 7, sellPct: 10, label: '7x — Tranche intermedia' },
  { multiplier: 10, sellPct: 20, label: '10x — Secondo profit (50% di chi fa 3x arriva qui)' },
  { multiplier: 15, sellPct: 15, label: '15x — Tranche bonus' },
  { multiplier: 20, sellPct: 15, label: '20x — Puro bonus' },
  // Il 10% restante: hold fino risoluzione
];

// ---------------------------------------------------------------------------
// Polymarket API — lightweight fetch
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        await sleep(500 * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) await sleep(500 * Math.pow(2, i));
    }
  }
  throw lastError!;
}

interface RawMarket {
  id: string;
  question: string;
  slug: string;
  category?: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  volumeNum: number;
  volume24hr: number;
  volume1wk: number;
  liquidityNum: number;
  active: boolean;
  closed: boolean;
  endDate: string;
  clobTokenIds: string;
  enableOrderBook?: boolean;
}

interface ParsedMarket {
  id: string;
  question: string;
  slug: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  volume1wk: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  endDate: string;
  daysToExpiry: number;
  clobTokenIds: string[];
}

function parseMarket(raw: RawMarket): ParsedMarket {
  const prices = safeParse<string[]>(raw.outcomePrices, []);
  const yesPrice = prices[0] ? Number(prices[0]) : 0;
  const noPrice = prices[1] ? Number(prices[1]) : 0;
  const daysToExpiry = Math.max(0, Math.floor((new Date(raw.endDate).getTime() - Date.now()) / 86_400_000));

  return {
    id: raw.id,
    question: raw.question,
    slug: raw.slug,
    category: raw.category ?? 'unknown',
    yesPrice,
    noPrice,
    volume: raw.volumeNum ?? parseFloat(raw.volume) ?? 0,
    volume24h: raw.volume24hr ?? 0,
    volume1wk: raw.volume1wk ?? 0,
    liquidity: raw.liquidityNum ?? 0,
    active: raw.active,
    closed: raw.closed,
    endDate: raw.endDate,
    daysToExpiry,
    clobTokenIds: safeParse<string[]>(raw.clobTokenIds, []),
  };
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

async function fetchAllMarkets(): Promise<ParsedMarket[]> {
  const allMarkets: ParsedMarket[] = [];
  let offset = 0;
  const limit = 100;

  // Fetch fino a 500 mercati (5 pagine)
  for (let page = 0; page < 5; page++) {
    const url = `${GAMMA_API}/markets?limit=${limit}&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`;
    const raw = await fetchJson<RawMarket[]>(url);
    if (!raw.length) break;
    allMarkets.push(...raw.map(parseMarket));
    if (raw.length < limit) break;
    offset += limit;
    await sleep(200); // rate limit
  }

  return allMarkets;
}

async function fetchMarketById(id: string): Promise<ParsedMarket> {
  const raw = await fetchJson<RawMarket>(`${GAMMA_API}/markets/${id}`);
  return parseMarket(raw);
}

// ---------------------------------------------------------------------------
// Telegram API — direct HTTP
// ---------------------------------------------------------------------------

async function tgCall<T>(method: string, body?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`${TELEGRAM_API}${TELEGRAM_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { ok: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
    if (data.ok) return data.result ?? null;
    if (res.status === 429) {
      const retryAfter = data.parameters?.retry_after ?? 1;
      await sleep(retryAfter * 1000);
      return tgCall(method, body);
    }
    console.error(`[TG] ${method} failed:`, data.description);
    return null;
  } catch (e) {
    console.error(`[TG] ${method} error:`, e);
    return null;
  }
}

async function sendMsg(text: string, replyMarkup?: unknown): Promise<void> {
  if (!state.chatId) {
    console.log('[TG] Nessun chatId registrato. Invia /start al bot.');
    return;
  }
  await tgCall('sendMessage', {
    chat_id: state.chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// ---------------------------------------------------------------------------
// Scanner — identifica opportunita'
// ---------------------------------------------------------------------------

interface Opportunity {
  market: ParsedMarket;
  category: EntryCategory;
  side: 'YES' | 'NO';
  price: number;
  potentialMultiplier: number;
  volumeSpike: boolean;
  score: number;
}

function classifyOpportunity(m: ParsedMarket): Opportunity | null {
  // Controlla YES nel range
  for (const cat of CATEGORIES) {
    if (m.yesPrice >= cat.minPrice && m.yesPrice <= cat.maxPrice && m.volume >= cat.minVolume) {
      const multiplier = 1 / m.yesPrice;
      const score = computeScore(m, m.yesPrice, multiplier);
      const volumeSpike = isVolumeSpike(m);
      return { market: m, category: cat, side: 'YES', price: m.yesPrice, potentialMultiplier: multiplier, volumeSpike, score };
    }
  }

  // Controlla NO nel range (specchio: $0.80-$0.99 diventa $0.01-$0.20)
  for (const cat of CATEGORIES) {
    if (m.noPrice >= cat.minPrice && m.noPrice <= cat.maxPrice && m.volume >= cat.minVolume) {
      const multiplier = 1 / m.noPrice;
      const score = computeScore(m, m.noPrice, multiplier);
      const volumeSpike = isVolumeSpike(m);
      return { market: m, category: cat, side: 'NO', price: m.noPrice, potentialMultiplier: multiplier, volumeSpike, score };
    }
  }

  return null;
}

function computeScore(m: ParsedMarket, price: number, multiplier: number): number {
  let score = 0;

  // Multiplier potenziale (max 40 punti)
  score += Math.min(40, multiplier * 2);

  // Volume (max 20 punti)
  if (m.volume > 1_000_000) score += 20;
  else if (m.volume > 500_000) score += 15;
  else if (m.volume > 100_000) score += 10;
  else score += 5;

  // Volume 24h relativo (attivita' recente, max 20 punti)
  const vol24hRatio = m.volume24h / Math.max(m.volume, 1);
  score += Math.min(20, vol24hRatio * 200);

  // Liquidita' (max 10 punti)
  if (m.liquidity > 100_000) score += 10;
  else if (m.liquidity > 50_000) score += 7;
  else if (m.liquidity > 10_000) score += 4;

  // Scadenza ragionevole (max 10 punti): troppo lontana penalizza
  if (m.daysToExpiry >= 7 && m.daysToExpiry <= 60) score += 10;
  else if (m.daysToExpiry > 0 && m.daysToExpiry < 7) score += 5;
  else if (m.daysToExpiry > 60 && m.daysToExpiry <= 180) score += 7;

  return Math.round(score);
}

function isVolumeSpike(m: ParsedMarket): boolean {
  const baseline = state.volumeBaselines[m.id];
  if (!baseline) return false;
  // Spike = volume 24h e' piu' di 3x la media
  return m.volume24h > baseline.avg24h * 3;
}

async function runScan(): Promise<Opportunity[]> {
  log('Scansione mercati...');
  const markets = await fetchAllMarkets();
  log(`${markets.length} mercati recuperati`);

  const opportunities: Opportunity[] = [];

  for (const m of markets) {
    if (!m.active || m.closed) continue;

    // Aggiorna baseline volume
    const existing = state.volumeBaselines[m.id];
    if (!existing) {
      state.volumeBaselines[m.id] = { avg24h: m.volume24h, lastChecked: new Date().toISOString() };
    } else {
      // Media mobile esponenziale
      const alpha = 0.3;
      existing.avg24h = alpha * m.volume24h + (1 - alpha) * existing.avg24h;
      existing.lastChecked = new Date().toISOString();
    }

    const opp = classifyOpportunity(m);
    if (opp) opportunities.push(opp);
  }

  // Ordina per score decrescente
  opportunities.sort((a, b) => b.score - a.score);

  state.lastScan = new Date().toISOString();
  saveState(state);

  return opportunities;
}

// ---------------------------------------------------------------------------
// Position tracker — monitora uscite
// ---------------------------------------------------------------------------

async function checkPositions(): Promise<void> {
  if (state.positions.length === 0) return;

  for (const pos of state.positions) {
    try {
      const market = await fetchMarketById(pos.marketId);
      const currentPrice = market.yesPrice; // TODO: gestire side NO
      const multiplier = currentPrice / pos.entryPrice;

      if (pos.eventType === 'graduale') {
        for (const tier of EXIT_TIERS_GRADUALE) {
          if (multiplier >= tier.multiplier && !pos.soldTiers.includes(tier.multiplier)) {
            pos.soldTiers.push(tier.multiplier);
            saveState(state);

            await sendMsg(
              `<b>SCAGLIONE RAGGIUNTO</b>\n\n` +
              `<b>${esc(pos.marketName)}</b>\n` +
              `Entry: $${pos.entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)}\n` +
              `<b>${tier.label}</b>\n` +
              `Moltiplicatore: ${multiplier.toFixed(1)}x\n` +
              `Azione suggerita: vendere ${tier.sellPct}% della posizione\n\n` +
              `Scaglioni venduti: ${pos.soldTiers.map(t => t + 'x').join(', ')}`
            );
          }
        }
      }

      if (pos.eventType === 'improvviso' && multiplier >= 2) {
        await sendMsg(
          `<b>SPIKE RILEVATO — EVENTO IMPROVVISO</b>\n\n` +
          `<b>${esc(pos.marketName)}</b>\n` +
          `Entry: $${pos.entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)}\n` +
          `Moltiplicatore: ${multiplier.toFixed(1)}x\n\n` +
          `<b>REGOLA:</b> NON vendere a scaglioni. Tieni tutto e vendi in blocco quando la volatilita' si calma.`
        );
      }

      // Alert se la quota scende del 40% (stop loss)
      if (multiplier <= 0.6) {
        await sendMsg(
          `<b>STOP LOSS ALERT</b>\n\n` +
          `<b>${esc(pos.marketName)}</b>\n` +
          `Entry: $${pos.entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)}\n` +
          `Drawdown: ${((1 - multiplier) * 100).toFixed(1)}%\n\n` +
          `La tesi e' ancora valida? Se no, ESCI.`
        );
      }

      // Alert quota morta (no movimento in 5+ giorni)
      const daysSinceEntry = (Date.now() - new Date(pos.enteredAt).getTime()) / 86_400_000;
      if (daysSinceEntry >= 5 && multiplier > 0.9 && multiplier < 1.1) {
        await sendMsg(
          `<b>QUOTA MORTA</b>\n\n` +
          `<b>${esc(pos.marketName)}</b>\n` +
          `${daysSinceEntry.toFixed(0)} giorni, nessun movimento significativo.\n` +
          `Entry: $${pos.entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)}\n\n` +
          `REGOLA: Esci dopo 5-7 giorni di inattivita'. Il capitale deve lavorare altrove.`
        );
      }

      await sleep(200); // rate limit tra mercati
    } catch (e) {
      log(`Errore check posizione ${pos.marketId}: ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Watchlist tracker
// ---------------------------------------------------------------------------

async function checkWatchlist(): Promise<void> {
  if (state.watchlist.length === 0) return;

  for (const item of state.watchlist) {
    try {
      const market = await fetchMarketById(item.marketId);

      // Rileva volume spike
      if (item.lastVolume24h > 0 && market.volume24h > item.lastVolume24h * 3) {
        await sendMsg(
          `<b>VOLUME SPIKE — WATCHLIST</b>\n\n` +
          `<b>${esc(market.question)}</b>\n` +
          `Volume 24h: $${fmtNum(market.volume24h)} (era $${fmtNum(item.lastVolume24h)})\n` +
          `YES: $${market.yesPrice.toFixed(4)} | NO: $${market.noPrice.toFixed(4)}\n` +
          `Spike: ${(market.volume24h / item.lastVolume24h).toFixed(1)}x\n\n` +
          `Controlla se e' uscita una news. Potrebbe essere un'opportunita'.`
        );
      }

      // Rileva price movement significativo (>20%)
      if (item.lastPrice > 0) {
        const priceChange = Math.abs(market.yesPrice - item.lastPrice) / item.lastPrice;
        if (priceChange > 0.2) {
          const direction = market.yesPrice > item.lastPrice ? 'SALITA' : 'DISCESA';
          await sendMsg(
            `<b>PRICE MOVEMENT — WATCHLIST</b>\n\n` +
            `<b>${esc(market.question)}</b>\n` +
            `${direction}: $${item.lastPrice.toFixed(4)} -> $${market.yesPrice.toFixed(4)} (${(priceChange * 100).toFixed(1)}%)\n` +
            `Volume 24h: $${fmtNum(market.volume24h)}\n\n` +
            `Verifica la news e valuta se entrare.`
          );
        }
      }

      item.lastPrice = market.yesPrice;
      item.lastVolume24h = market.volume24h;
      await sleep(200);
    } catch (e) {
      log(`Errore check watchlist ${item.marketId}: ${e}`);
    }
  }

  saveState(state);
}

// ---------------------------------------------------------------------------
// Telegram command handlers
// ---------------------------------------------------------------------------

interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    from?: { first_name: string };
  };
}

let lastUpdateId = 0;

async function pollTelegram(): Promise<void> {
  const updates = await tgCall<TgUpdate[]>('getUpdates', {
    offset: lastUpdateId + 1,
    limit: 10,
    timeout: 1, // non-blocking
    allowed_updates: ['message'],
  });

  if (!updates || !Array.isArray(updates)) return;

  for (const update of updates) {
    lastUpdateId = update.update_id;

    const msg = update.message;
    if (!msg?.text) continue;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Registra chatId al primo messaggio
    if (!state.chatId) {
      state.chatId = chatId;
      saveState(state);
      log(`ChatId registrato: ${chatId}`);
    }

    // Ignora messaggi da altri chat
    if (chatId !== state.chatId) continue;

    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase().split('@')[0];
    const args = parts.slice(1);

    switch (cmd) {
      case '/start':
        await handleStart(chatId);
        break;
      case '/scan':
        await handleScan(chatId);
        break;
      case '/positions':
        await handlePositions(chatId);
        break;
      case '/add':
        await handleAdd(chatId, args);
        break;
      case '/remove':
        await handleRemove(chatId, args);
        break;
      case '/watchlist':
        await handleWatchlist(chatId);
        break;
      case '/watch':
        await handleWatch(chatId, args);
        break;
      case '/unwatch':
        await handleUnwatch(chatId, args);
        break;
      case '/status':
        await handleStatus(chatId);
        break;
      case '/help':
        await handleHelp(chatId);
        break;
    }
  }
}

async function handleStart(chatId: number): Promise<void> {
  state.chatId = chatId;
  saveState(state);
  await sendMsg(
    `<b>Polymarket Monitor attivo</b>\n\n` +
    `Scansione ogni ${SCAN_INTERVAL_SEC} secondi.\n` +
    `Categorie: Super Scommessa / Grande Scommessa / Scommessa / Conservativo\n` +
    `Range: $0.01 — $0.20\n\n` +
    `Usa /help per i comandi.`
  );
}

async function handleScan(chatId: number): Promise<void> {
  await sendMsg('Scansione in corso...');

  const opportunities = await runScan();
  const top = opportunities.slice(0, 10);

  if (top.length === 0) {
    await sendMsg('Nessuna opportunita\' trovata nel range $0.01-$0.20.');
    return;
  }

  const lines = [`<b>TOP ${top.length} OPPORTUNITA\'</b>\n`];

  for (const opp of top) {
    const spike = opp.volumeSpike ? ' [VOLUME SPIKE]' : '';
    lines.push(
      `<b>${esc(opp.market.question.substring(0, 60))}</b>`,
      `${opp.side} $${opp.price.toFixed(4)} | ${opp.category.name} | ${opp.potentialMultiplier.toFixed(0)}x potenziale`,
      `Vol: $${fmtNum(opp.market.volume)} | 24h: $${fmtNum(opp.market.volume24h)}${spike}`,
      `Score: ${opp.score} | Scade: ${opp.market.daysToExpiry}gg`,
      `<code>${opp.market.id}</code>`,
      '',
    );
  }

  lines.push(`<i>Totale opportunita': ${opportunities.length}</i>`);
  await sendMsg(lines.join('\n'));
}

async function handlePositions(chatId: number): Promise<void> {
  if (state.positions.length === 0) {
    await sendMsg('Nessuna posizione aperta.');
    return;
  }

  const lines = [`<b>POSIZIONI APERTE (${state.positions.length})</b>\n`];

  for (const pos of state.positions) {
    try {
      const market = await fetchMarketById(pos.marketId);
      const currentPrice = market.yesPrice;
      const multiplier = currentPrice / pos.entryPrice;
      const pnlPct = ((multiplier - 1) * 100).toFixed(1);
      const icon = multiplier >= 1 ? '+' : '';

      lines.push(
        `<b>${esc(pos.marketName.substring(0, 50))}</b>`,
        `Entry: $${pos.entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)} | ${icon}${pnlPct}% (${multiplier.toFixed(2)}x)`,
        `Tipo: ${pos.eventType} | ${pos.category}`,
        pos.eventType === 'graduale' && pos.soldTiers.length > 0
          ? `Scaglioni venduti: ${pos.soldTiers.map(t => t + 'x').join(', ')}`
          : '',
        '',
      );
      await sleep(200);
    } catch {
      lines.push(`<b>${esc(pos.marketName)}</b> — errore fetch\n`);
    }
  }

  await sendMsg(lines.filter(Boolean).join('\n'));
}

async function handleAdd(chatId: number, args: string[]): Promise<void> {
  // /add <marketId> <quantity> <entryPrice> [graduale|improvviso]
  if (args.length < 3) {
    await sendMsg(
      'Uso: /add &lt;marketId&gt; &lt;quantity&gt; &lt;entryPrice&gt; [graduale|improvviso]\n\n' +
      'Esempio: /add abc123 1000 0.08 graduale'
    );
    return;
  }

  const [marketId, qtyStr, priceStr, typeStr] = args;
  const quantity = parseFloat(qtyStr);
  const entryPrice = parseFloat(priceStr);
  const eventType = (typeStr === 'improvviso' ? 'improvviso' : 'graduale') as Position['eventType'];

  if (isNaN(quantity) || isNaN(entryPrice)) {
    await sendMsg('Quantita\' o prezzo non validi.');
    return;
  }

  // Cerca il mercato per ottenere il nome
  try {
    const market = await fetchMarketById(marketId);
    const cat = CATEGORIES.find(c => entryPrice >= c.minPrice && entryPrice <= c.maxPrice);

    state.positions.push({
      marketId,
      marketName: market.question,
      category: cat?.name ?? 'Custom',
      entryPrice,
      quantity,
      enteredAt: new Date().toISOString(),
      eventType,
      soldTiers: [],
    });
    saveState(state);

    await sendMsg(
      `<b>Posizione aggiunta</b>\n\n` +
      `${esc(market.question)}\n` +
      `Entry: $${entryPrice.toFixed(4)} | Qty: ${quantity}\n` +
      `Tipo: ${eventType} | Cat: ${cat?.name ?? 'Custom'}`
    );
  } catch (e) {
    await sendMsg(`Errore: mercato ${marketId} non trovato.`);
  }
}

async function handleRemove(chatId: number, args: string[]): Promise<void> {
  if (args.length < 1) {
    await sendMsg('Uso: /remove &lt;marketId&gt;');
    return;
  }

  const idx = state.positions.findIndex(p => p.marketId === args[0]);
  if (idx < 0) {
    await sendMsg('Posizione non trovata.');
    return;
  }

  const removed = state.positions.splice(idx, 1)[0];
  saveState(state);
  await sendMsg(`Posizione rimossa: ${esc(removed.marketName)}`);
}

async function handleWatchlist(chatId: number): Promise<void> {
  if (state.watchlist.length === 0) {
    await sendMsg('Watchlist vuota. Usa /watch &lt;marketId&gt; per aggiungere.');
    return;
  }

  const lines = [`<b>WATCHLIST (${state.watchlist.length})</b>\n`];
  for (const item of state.watchlist) {
    lines.push(
      `<b>${esc(item.marketName.substring(0, 50))}</b>`,
      `Price: $${item.lastPrice.toFixed(4)} | Vol 24h: $${fmtNum(item.lastVolume24h)}`,
      `<code>${item.marketId}</code>`,
      '',
    );
  }
  await sendMsg(lines.join('\n'));
}

async function handleWatch(chatId: number, args: string[]): Promise<void> {
  if (args.length < 1) {
    await sendMsg('Uso: /watch &lt;marketId&gt;');
    return;
  }

  const marketId = args[0];
  if (state.watchlist.some(w => w.marketId === marketId)) {
    await sendMsg('Mercato gia\' nella watchlist.');
    return;
  }

  try {
    const market = await fetchMarketById(marketId);
    state.watchlist.push({
      marketId,
      marketName: market.question,
      addedAt: new Date().toISOString(),
      lastPrice: market.yesPrice,
      lastVolume24h: market.volume24h,
    });
    saveState(state);
    await sendMsg(`Aggiunto alla watchlist: ${esc(market.question)}`);
  } catch {
    await sendMsg('Mercato non trovato.');
  }
}

async function handleUnwatch(chatId: number, args: string[]): Promise<void> {
  if (args.length < 1) {
    await sendMsg('Uso: /unwatch &lt;marketId&gt;');
    return;
  }

  const idx = state.watchlist.findIndex(w => w.marketId === args[0]);
  if (idx < 0) {
    await sendMsg('Mercato non nella watchlist.');
    return;
  }

  const removed = state.watchlist.splice(idx, 1)[0];
  saveState(state);
  await sendMsg(`Rimosso dalla watchlist: ${esc(removed.marketName)}`);
}

async function handleStatus(chatId: number): Promise<void> {
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);

  await sendMsg(
    `<b>STATUS BOT</b>\n\n` +
    `Uptime: ${h}h ${m}m\n` +
    `Intervallo scan: ${SCAN_INTERVAL_SEC}s\n` +
    `Ultimo scan: ${state.lastScan ?? 'mai'}\n` +
    `Posizioni aperte: ${state.positions.length}\n` +
    `Watchlist: ${state.watchlist.length}\n` +
    `Mercati in cache volume: ${Object.keys(state.volumeBaselines).length}`
  );
}

async function handleHelp(chatId: number): Promise<void> {
  await sendMsg(
    `<b>COMANDI</b>\n\n` +
    `/scan — Scansiona mercati per opportunita'\n` +
    `/positions — Posizioni aperte con P&L live\n` +
    `/add — Aggiungi posizione (marketId qty price [tipo])\n` +
    `/remove — Rimuovi posizione (marketId)\n` +
    `/watchlist — Mostra watchlist\n` +
    `/watch — Aggiungi a watchlist (marketId)\n` +
    `/unwatch — Rimuovi da watchlist (marketId)\n` +
    `/status — Stato del bot\n\n` +
    `<b>SCAGLIONI USCITA (graduali):</b>\n` +
    `10% @ 3x | 20% @ 5x | 10% @ 7x | 20% @ 10x | 15% @ 15x | 15% @ 20x | 10% hold\n\n` +
    `<b>EVENTI IMPROVVISI:</b>\n` +
    `Nessuno scaglione. Tieni tutto, vendi in blocco allo stabilizzarsi.`
  );
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function mainLoop(): Promise<void> {
  log('Polymarket Monitor avviato');
  log(`Intervallo scan: ${SCAN_INTERVAL_SEC}s`);
  log(`ChatId: ${state.chatId ?? 'non registrato — invia /start al bot'}`);

  // Cancella webhook per usare polling
  await tgCall('deleteWebhook', {});

  // Scan iniziale
  const opportunities = await runScan();
  if (state.chatId && opportunities.length > 0) {
    const top5 = opportunities.slice(0, 5);
    const lines = [`<b>SCAN INIZIALE — TOP 5</b>\n`];
    for (const opp of top5) {
      lines.push(
        `${opp.side} $${opp.price.toFixed(4)} | ${opp.category.name} | ${opp.potentialMultiplier.toFixed(0)}x`,
        `<b>${esc(opp.market.question.substring(0, 55))}</b>`,
        `Score: ${opp.score}`,
        '',
      );
    }
    await sendMsg(lines.join('\n'));
  }

  if (SCAN_ONLY) {
    log('Scan completato (--scan-only). Uscita.');
    return;
  }

  // Loop continuo
  let lastScanTime = Date.now();

  while (true) {
    // Poll comandi Telegram (non-blocking)
    await pollTelegram();

    const elapsed = (Date.now() - lastScanTime) / 1000;
    if (elapsed >= SCAN_INTERVAL_SEC) {
      lastScanTime = Date.now();

      // Scan mercati
      const opps = await runScan();

      // Alert per nuove opportunita' con volume spike
      const spikes = opps.filter(o => o.volumeSpike);
      if (spikes.length > 0) {
        const lines = [`<b>VOLUME SPIKE RILEVATO</b>\n`];
        for (const s of spikes.slice(0, 5)) {
          lines.push(
            `<b>${esc(s.market.question.substring(0, 55))}</b>`,
            `${s.side} $${s.price.toFixed(4)} | Vol 24h: $${fmtNum(s.market.volume24h)}`,
            `Score: ${s.score} | ${s.category.name}`,
            '',
          );
        }
        await sendMsg(lines.join('\n'));
      }

      // Check posizioni
      await checkPositions();

      // Check watchlist
      await checkWatchlist();
    }

    await sleep(3000); // Poll telegram ogni 3 secondi
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${msg}`);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

mainLoop().catch(e => {
  console.error('Errore fatale:', e);
  process.exit(1);
});
