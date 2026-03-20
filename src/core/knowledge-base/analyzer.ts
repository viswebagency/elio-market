/**
 * Knowledge Base — AI Analysis Generator
 *
 * Generates AI analyses for markets using Claude API.
 * Falls back to deterministic analysis when ANTHROPIC_API_KEY is not set.
 */

import Anthropic from '@anthropic-ai/sdk';
import { MarketArea } from '../types/common';
import { createUntypedAdminClient } from '@/lib/db/supabase/admin';

const CLAUDE_MODEL = 'claude-sonnet-4-6-20250627';
const DAILY_BUDGET_EUR = parseFloat(process.env.AI_DAILY_BUDGET_EUR ?? '5');
const EUR_PER_USD = 0.92; // approximate

// ============================================================================
// Types
// ============================================================================

export enum AnalysisType {
  MARKET_OVERVIEW = 'market_overview',
  ENTRY_ANALYSIS = 'entry_analysis',
  EXIT_ANALYSIS = 'exit_analysis',
  RISK_ASSESSMENT = 'risk_assessment',
  CATALYST_DETECTION = 'catalyst_detection',
}

export interface AnalysisResult {
  content: string;
  confidence: number;
  dataPointsUsed: DataPoint[];
  structuredData: AnalysisStructuredData;
  tokensUsed: number;
  estimatedCostUsd: number;
  generatedAt: string;
}

export interface DataPoint {
  label: string;
  value: string;
  source: string;
}

export interface AnalysisStructuredData {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  keyFactors: string[];
  risks: string[];
  opportunities: string[];
  priceTarget?: { low: number; mid: number; high: number };
  timeHorizon?: string;
  hasCatalyst?: boolean;
  catalystDescription?: string;
}

export interface MarketContext {
  marketId: string;
  marketName: string;
  area: MarketArea;
  currentPrice: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  endDate: string;
  category: string;
  description: string;
  outcomes: string[];
  outcomePrices: number[];
}

// ============================================================================
// Claude AI client (lazy singleton)
// ============================================================================

let claudeClient: Anthropic | null = null;

function getClaudeClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!claudeClient) {
    claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return claudeClient;
}

// ============================================================================
// Analysis Generator
// ============================================================================

export async function generateAnalysis(
  context: MarketContext,
  type: AnalysisType,
): Promise<AnalysisResult> {
  const client = getClaudeClient();

  // Use Claude AI when available AND budget not exceeded
  if (client) {
    const budgetOk = await checkDailyBudget();
    if (!budgetOk) {
      console.warn('[KB Analyzer] Daily AI budget exceeded, using deterministic fallback');
    } else {
      try {
        return await generateWithClaude(client, context, type);
      } catch (error) {
        console.error('[KB Analyzer] Claude error, falling back to deterministic:', error);
      }
    }
  }

  // Fallback: deterministic analysis
  return generateDeterministic(context, type);
}

/**
 * Check if today's AI spending is within budget.
 * Queries kb_analyses for today's total cost.
 */
async function checkDailyBudget(): Promise<boolean> {
  try {
    const db = createUntypedAdminClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data } = await db
      .from('kb_analyses')
      .select('estimated_cost_usd')
      .gte('created_at', todayStart.toISOString());

    const todayCostUsd = (data ?? []).reduce(
      (sum: number, row: { estimated_cost_usd: number }) => sum + (row.estimated_cost_usd ?? 0),
      0,
    );
    const todayCostEur = todayCostUsd * EUR_PER_USD;

    return todayCostEur < DAILY_BUDGET_EUR;
  } catch {
    // If budget check fails, allow the call (fail open)
    return true;
  }
}

// ============================================================================
// Claude AI Analysis
// ============================================================================

async function generateWithClaude(
  client: Anthropic,
  ctx: MarketContext,
  type: AnalysisType,
): Promise<AnalysisResult> {
  const systemPrompt = buildSystemPrompt(type);
  const userPrompt = buildUserPrompt(ctx, type);

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find(c => c.type === 'text');
  const rawContent = textBlock?.text ?? '';

  // Parse structured data from Claude response
  const structured = parseStructuredResponse(rawContent, ctx, type);

  // Cost: Sonnet 4.6 pricing ($3/M input, $15/M output)
  const costUsd = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;

  return {
    content: structured.content,
    confidence: structured.confidence,
    dataPointsUsed: buildDataPoints(ctx),
    structuredData: structured.structuredData,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    estimatedCostUsd: costUsd,
    generatedAt: new Date().toISOString(),
  };
}

function buildSystemPrompt(type: AnalysisType): string {
  const base = `Sei l'analista AI di Elio.Market, piattaforma di trading su prediction markets (Polymarket).
Rispondi SEMPRE in italiano. Sii preciso, conciso, e quantitativo.
Formatta in markdown. Includi disclaimer sui rischi finanziari.`;

  switch (type) {
    case AnalysisType.MARKET_OVERVIEW:
      return `${base}
Genera una panoramica completa del mercato. Includi: sentiment, fattori chiave, rischi, opportunita.
Alla fine, rispondi con un blocco JSON (tra \`\`\`json e \`\`\`) con questa struttura:
{"sentiment":"bullish|bearish|neutral","keyFactors":["..."],"risks":["..."],"opportunities":["..."],"confidence":0-100}`;

    case AnalysisType.ENTRY_ANALYSIS:
      return `${base}
Analizza se vale la pena entrare in questo mercato. Specifica direzione (YES/NO), edge stimato, rischi.
Alla fine, rispondi con un blocco JSON:
{"sentiment":"bullish|bearish|neutral","keyFactors":["..."],"risks":["..."],"opportunities":["..."],"confidence":0-100}`;

    case AnalysisType.EXIT_ANALYSIS:
      return `${base}
Analizza se conviene uscire dalla posizione o restare. Motiva la raccomandazione.
Alla fine, rispondi con un blocco JSON:
{"sentiment":"bullish|bearish|neutral","keyFactors":["..."],"risks":["..."],"opportunities":["..."],"confidence":0-100}`;

    case AnalysisType.RISK_ASSESSMENT:
      return `${base}
Valuta i rischi di questo mercato: liquidita, tempo, volatilita, rischio complessivo. Usa livelli ALTO/MEDIO/BASSO.
Alla fine, rispondi con un blocco JSON:
{"sentiment":"bullish|bearish|neutral","keyFactors":["..."],"risks":["..."],"opportunities":["..."],"confidence":0-100}`;

    case AnalysisType.CATALYST_DETECTION:
      return `${base}
Analizza se questo mercato ha un CATALIZZATORE noto — un evento specifico (elezione, report, scadenza legale, decisione giudiziaria, votazione, lancio prodotto) che forzera' la risoluzione del mercato.
NON considerare catalizzatori vaghi come "il tempo passera'" o "il mercato si risolvera'".
Rispondi SOLO con un blocco JSON:
{"hasCatalyst":true|false,"catalystDescription":"descrizione evento specifico o null","confidence":0-100,"sentiment":"bullish|bearish|neutral","keyFactors":["..."],"risks":["..."],"opportunities":["..."]}`;
  }
}

function buildUserPrompt(ctx: MarketContext, _type: AnalysisType): string {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));

  return `Mercato: ${ctx.marketName}
Categoria: ${ctx.category}
Descrizione: ${ctx.description}
Esiti: ${ctx.outcomes.join(' vs ')}
Prezzo YES: ${(yesPrice * 100).toFixed(1)}%
Volume 24h: $${ctx.volume24h.toLocaleString()}
Volume totale: $${ctx.totalVolume.toLocaleString()}
Liquidita: $${ctx.liquidity.toLocaleString()}
Scadenza: ${ctx.endDate} (${daysToExpiry} giorni)`;
}

function parseStructuredResponse(
  raw: string,
  ctx: MarketContext,
  type: AnalysisType,
): { content: string; structuredData: AnalysisStructuredData; confidence: number } {
  // Extract JSON block from response
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);

  let structuredData: AnalysisStructuredData = {
    sentiment: 'neutral',
    keyFactors: [],
    risks: [],
    opportunities: [],
  };
  let confidence = 50;

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      structuredData = {
        sentiment: parsed.sentiment ?? 'neutral',
        keyFactors: parsed.keyFactors ?? [],
        risks: parsed.risks ?? [],
        opportunities: parsed.opportunities ?? [],
        hasCatalyst: parsed.hasCatalyst,
        catalystDescription: parsed.catalystDescription,
      };
      confidence = parsed.confidence ?? 50;
    } catch {
      // JSON parse failed, use defaults
    }
  }

  // Clean content: remove JSON block for display
  const content = raw.replace(/```json[\s\S]*?```/, '').trim();

  return { content, structuredData, confidence };
}

function buildDataPoints(ctx: MarketContext): DataPoint[] {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));

  return [
    { label: 'Prezzo YES', value: `${(yesPrice * 100).toFixed(1)}%`, source: 'Polymarket' },
    { label: 'Volume totale', value: `$${ctx.totalVolume.toLocaleString()}`, source: 'Polymarket' },
    { label: 'Volume 24h', value: `$${ctx.volume24h.toLocaleString()}`, source: 'Polymarket' },
    { label: 'Liquidita', value: `$${ctx.liquidity.toLocaleString()}`, source: 'Polymarket' },
    { label: 'Giorni a scadenza', value: String(daysToExpiry), source: 'calcolato' },
  ];
}

// ============================================================================
// Deterministic Fallback (no API key)
// ============================================================================

function generateDeterministic(ctx: MarketContext, type: AnalysisType): AnalysisResult {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const sentiment = yesPrice > 0.65 ? 'bullish' : yesPrice < 0.35 ? 'bearish' : 'neutral';
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));

  if (type === AnalysisType.CATALYST_DETECTION) {
    return {
      content: 'Catalyst detection non disponibile senza API key AI.',
      confidence: 0,
      dataPointsUsed: buildDataPoints(ctx),
      structuredData: {
        sentiment: 'neutral',
        keyFactors: [],
        risks: ['API AI non configurata'],
        opportunities: [],
        hasCatalyst: false,
        catalystDescription: undefined,
      },
      tokensUsed: 0,
      estimatedCostUsd: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  const volumeStr = ctx.totalVolume >= 1_000_000
    ? `$${(ctx.totalVolume / 1_000_000).toFixed(1)}M`
    : `$${(ctx.totalVolume / 1_000).toFixed(0)}K`;

  const content = buildDeterministicContent(ctx, type, yesPrice, daysToExpiry, volumeStr);

  return {
    content,
    confidence: calculateConfidence(ctx),
    dataPointsUsed: buildDataPoints(ctx),
    structuredData: {
      sentiment,
      keyFactors: [
        `Prezzo YES: ${(yesPrice * 100).toFixed(1)}%`,
        `Volume 24h: $${ctx.volume24h.toFixed(0)}`,
        `${daysToExpiry} giorni alla scadenza`,
      ],
      risks: buildRisks(ctx, daysToExpiry),
      opportunities: buildOpportunities(ctx, yesPrice, daysToExpiry),
    },
    tokensUsed: 0,
    estimatedCostUsd: 0,
    generatedAt: new Date().toISOString(),
  };
}

function buildDeterministicContent(
  ctx: MarketContext,
  type: AnalysisType,
  yesPrice: number,
  daysToExpiry: number,
  volumeStr: string,
): string {
  switch (type) {
    case AnalysisType.MARKET_OVERVIEW: {
      const sentimentLabel = yesPrice > 0.65 ? 'rialzista' : yesPrice < 0.35 ? 'ribassista' : 'neutrale';
      return [
        `**Panoramica mercato: ${ctx.marketName}**`,
        '',
        `Il mercato prezza "${ctx.outcomes[0] ?? 'Yes'}" al ${(yesPrice * 100).toFixed(1)}%, volume totale ${volumeStr}.`,
        `**Sentiment**: ${sentimentLabel}. **Scadenza**: ${daysToExpiry} giorni.`,
        `**Volume 24h**: $${(ctx.volume24h / 1_000).toFixed(0)}K — ${ctx.volume24h > 50_000 ? 'alta attivita' : 'attivita moderata'}.`,
      ].join('\n');
    }
    case AnalysisType.ENTRY_ANALYSIS: {
      const direction = yesPrice > 0.5 ? 'YES' : 'NO';
      const edge = Math.abs(yesPrice - 0.5) * 100;
      return [
        `**Analisi ingresso: ${ctx.marketName}**`,
        '',
        `**Direzione**: ${direction} @ ${(yesPrice * 100).toFixed(1)}%`,
        `**Edge stimato**: ~${edge.toFixed(1)}%`,
        `**Rischio**: ${daysToExpiry < 3 ? 'ALTO — scadenza imminente' : 'MODERATO'}`,
      ].join('\n');
    }
    case AnalysisType.EXIT_ANALYSIS:
      return [
        `**Analisi uscita: ${ctx.marketName}**`,
        '',
        `**Prezzo**: ${(yesPrice * 100).toFixed(1)}%. **Scadenza**: ${daysToExpiry}gg.`,
        `**Raccomandazione**: ${daysToExpiry < 2 ? 'Uscita completa' : yesPrice > 0.9 ? 'Uscita parziale' : 'Monitorare'}`,
      ].join('\n');
    case AnalysisType.RISK_ASSESSMENT: {
      const liqRisk = ctx.liquidity < 10_000 ? 'ALTO' : ctx.liquidity < 50_000 ? 'MEDIO' : 'BASSO';
      const timeRisk = daysToExpiry < 3 ? 'ALTO' : daysToExpiry < 14 ? 'MEDIO' : 'BASSO';
      return [
        `**Rischio: ${ctx.marketName}**`,
        '',
        `Liquidita: ${liqRisk} | Tempo: ${timeRisk} | Volume 24h: $${(ctx.volume24h / 1_000).toFixed(0)}K`,
      ].join('\n');
    }
    default:
      return `Analisi non disponibile per tipo ${type}`;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function calculateConfidence(ctx: MarketContext): number {
  let confidence = 50;
  if (ctx.totalVolume > 1_000_000) confidence += 15;
  else if (ctx.totalVolume > 100_000) confidence += 10;
  else if (ctx.totalVolume > 10_000) confidence += 5;
  if (ctx.liquidity > 100_000) confidence += 10;
  else if (ctx.liquidity > 20_000) confidence += 5;
  if (ctx.volume24h > 50_000) confidence += 10;
  else if (ctx.volume24h > 10_000) confidence += 5;
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const distFrom50 = Math.abs(yesPrice - 0.5);
  if (distFrom50 > 0.3) confidence += 10;
  else if (distFrom50 > 0.15) confidence += 5;
  return Math.min(95, Math.max(20, confidence));
}

function buildRisks(ctx: MarketContext, daysToExpiry: number): string[] {
  const risks: string[] = [];
  if (ctx.liquidity < 10_000) risks.push('Liquidita molto bassa');
  if (daysToExpiry < 3) risks.push('Scadenza imminente');
  if (ctx.volume24h < 5_000) risks.push('Volume 24h basso');
  if (risks.length === 0) risks.push('Nessun rischio critico');
  return risks;
}

function buildOpportunities(ctx: MarketContext, yesPrice: number, daysToExpiry: number): string[] {
  const opps: string[] = [];
  if (yesPrice > 0.4 && yesPrice < 0.6) opps.push('Prezzo indeciso: potenziale edge');
  if (ctx.volume24h > 50_000) opps.push('Alta liquidita');
  if (daysToExpiry > 14 && daysToExpiry < 60) opps.push('Finestra temporale ideale');
  if (opps.length === 0) opps.push('Monitorare');
  return opps;
}
