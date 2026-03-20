import { MarketArea } from '../types/common';

export enum SignalType {
  ENTER_LONG = 'enter_long',
  EXIT_PARTIAL = 'exit_partial',
  EXIT_FULL = 'exit_full',
  STOP_LOSS = 'stop_loss',
  CIRCUIT_BREAKER = 'circuit_breaker',
  HOLD = 'hold',
  SKIP = 'skip',
}

export enum TierLevel {
  TIER1 = 'tier1',
  TIER2 = 'tier2',
  TIER3 = 'tier3',
}

export interface Signal {
  marketId: string;
  marketName: string;
  strategyId: string;
  strategyCode: string;
  area: MarketArea;
  type: SignalType;
  confidence: number;
  reason: string;
  suggestedStake: number;
  suggestedTier: TierLevel;
  sellFraction: number;
  currentPrice: number;
  timestamp: string;
}

export interface SignalBatch {
  strategyId: string;
  signals: Signal[];
  generatedAt: string;
  marketsEvaluated: number;
  marketsMatched: number;
}

export function createSignal(params: {
  marketId: string;
  marketName: string;
  strategyId: string;
  strategyCode: string;
  area: MarketArea;
  type: SignalType;
  confidence: number;
  reason: string;
  suggestedStake?: number;
  suggestedTier?: TierLevel;
  sellFraction?: number;
  currentPrice: number;
}): Signal {
  return {
    marketId: params.marketId,
    marketName: params.marketName,
    strategyId: params.strategyId,
    strategyCode: params.strategyCode,
    area: params.area,
    type: params.type,
    confidence: params.confidence,
    reason: params.reason,
    suggestedStake: params.suggestedStake ?? 0,
    suggestedTier: params.suggestedTier ?? TierLevel.TIER3,
    sellFraction: params.sellFraction ?? 0,
    currentPrice: params.currentPrice,
    timestamp: new Date().toISOString(),
  };
}

export function createSkipSignal(
  marketId: string,
  marketName: string,
  strategyId: string,
  strategyCode: string,
  area: MarketArea,
  reason: string,
  currentPrice: number,
): Signal {
  return createSignal({
    marketId,
    marketName,
    strategyId,
    strategyCode,
    area,
    type: SignalType.SKIP,
    confidence: 0,
    reason,
    currentPrice,
  });
}
