/**
 * AI budget manager — tracks and enforces AI spending limits per user.
 */

import { AIBudgetState, AIProvider, AIResponse } from '@/core/types/ai';

export class AIBudgetManager {
  /** Get current budget state for a user */
  async getBudget(userId: string): Promise<AIBudgetState> {
    // TODO: fetch from Supabase
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    return {
      userId,
      monthlyBudgetEur: 10,
      spentThisMonthEur: 0,
      remainingEur: 10,
      usageByProvider: {
        claude: { requests: 0, tokens: 0, costEur: 0 },
        openai: { requests: 0, tokens: 0, costEur: 0 },
      },
      periodStart,
      periodEnd,
    };
  }

  /** Check if a user has remaining budget */
  async hasBudget(userId: string): Promise<boolean> {
    const budget = await this.getBudget(userId);
    return budget.remainingEur > 0;
  }

  /** Record AI usage */
  async recordUsage(userId: string, response: AIResponse): Promise<void> {
    // TODO: update budget in Supabase
    console.log(`[AIBudget] User ${userId}: ${response.costEur.toFixed(4)} EUR (${response.provider})`);
  }
}

export const aiBudgetManager = new AIBudgetManager();
