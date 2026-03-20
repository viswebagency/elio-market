/**
 * Knowledge Base — AI Analysis Generator
 *
 * Generates AI analyses for markets. Currently uses realistic placeholders;
 * structured to accept Claude/OpenAI API when keys are available.
 */

import { MarketArea } from '../types/common';

// ============================================================================
// Types
// ============================================================================

export enum AnalysisType {
  MARKET_OVERVIEW = 'market_overview',
  ENTRY_ANALYSIS = 'entry_analysis',
  EXIT_ANALYSIS = 'exit_analysis',
  RISK_ASSESSMENT = 'risk_assessment',
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
// Analysis Generator
// ============================================================================

/**
 * Generate an AI analysis for a market.
 *
 * Currently returns realistic placeholder content.
 * When API keys are available, replace the body of each generator
 * with actual Claude/OpenAI calls using the same MarketContext.
 */
export async function generateAnalysis(
  context: MarketContext,
  type: AnalysisType,
): Promise<AnalysisResult> {
  // TODO: Replace with real AI call when keys are available:
  //
  // import Anthropic from '@anthropic-ai/sdk';
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // const response = await client.messages.create({
  //   model: 'claude-sonnet-4-20250514',
  //   max_tokens: 1024,
  //   system: buildSystemPrompt(type),
  //   messages: [{ role: 'user', content: buildUserPrompt(context, type) }],
  // });

  switch (type) {
    case AnalysisType.MARKET_OVERVIEW:
      return generateMarketOverview(context);
    case AnalysisType.ENTRY_ANALYSIS:
      return generateEntryAnalysis(context);
    case AnalysisType.EXIT_ANALYSIS:
      return generateExitAnalysis(context);
    case AnalysisType.RISK_ASSESSMENT:
      return generateRiskAssessment(context);
  }
}

// ============================================================================
// Placeholder Generators (realistic, useful output)
// ============================================================================

function generateMarketOverview(ctx: MarketContext): AnalysisResult {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const sentiment = yesPrice > 0.65 ? 'bullish' : yesPrice < 0.35 ? 'bearish' : 'neutral';
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));
  const volumeStr = ctx.totalVolume >= 1_000_000
    ? `$${(ctx.totalVolume / 1_000_000).toFixed(1)}M`
    : `$${(ctx.totalVolume / 1_000).toFixed(0)}K`;

  const sentimentLabel = sentiment === 'bullish' ? 'rialzista' : sentiment === 'bearish' ? 'ribassista' : 'neutrale';

  const content = [
    `**Panoramica mercato: ${ctx.marketName}**`,
    '',
    `Il mercato attualmente prezza "${ctx.outcomes[0] ?? 'Yes'}" al ${(yesPrice * 100).toFixed(1)}%, con un volume totale di ${volumeStr} e liquidita di $${(ctx.liquidity / 1_000).toFixed(0)}K.`,
    '',
    `**Sentiment**: ${sentimentLabel.charAt(0).toUpperCase() + sentimentLabel.slice(1)}. Il consensus di mercato ${yesPrice > 0.65 ? 'favorisce fortemente l\'esito positivo' : yesPrice < 0.35 ? 'ritiene improbabile l\'esito positivo' : 'e diviso sull\'esito'}.`,
    '',
    `**Scadenza**: ${daysToExpiry} giorni rimanenti. ${daysToExpiry < 7 ? 'Prossimita alla scadenza: i movimenti di prezzo saranno piu accentuati.' : daysToExpiry < 30 ? 'Tempo sufficiente per movimenti significativi.' : 'Orizzonte lungo, prezzo soggetto a fluttuazioni.'}`,
    '',
    `**Volume 24h**: $${(ctx.volume24h / 1_000).toFixed(0)}K — ${ctx.volume24h > 50_000 ? 'alta attivita, mercato liquido' : ctx.volume24h > 10_000 ? 'attivita moderata' : 'bassa attivita, possibile slippage elevato'}.`,
    '',
    `**Pro**: ${yesPrice > 0.5 ? 'Il mercato sta consolidando una direzione chiara, utile per strategie trend-following.' : 'Prezzo vicino al 50%, possibile valore in entrambe le direzioni.'}`,
    `**Contro**: ${daysToExpiry < 3 ? 'Troppo vicino alla scadenza per operazioni strutturate.' : ctx.volume24h < 5_000 ? 'Volume basso, rischio liquidita.' : 'Nessun segnale di allarme critico al momento.'}`,
  ].join('\n');

  const dataPoints: DataPoint[] = [
    { label: 'Prezzo YES', value: `${(yesPrice * 100).toFixed(1)}%`, source: 'Polymarket' },
    { label: 'Volume totale', value: volumeStr, source: 'Polymarket' },
    { label: 'Volume 24h', value: `$${ctx.volume24h.toFixed(0)}`, source: 'Polymarket' },
    { label: 'Liquidita', value: `$${ctx.liquidity.toFixed(0)}`, source: 'Polymarket' },
    { label: 'Giorni a scadenza', value: String(daysToExpiry), source: 'calcolato' },
  ];

  return {
    content,
    confidence: calculateConfidence(ctx),
    dataPointsUsed: dataPoints,
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

function generateEntryAnalysis(ctx: MarketContext): AnalysisResult {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));
  const edgeEstimate = yesPrice > 0.5 ? (yesPrice - 0.5) * 100 : (0.5 - yesPrice) * 100;
  const direction = yesPrice > 0.5 ? 'YES' : 'NO';

  const content = [
    `**Analisi ingresso: ${ctx.marketName}**`,
    '',
    `**Direzione suggerita**: ${direction} @ ${(yesPrice * 100).toFixed(1)}%`,
    '',
    `**Perche entrare**:`,
    `- Il mercato mostra ${ctx.volume24h > 20_000 ? 'buona liquidita' : 'liquidita accettabile'} con volume 24h di $${(ctx.volume24h / 1_000).toFixed(1)}K`,
    `- Edge stimato: ~${edgeEstimate.toFixed(1)}% rispetto al prezzo 50/50`,
    `- ${daysToExpiry > 14 ? 'Tempo sufficiente per convergenza al valore reale' : daysToExpiry > 3 ? 'Finestra di opportunita limitata ma sufficiente' : 'Ingresso rischioso: troppo vicino alla scadenza'}`,
    '',
    `**Rischi principali**:`,
    `- ${ctx.volume24h < 10_000 ? 'Volume basso: possibile difficolta in uscita' : 'Volatilita di mercato: il prezzo puo muoversi rapidamente'}`,
    `- ${daysToExpiry < 7 ? 'Scadenza imminente: risk/reward sfavorevole' : 'Evento imprevisto potrebbe ribaltare il sentiment'}`,
    `- Slippage stimato: ${ctx.liquidity > 50_000 ? '0.5-1%' : '1-3%'}`,
    '',
    `**Stake suggerito**: ${edgeEstimate > 10 ? 'Tier 1 (alto)' : edgeEstimate > 5 ? 'Tier 2 (medio)' : 'Tier 3 (basso)'} — proporzionato all\'edge.`,
  ].join('\n');

  return {
    content,
    confidence: calculateConfidence(ctx),
    dataPointsUsed: [
      { label: 'Prezzo corrente', value: `${(yesPrice * 100).toFixed(1)}%`, source: 'Polymarket' },
      { label: 'Edge stimato', value: `${edgeEstimate.toFixed(1)}%`, source: 'calcolato' },
      { label: 'Liquidita', value: `$${ctx.liquidity.toFixed(0)}`, source: 'Polymarket' },
    ],
    structuredData: {
      sentiment: yesPrice > 0.6 ? 'bullish' : yesPrice < 0.4 ? 'bearish' : 'neutral',
      keyFactors: [`Direzione: ${direction}`, `Edge stimato: ${edgeEstimate.toFixed(1)}%`],
      risks: buildRisks(ctx, daysToExpiry),
      opportunities: [`Ingresso ${direction} a ${(yesPrice * 100).toFixed(1)}%`],
    },
    tokensUsed: 0,
    estimatedCostUsd: 0,
    generatedAt: new Date().toISOString(),
  };
}

function generateExitAnalysis(ctx: MarketContext): AnalysisResult {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));

  const content = [
    `**Analisi uscita: ${ctx.marketName}**`,
    '',
    `**Prezzo attuale**: ${(yesPrice * 100).toFixed(1)}%`,
    '',
    `**Perche uscire adesso**:`,
    `- ${yesPrice > 0.85 || yesPrice < 0.15 ? 'Prezzo vicino all\'estremo — margine di profitto residuo limitato' : 'Prezzo in zona intermedia — rischio di reversal presente'}`,
    `- ${daysToExpiry < 3 ? 'Scadenza imminente: meglio consolidare il profitto' : 'Possibilita di lock-in del profitto attuale'}`,
    '',
    `**Perche rimanere**:`,
    `- ${daysToExpiry > 7 ? 'Tempo sufficiente per ulteriore convergenza' : 'Se la posizione e profittevole, lo slippage e minimo'}`,
    `- ${ctx.volume24h > 30_000 ? 'Alta liquidita: uscita rapida sempre possibile' : 'Liquidita moderata: pianificare uscita graduale'}`,
    '',
    `**Raccomandazione**: ${daysToExpiry < 2 ? 'Uscita completa consigliata' : yesPrice > 0.9 || yesPrice < 0.1 ? 'Uscita parziale (50%) per lock-in profitto' : 'Monitorare, uscita non urgente'}`,
  ].join('\n');

  return {
    content,
    confidence: calculateConfidence(ctx),
    dataPointsUsed: [
      { label: 'Prezzo corrente', value: `${(yesPrice * 100).toFixed(1)}%`, source: 'Polymarket' },
      { label: 'Giorni a scadenza', value: String(daysToExpiry), source: 'calcolato' },
    ],
    structuredData: {
      sentiment: 'neutral',
      keyFactors: [`Prezzo: ${(yesPrice * 100).toFixed(1)}%`, `Scadenza: ${daysToExpiry}gg`],
      risks: [`Reversal improvviso`, `Slippage in uscita`],
      opportunities: [`Lock-in profitto`, `Riallocazione capitale`],
    },
    tokensUsed: 0,
    estimatedCostUsd: 0,
    generatedAt: new Date().toISOString(),
  };
}

function generateRiskAssessment(ctx: MarketContext): AnalysisResult {
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const daysToExpiry = Math.max(0, Math.ceil((new Date(ctx.endDate).getTime() - Date.now()) / 86400000));

  const liquidityRisk = ctx.liquidity < 10_000 ? 'ALTO' : ctx.liquidity < 50_000 ? 'MEDIO' : 'BASSO';
  const timeRisk = daysToExpiry < 3 ? 'ALTO' : daysToExpiry < 14 ? 'MEDIO' : 'BASSO';
  const volatilityRisk = ctx.volume24h > ctx.totalVolume * 0.1 ? 'ALTO' : ctx.volume24h > ctx.totalVolume * 0.03 ? 'MEDIO' : 'BASSO';
  const overallRisk = [liquidityRisk, timeRisk, volatilityRisk].filter(r => r === 'ALTO').length >= 2 ? 'ALTO'
    : [liquidityRisk, timeRisk, volatilityRisk].filter(r => r === 'ALTO').length >= 1 ? 'MEDIO'
    : 'BASSO';

  const content = [
    `**Valutazione rischio: ${ctx.marketName}**`,
    '',
    `| Fattore | Livello |`,
    `|---|---|`,
    `| Liquidita | ${liquidityRisk} |`,
    `| Tempo alla scadenza | ${timeRisk} |`,
    `| Volatilita | ${volatilityRisk} |`,
    `| **Rischio complessivo** | **${overallRisk}** |`,
    '',
    `**Dettagli**:`,
    `- **Liquidita** (${liquidityRisk}): $${(ctx.liquidity / 1_000).toFixed(0)}K disponibili. ${liquidityRisk === 'ALTO' ? 'Operazioni di size significativa impatterebbero il prezzo.' : 'Sufficiente per operazioni standard.'}`,
    `- **Tempo** (${timeRisk}): ${daysToExpiry} giorni. ${timeRisk === 'ALTO' ? 'Troppo vicino alla scadenza per gestire posizioni complesse.' : 'Margine sufficiente.'}`,
    `- **Volatilita** (${volatilityRisk}): rapporto volume 24h / totale = ${((ctx.volume24h / Math.max(ctx.totalVolume, 1)) * 100).toFixed(1)}%. ${volatilityRisk === 'ALTO' ? 'Movimenti bruschi probabili.' : 'Mercato relativamente stabile.'}`,
    '',
    `**Max drawdown stimato**: ${overallRisk === 'ALTO' ? '15-25%' : overallRisk === 'MEDIO' ? '8-15%' : '3-8%'} del capitale allocato.`,
    `**Sizing consigliato**: ${overallRisk === 'ALTO' ? 'Max 2% del bankroll' : overallRisk === 'MEDIO' ? 'Max 5% del bankroll' : 'Fino al 10% del bankroll'}.`,
  ].join('\n');

  return {
    content,
    confidence: calculateConfidence(ctx),
    dataPointsUsed: [
      { label: 'Liquidita', value: `$${ctx.liquidity.toFixed(0)}`, source: 'Polymarket' },
      { label: 'Volume 24h', value: `$${ctx.volume24h.toFixed(0)}`, source: 'Polymarket' },
      { label: 'Giorni a scadenza', value: String(daysToExpiry), source: 'calcolato' },
      { label: 'Rischio liquidita', value: liquidityRisk, source: 'calcolato' },
      { label: 'Rischio tempo', value: timeRisk, source: 'calcolato' },
      { label: 'Rischio volatilita', value: volatilityRisk, source: 'calcolato' },
    ],
    structuredData: {
      sentiment: 'neutral',
      keyFactors: [`Rischio: ${overallRisk}`, `Liquidita: ${liquidityRisk}`, `Tempo: ${timeRisk}`],
      risks: buildRisks(ctx, daysToExpiry),
      opportunities: [`Sizing adeguato per risk/reward`],
    },
    tokensUsed: 0,
    estimatedCostUsd: 0,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function calculateConfidence(ctx: MarketContext): number {
  let confidence = 50;

  // More volume = higher confidence
  if (ctx.totalVolume > 1_000_000) confidence += 15;
  else if (ctx.totalVolume > 100_000) confidence += 10;
  else if (ctx.totalVolume > 10_000) confidence += 5;

  // More liquidity = higher confidence
  if (ctx.liquidity > 100_000) confidence += 10;
  else if (ctx.liquidity > 20_000) confidence += 5;

  // Recent activity = higher confidence
  if (ctx.volume24h > 50_000) confidence += 10;
  else if (ctx.volume24h > 10_000) confidence += 5;

  // Clear direction = higher confidence
  const yesPrice = ctx.outcomePrices[0] ?? 0.5;
  const distFrom50 = Math.abs(yesPrice - 0.5);
  if (distFrom50 > 0.3) confidence += 10;
  else if (distFrom50 > 0.15) confidence += 5;

  return Math.min(95, Math.max(20, confidence));
}

function buildRisks(ctx: MarketContext, daysToExpiry: number): string[] {
  const risks: string[] = [];
  if (ctx.liquidity < 10_000) risks.push('Liquidita molto bassa: rischio slippage elevato');
  if (daysToExpiry < 3) risks.push('Scadenza imminente: movimento prezzo imprevedibile');
  if (ctx.volume24h < 5_000) risks.push('Volume 24h basso: mercato poco attivo');
  if (risks.length === 0) risks.push('Nessun rischio critico identificato');
  return risks;
}

function buildOpportunities(ctx: MarketContext, yesPrice: number, daysToExpiry: number): string[] {
  const opps: string[] = [];
  if (yesPrice > 0.4 && yesPrice < 0.6) opps.push('Prezzo indeciso: potenziale edge se si ha informazione');
  if (ctx.volume24h > 50_000) opps.push('Alta liquidita: esecuzione efficiente');
  if (daysToExpiry > 14 && daysToExpiry < 60) opps.push('Finestra temporale ideale per convergenza');
  if (opps.length === 0) opps.push('Monitorare per opportunita future');
  return opps;
}
