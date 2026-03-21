/**
 * Paper Trading State — Interfaces and serialization for persistent state.
 */

import { TierLevel } from '../engine/signals';

// ============================================================================
// Core State Interfaces
// ============================================================================

export type PaperSessionStatus = 'running' | 'paused' | 'stopped';

export interface PaperPosition {
  id: string;
  sessionId: string;
  strategyId: string;
  marketId: string;
  marketName: string;
  tier: TierLevel;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  remainingQuantity: number;
  stake: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  entryReason: string;
  signalConfidence: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
}

export interface PaperTrade {
  id: string;
  sessionId: string;
  positionId: string | null;
  strategyId: string;
  marketId: string;
  marketName: string;
  action: 'open' | 'partial_close' | 'full_close' | 'circuit_breaker';
  tier: TierLevel;
  price: number;
  quantity: number;
  stake: number;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
  reason: string;
  signalConfidence: number;
  executedAt: string;
}

export interface PaperSessionMetrics {
  initialCapital: number;
  currentCapital: number;
  peakCapital: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  totalTicks: number;
  lastTickAt: string | null;
}

export interface PaperSession {
  id: string;
  userId: string;
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  status: PaperSessionStatus;
  pauseReason: string | null;
  metrics: PaperSessionMetrics;
  isCircuitBroken: boolean;
  circuitBrokenReason: string | null;
  circuitBrokenAt: string | null;
  openPositions: PaperPosition[];
  recentTrades: PaperTrade[];
  startedAt: string;
  stoppedAt: string | null;
}

export interface ScanOpportunity {
  marketId: string;
  marketName: string;
  marketCategory: string;
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  score: number;
  motivation: string;
  suggestedStake: number;
  currentPrice: number;
  volume24h: number;
  scannedAt: string;
}

export interface PaperTradingOverview {
  totalCapital: number;
  totalPnl: number;
  totalPnlToday: number;
  activeSessions: number;
  pausedSessions: number;
  totalOpenPositions: number;
  sessions: PaperSession[];
}

// ============================================================================
// DB Serialization
// ============================================================================

export interface PaperSessionDbRow {
  id: string;
  user_id: string;
  strategy_id: string;
  initial_capital: number;
  current_capital: number;
  peak_capital: number;
  status: string;
  pause_reason: string | null;
  portfolio_state: Record<string, unknown>;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_pnl_pct: number;
  max_drawdown_pct: number;
  total_ticks: number;
  last_tick_at: string | null;
  is_circuit_broken: boolean;
  circuit_broken_reason: string | null;
  circuit_broken_at: string | null;
  cooldown_until: string | null;
  auto_rotation_count: number;
  max_auto_rotations: number;
  parent_session_id: string | null;
  started_at: string;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaperPositionDbRow {
  id: string;
  session_id: string;
  strategy_id: string;
  market_id: string;
  market_name: string;
  tier: string;
  entry_price: number;
  current_price: number;
  quantity: number;
  remaining_quantity: number;
  stake: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  entry_reason: string;
  signal_confidence: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

export interface PaperTradeDbRow {
  id: string;
  session_id: string;
  position_id: string | null;
  strategy_id: string;
  market_id: string;
  market_name: string;
  action: string;
  tier: string;
  price: number;
  quantity: number;
  stake: number;
  gross_pnl: number;
  net_pnl: number;
  return_pct: number;
  reason: string;
  signal_confidence: number;
  executed_at: string;
}

export interface PaperScanResultDbRow {
  id: string;
  session_id: string | null;
  strategy_id: string;
  market_id: string;
  market_name: string;
  market_category: string | null;
  score: number;
  motivation: string;
  suggested_stake: number | null;
  current_price: number;
  volume_24h: number;
  scanned_at: string;
}

// ============================================================================
// Serializers: App -> DB
// ============================================================================

export function serializePosition(pos: PaperPosition): Omit<PaperPositionDbRow, 'id'> {
  return {
    session_id: pos.sessionId,
    strategy_id: pos.strategyId,
    market_id: pos.marketId,
    market_name: pos.marketName,
    tier: pos.tier,
    entry_price: pos.entryPrice,
    current_price: pos.currentPrice,
    quantity: pos.quantity,
    remaining_quantity: pos.remainingQuantity,
    stake: pos.stake,
    unrealized_pnl: pos.unrealizedPnl,
    unrealized_pnl_pct: pos.unrealizedPnlPct,
    entry_reason: pos.entryReason,
    signal_confidence: pos.signalConfidence,
    status: pos.status,
    opened_at: pos.openedAt,
    closed_at: pos.closedAt,
  };
}

export function serializeTrade(trade: PaperTrade): Omit<PaperTradeDbRow, 'id'> {
  return {
    session_id: trade.sessionId,
    position_id: trade.positionId,
    strategy_id: trade.strategyId,
    market_id: trade.marketId,
    market_name: trade.marketName,
    action: trade.action,
    tier: trade.tier,
    price: trade.price,
    quantity: trade.quantity,
    stake: trade.stake,
    gross_pnl: trade.grossPnl,
    net_pnl: trade.netPnl,
    return_pct: trade.returnPct,
    reason: trade.reason,
    signal_confidence: trade.signalConfidence,
    executed_at: trade.executedAt,
  };
}

// ============================================================================
// Deserializers: DB -> App
// ============================================================================

export function deserializePosition(row: PaperPositionDbRow): PaperPosition {
  return {
    id: row.id,
    sessionId: row.session_id,
    strategyId: row.strategy_id,
    marketId: row.market_id,
    marketName: row.market_name,
    tier: row.tier as TierLevel,
    entryPrice: row.entry_price,
    currentPrice: row.current_price,
    quantity: row.quantity,
    remainingQuantity: row.remaining_quantity,
    stake: row.stake,
    unrealizedPnl: row.unrealized_pnl,
    unrealizedPnlPct: row.unrealized_pnl_pct,
    entryReason: row.entry_reason,
    signalConfidence: row.signal_confidence,
    status: row.status as 'open' | 'closed',
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export function deserializeTrade(row: PaperTradeDbRow): PaperTrade {
  return {
    id: row.id,
    sessionId: row.session_id,
    positionId: row.position_id,
    strategyId: row.strategy_id,
    marketId: row.market_id,
    marketName: row.market_name,
    action: row.action as PaperTrade['action'],
    tier: row.tier as TierLevel,
    price: row.price,
    quantity: row.quantity,
    stake: row.stake,
    grossPnl: row.gross_pnl,
    netPnl: row.net_pnl,
    returnPct: row.return_pct,
    reason: row.reason,
    signalConfidence: row.signal_confidence,
    executedAt: row.executed_at,
  };
}

export function deserializeScanResult(row: PaperScanResultDbRow, strategyName: string, strategyCode: string): ScanOpportunity {
  return {
    marketId: row.market_id,
    marketName: row.market_name,
    marketCategory: row.market_category ?? 'Uncategorized',
    strategyId: row.strategy_id,
    strategyName,
    strategyCode,
    score: row.score,
    motivation: row.motivation,
    suggestedStake: row.suggested_stake ?? 0,
    currentPrice: row.current_price,
    volume24h: row.volume_24h,
    scannedAt: row.scanned_at,
  };
}
