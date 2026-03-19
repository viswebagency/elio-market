/**
 * Conflict types — when strategies across areas generate contradictory signals.
 * The conflict resolution engine detects and resolves these.
 */

import { MarketArea, Direction } from './common';

/** A detected conflict between signals */
export interface Conflict {
  id: string;
  /** Timestamp of detection */
  detectedAt: string;
  /** The conflicting signals */
  signals: ConflictingSignal[];
  /** Severity of the conflict */
  severity: ConflictSeverity;
  /** Type of conflict */
  type: ConflictType;
  /** How it was resolved (if resolved) */
  resolution?: ConflictResolution;
  /** Whether it's still active */
  isActive: boolean;
}

/** A signal involved in a conflict */
export interface ConflictingSignal {
  strategyId: string;
  strategyName: string;
  area: MarketArea;
  symbol: string;
  direction: Direction;
  confidence: number;
  /** The underlying asset/event these signals relate to */
  correlationKey: string;
}

export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ConflictType =
  | 'directional'    // Same asset, opposite directions
  | 'exposure'       // Too much exposure to correlated assets
  | 'timing'         // Conflicting time horizons
  | 'correlation'    // Hidden correlation between seemingly different markets
  ;

/** How a conflict was resolved */
export interface ConflictResolution {
  method: ResolutionMethod;
  /** Which signal(s) were kept */
  keptSignalIds: string[];
  /** Which signal(s) were dropped */
  droppedSignalIds: string[];
  /** Explanation of the resolution */
  reasoning: string;
  /** Whether AI was involved */
  aiAssisted: boolean;
  resolvedAt: string;
  /** User override (if manually resolved) */
  userOverride: boolean;
}

export type ResolutionMethod =
  | 'highest_confidence'  // Keep the signal with highest confidence
  | 'priority_based'      // Based on strategy priority
  | 'risk_reduction'      // Minimize overall risk
  | 'ai_recommended'      // AI decides
  | 'user_manual'         // User decides
  | 'cancel_both'         // Cancel all conflicting signals
  ;
