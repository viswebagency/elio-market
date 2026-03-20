'use client';

/**
 * OpportunityCard — Card per un'opportunita' dallo scanner mercati.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface OpportunityCardProps {
  marketName: string;
  marketCategory: string;
  strategyCode: string;
  strategyName: string;
  score: number;
  motivation: string;
  suggestedStake: number;
  currentPrice: number;
  volume24h: number;
  scannedAt: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 70) return 'text-lime-400';
  return 'text-amber-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-900/30 border-emerald-800';
  if (score >= 70) return 'bg-lime-900/30 border-lime-800';
  return 'bg-amber-900/30 border-amber-800';
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function OpportunityCard({
  marketName,
  marketCategory,
  strategyCode,
  strategyName,
  score,
  motivation,
  suggestedStake,
  currentPrice,
  volume24h,
  scannedAt,
}: OpportunityCardProps) {
  return (
    <Card className="hover:border-gray-700 transition-colors">
      <CardContent className="pt-4">
        {/* Header: score + strategy */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 leading-tight line-clamp-2">
              {marketName}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="prediction" className="text-[10px]">
                {marketCategory}
              </Badge>
              <span className="text-[10px] text-gray-500">
                via <span className="font-mono text-violet-400">{strategyCode}</span>
              </span>
            </div>
          </div>
          <div
            className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-center ${scoreBg(score)}`}
          >
            <p className={`text-lg font-mono font-bold leading-none ${scoreColor(score)}`}>
              {score}
            </p>
            <p className="text-[9px] text-gray-500 mt-0.5">score</p>
          </div>
        </div>

        {/* Motivation */}
        <p className="text-xs text-gray-400 leading-relaxed mb-3">
          {motivation}
        </p>

        {/* Metrics row */}
        <div className="flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-800 pt-3">
          <div className="flex items-center gap-3">
            <span>
              Prezzo:{' '}
              <span className="font-mono text-gray-300">
                ${currentPrice.toFixed(4)}
              </span>
            </span>
            <span className="w-px h-3 bg-gray-800" />
            <span>
              Vol. 24h:{' '}
              <span className="font-mono text-gray-300">
                {formatVolume(volume24h)}
              </span>
            </span>
          </div>
          <span>
            Stake:{' '}
            <span className="font-mono text-emerald-400 font-medium">
              ${suggestedStake.toFixed(2)}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
