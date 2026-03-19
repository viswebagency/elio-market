/**
 * OpenAI provider — GPT API client.
 */

import OpenAI from 'openai';
import { AIRequest, AIResponse, AIUsage } from '@/core/types/ai';

const OPENAI_MODEL = 'gpt-4o';

export class OpenAIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildSystemPrompt(request) },
      ...(request.context.conversationHistory ?? []).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: request.context.userPrompt },
    ];

    const response = await this.client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      max_tokens: request.maxTokens ?? 4096,
    });

    const content = response.choices[0]?.message?.content ?? '';
    const usage: AIUsage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    // Estimate cost (GPT-4o pricing)
    const costEur = (usage.promptTokens * 0.005 + usage.completionTokens * 0.015) / 1000;

    return {
      id: response.id,
      requestId: request.id,
      content,
      provider: 'openai',
      model: OPENAI_MODEL,
      kbLevel: request.kbLevel,
      usage,
      costEur,
      createdAt: new Date().toISOString(),
    };
  }

  private buildSystemPrompt(request: AIRequest): string {
    return `You are the AI assistant of Elio.Market, a multi-area trading platform.
Current area: ${request.context.area ?? 'general'}
Request type: ${request.type}
Respond in Italian. Be precise and concise. Always include financial risk disclaimers.`;
  }
}
