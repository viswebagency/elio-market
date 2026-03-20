'use client';

interface MarketCardProps {
  id: string;
  question: string;
  category: string;
  outcomePrices: number[];
  outcomes: string[];
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  image: string | null;
  onClick: (id: string) => void;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getLiquidityLevel(liquidity: number): {
  label: string;
  color: string;
} {
  if (liquidity >= 100_000) return { label: 'Alta', color: 'text-green-400' };
  if (liquidity >= 10_000) return { label: 'Media', color: 'text-yellow-400' };
  return { label: 'Bassa', color: 'text-red-400' };
}

export default function MarketCard({
  id,
  question,
  category,
  outcomePrices,
  outcomes,
  volume24hr,
  liquidity,
  endDate,
  onClick,
}: MarketCardProps) {
  const yesPrice = outcomePrices[0] ?? 0;
  const noPrice = outcomePrices[1] ?? 1 - yesPrice;
  const yesPct = Math.round(yesPrice * 100);
  const noPct = Math.round(noPrice * 100);
  const liq = getLiquidityLevel(liquidity);

  return (
    <button
      onClick={() => onClick(id)}
      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-prediction-600 hover:bg-gray-800/80 transition-all duration-200 group cursor-pointer"
    >
      {/* Header: categoria + scadenza */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-prediction-700/30 text-prediction-400 uppercase tracking-wider">
          {category}
        </span>
        <span className="text-xs text-gray-500">{formatDate(endDate)}</span>
      </div>

      {/* Titolo */}
      <h3 className="text-sm font-semibold text-gray-100 mb-4 line-clamp-2 group-hover:text-white transition-colors leading-snug">
        {question}
      </h3>

      {/* Barra visuale YES/NO */}
      <div className="mb-3">
        <div className="flex justify-between text-xs font-mono mb-1">
          <span className="text-green-400">
            {outcomes[0] ?? 'Yes'} {yesPct}%
          </span>
          <span className="text-red-400">
            {outcomes[1] ?? 'No'} {noPct}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${yesPct}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${noPct}%` }}
          />
        </div>
      </div>

      {/* Footer: volume, liquidita */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <span className="font-mono">
            Vol 24h: <span className="text-gray-200">{formatVolume(volume24hr)}</span>
          </span>
        </div>
        <span className={`font-medium ${liq.color}`}>
          Liq. {liq.label}
        </span>
      </div>
    </button>
  );
}
