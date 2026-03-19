/**
 * Claude AI provider — Anthropic Claude API client.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIRequest, AIResponse, AIUsage } from '@/core/types/ai';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export class ClaudeProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const systemPrompt = this.buildSystemPrompt(request);
    const messages = [
      ...(request.context.conversationHistory ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: request.context.userPrompt },
    ];

    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    const usage: AIUsage = {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    // Estimate cost (Claude Sonnet pricing as of 2025)
    const costEur = (usage.promptTokens * 0.003 + usage.completionTokens * 0.015) / 1000;

    return {
      id: response.id,
      requestId: request.id,
      content: textBlock?.text ?? '',
      provider: 'claude',
      model: CLAUDE_MODEL,
      kbLevel: request.kbLevel,
      usage,
      costEur,
      createdAt: new Date().toISOString(),
    };
  }

  private buildSystemPrompt(request: AIRequest): string {
    return `Sei l'assistente AI di Elio.Market, una piattaforma multi-area di trading e prediction markets.
Area corrente: ${request.context.area ?? 'generale'}
Tipo di richiesta: ${request.type}
Rispondi in italiano, sii preciso e conciso. Quando parli di rischi finanziari, includi sempre un disclaimer.`;
  }
}
