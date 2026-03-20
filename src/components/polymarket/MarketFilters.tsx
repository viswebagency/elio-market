'use client';

import { useCallback } from 'react';

const CATEGORIES = [
  'All',
  'Politics',
  'Crypto',
  'Sports',
  'Science',
  'Culture',
  'Business',
  'Tech',
];

const SORT_OPTIONS = [
  { value: 'volume24hr', label: 'Volume 24h' },
  { value: 'volume', label: 'Volume totale' },
  { value: 'liquidity', label: 'Liquidita' },
  { value: 'endDate', label: 'Scadenza' },
];

const MIN_VOLUME_OPTIONS = [
  { value: '0', label: 'Qualsiasi' },
  { value: '1000', label: '> $1K' },
  { value: '10000', label: '> $10K' },
  { value: '100000', label: '> $100K' },
  { value: '1000000', label: '> $1M' },
];

interface MarketFiltersProps {
  category: string;
  sortBy: string;
  minVolume: string;
  onCategoryChange: (cat: string) => void;
  onSortByChange: (sort: string) => void;
  onMinVolumeChange: (vol: string) => void;
}

export default function MarketFilters({
  category,
  sortBy,
  minVolume,
  onCategoryChange,
  onSortByChange,
  onMinVolumeChange,
}: MarketFiltersProps) {
  const selectClasses =
    'bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-prediction-600 focus:border-transparent transition-colors';

  const handleCategory = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => onCategoryChange(e.target.value),
    [onCategoryChange]
  );
  const handleSort = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => onSortByChange(e.target.value),
    [onSortByChange]
  );
  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => onMinVolumeChange(e.target.value),
    [onMinVolumeChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Categoria */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Categoria</label>
        <select value={category} onChange={handleCategory} className={selectClasses}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c === 'All' ? '' : c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Volume minimo */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Volume min</label>
        <select value={minVolume} onChange={handleVolume} className={selectClasses}>
          {MIN_VOLUME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Ordinamento */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">Ordina per</label>
        <select value={sortBy} onChange={handleSort} className={selectClasses}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
