export { parseStrategy, validateParsedStrategy } from './dsl-parser';
export type { ParsedStrategy, EntryRule, ExitRule, BankrollTier, CircuitBreakerConfig, StrategyRulesJson } from './dsl-parser';

export { evaluateEntry, evaluateExit, evaluateComposite, evaluateNot } from './evaluator';
export type { MarketSnapshot, ConditionResult, EvaluationResult, ExitEvaluation } from './evaluator';

export { VirtualPortfolio } from './portfolio';
export type { Position, ClosedPosition, PortfolioSnapshot, TierBankroll, OperationLog, CircuitBreakerLimits } from './portfolio';

export { StrategyExecutor } from './executor';
export type { ExecutorConfig, ExecutionLog, StrategyMode, LiveExecutionResult, LiveExecutionService, GetOrderStatusFn } from './executor';

export { SignalType, TierLevel, createSignal, createSkipSignal } from './signals';
export type { Signal, SignalBatch } from './signals';
