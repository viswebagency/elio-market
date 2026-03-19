/**
 * AI Service orchestrator — routes AI requests to the appropriate provider
 * and manages KB levels, caching, and budget.
 */

import { AIRequest, AIResponse, KBLevel, AIProvider } from '@/core/types/ai';

export class AIService {
  /** Process an AI request through the appropriate pipeline */
  async processRequest(request: AIRequest): Promise<AIResponse> {
    // Step 1: Check budget
    const hasBudget = await this.checkBudget(request.userId);
    if (!hasBudget) {
      throw new Error('AI budget exhausted for this billing period.');
    }

    // Step 2: Try cache first (L1)
    if (request.kbLevel === KBLevel.L1_CACHE) {
      const cached = await this.getCachedResponse(request);
      if (cached) return cached;
    }

    // Step 3: Route to provider
    const provider = request.preferredProvider ?? this.selectProvider(request);
    const response = await this.callProvider(provider, request);

    // Step 4: Track usage
    await this.trackUsage(request.userId, response);

    return response;
  }

  private async checkBudget(_userId: string): Promise<boolean> {
    // TODO: check against AIBudgetState in DB
    return true;
  }

  private async getCachedResponse(_request: AIRequest): Promise<AIResponse | null> {
    // TODO: implement cache lookup
    return null;
  }

  private selectProvider(request: AIRequest): AIProvider {
    // Default routing: Claude for analysis, OpenAI for quick tasks
    if (request.kbLevel === KBLevel.L3_FULL) return 'claude';
    if (request.type === 'general_question') return 'openai';
    return 'claude';
  }

  private async callProvider(_provider: AIProvider, _request: AIRequest): Promise<AIResponse> {
    // TODO: route to Claude or OpenAI provider
    throw new Error('AI providers not yet configured');
  }

  private async trackUsage(_userId: string, _response: AIResponse): Promise<void> {
    // TODO: update budget tracking in DB
  }
}

export const aiService = new AIService();
