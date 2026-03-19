/**
 * AI types — requests, responses, knowledge base levels, and budget management.
 */

import { MarketArea } from './common';

/** Knowledge base access level */
export enum KBLevel {
  /** L1: Cached responses, pre-computed analysis */
  L1_CACHE = 'L1',
  /** L2: RAG over curated knowledge base */
  L2_RAG = 'L2',
  /** L3: Full AI reasoning with context */
  L3_FULL = 'L3',
}

/** AI request */
export interface AIRequest {
  id: string;
  userId: string;
  /** Type of AI operation */
  type: AIRequestType;
  /** Context for the AI */
  context: AIContext;
  /** Desired KB level */
  kbLevel: KBLevel;
  /** Maximum tokens to spend */
  maxTokens?: number;
  /** Priority */
  priority: AIPriority;
  /** Preferred provider */
  preferredProvider?: AIProvider;
  createdAt: string;
}

export type AIRequestType =
  | 'strategy_analysis'     // Analyze a strategy's performance
  | 'market_analysis'       // Analyze market conditions
  | 'trade_suggestion'      // Suggest trade ideas
  | 'risk_assessment'       // Assess risk of a position/portfolio
  | 'journal_analysis'      // Analyze trading journal patterns
  | 'conflict_resolution'   // Help resolve cross-area conflicts
  | 'backtest_interpretation' // Interpret backtest results
  | 'general_question'      // General trading question
  ;

/** Context provided to the AI */
export interface AIContext {
  /** Current area being analyzed */
  area?: MarketArea;
  /** Strategy data */
  strategyData?: unknown;
  /** Market data */
  marketData?: unknown;
  /** Portfolio state */
  portfolioState?: unknown;
  /** User's question/prompt */
  userPrompt: string;
  /** Conversation history */
  conversationHistory?: AIMessage[];
  /** Additional context */
  extra?: Record<string, unknown>;
}

/** AI response */
export interface AIResponse {
  id: string;
  requestId: string;
  /** The AI's response */
  content: string;
  /** Structured data in the response (if any) */
  structuredData?: Record<string, unknown>;
  /** Provider used */
  provider: AIProvider;
  /** Model used */
  model: string;
  /** KB level actually used */
  kbLevel: KBLevel;
  /** Token usage */
  usage: AIUsage;
  /** Cost in EUR */
  costEur: number;
  /** Response quality score (self-assessed) */
  confidenceScore?: number;
  createdAt: string;
}

/** Chat message */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export type AIProvider = 'claude' | 'openai';
export type AIPriority = 'low' | 'normal' | 'high' | 'critical';

/** Token usage tracking */
export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** AI budget state */
export interface AIBudgetState {
  userId: string;
  /** Monthly budget in EUR */
  monthlyBudgetEur: number;
  /** Spent this month */
  spentThisMonthEur: number;
  /** Remaining */
  remainingEur: number;
  /** Usage by provider */
  usageByProvider: Record<AIProvider, {
    requests: number;
    tokens: number;
    costEur: number;
  }>;
  /** Current period */
  periodStart: string;
  periodEnd: string;
}
