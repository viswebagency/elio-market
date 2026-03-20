'use client';

interface Price {
  price: number;
  size: number;
}

interface Runner {
  selectionId: number;
  runnerName: string;
  lastPriceTraded?: number;
  totalMatched?: number;
  status: string;
  ex?: {
    availableToBack: Price[];
    availableToLay: Price[];
  };
}

interface MarketOddsProps {
  marketName: string;
  runners: Runner[];
  totalMatched: number;
  inPlay: boolean;
  status: string;
}

function formatSize(size: number): string {
  if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
  return size.toFixed(0);
}

function formatMatched(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(0);
}

export default function MarketOdds({
  marketName,
  runners,
  totalMatched,
  inPlay,
  status,
}: MarketOddsProps) {
  const isOpen = status === 'OPEN';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-100">{marketName}</h4>
          {inPlay && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-600/20 text-green-400 rounded-full animate-pulse">
              Live
            </span>
          )}
          {!isOpen && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-600/20 text-red-400 rounded-full">
              {status}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          Matched: <span className="text-gray-400 font-mono">GBP {formatMatched(totalMatched)}</span>
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_repeat(6,minmax(0,1fr))] px-4 py-2 text-[10px] uppercase tracking-wider font-medium border-b border-gray-800/50">
        <div className="text-gray-500">Selezione</div>
        {/* 3 Back columns (best first = rightmost) */}
        <div className="text-center text-blue-400">Back</div>
        <div className="text-center text-blue-400">Back</div>
        <div className="text-center text-blue-400">Back</div>
        {/* 3 Lay columns */}
        <div className="text-center text-pink-400">Lay</div>
        <div className="text-center text-pink-400">Lay</div>
        <div className="text-center text-pink-400">Lay</div>
      </div>

      {/* Runners */}
      {runners.map((runner) => {
        const backPrices = runner.ex?.availableToBack ?? [];
        const layPrices = runner.ex?.availableToLay ?? [];

        // Back: ordinati dal piu alto (peggiore) al piu basso (migliore) — migliore a destra
        const sortedBack = [...backPrices].sort((a, b) => b.price - a.price).slice(0, 3);
        while (sortedBack.length < 3) sortedBack.unshift({ price: 0, size: 0 });

        // Lay: ordinati dal piu basso (migliore) al piu alto (peggiore) — migliore a sinistra
        const sortedLay = [...layPrices].sort((a, b) => a.price - b.price).slice(0, 3);
        while (sortedLay.length < 3) sortedLay.push({ price: 0, size: 0 });

        const isActive = runner.status === 'ACTIVE';

        return (
          <div
            key={runner.selectionId}
            className={`grid grid-cols-[1fr_repeat(6,minmax(0,1fr))] px-4 py-2 border-b border-gray-800/30 last:border-b-0 ${
              isActive ? '' : 'opacity-40'
            }`}
          >
            {/* Runner name */}
            <div className="flex flex-col justify-center pr-2">
              <span className="text-sm font-medium text-gray-200 truncate">
                {runner.runnerName}
              </span>
              {runner.totalMatched !== undefined && runner.totalMatched > 0 && (
                <span className="text-[10px] text-gray-600 font-mono">
                  GBP {formatMatched(runner.totalMatched)}
                </span>
              )}
            </div>

            {/* Back prices (3 colonne, peggiore -> migliore) */}
            {sortedBack.map((p, i) => (
              <PriceCell
                key={`back-${i}`}
                price={p.price}
                size={p.size}
                type="back"
                isBest={i === 2}
              />
            ))}

            {/* Lay prices (3 colonne, migliore -> peggiore) */}
            {sortedLay.map((p, i) => (
              <PriceCell
                key={`lay-${i}`}
                price={p.price}
                size={p.size}
                type="lay"
                isBest={i === 0}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PriceCell
// ---------------------------------------------------------------------------

function PriceCell({
  price,
  size,
  type,
  isBest,
}: {
  price: number;
  size: number;
  type: 'back' | 'lay';
  isBest: boolean;
}) {
  if (price === 0) {
    return <div className="flex flex-col items-center justify-center mx-0.5 rounded-md bg-gray-800/30 py-1" />;
  }

  const bgClass = type === 'back'
    ? isBest
      ? 'bg-blue-600/20 hover:bg-blue-600/30'
      : 'bg-blue-600/10 hover:bg-blue-600/20'
    : isBest
      ? 'bg-pink-600/20 hover:bg-pink-600/30'
      : 'bg-pink-600/10 hover:bg-pink-600/20';

  const priceColor = type === 'back' ? 'text-blue-300' : 'text-pink-300';

  return (
    <button
      className={`flex flex-col items-center justify-center mx-0.5 rounded-md py-1 transition-colors cursor-pointer ${bgClass}`}
    >
      <span className={`text-sm font-bold font-mono ${priceColor}`}>
        {price.toFixed(2)}
      </span>
      <span className="text-[10px] text-gray-500 font-mono">
        {formatSize(size)}
      </span>
    </button>
  );
}
