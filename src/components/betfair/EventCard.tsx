'use client';

interface EventCardProps {
  id: string;
  name: string;
  competitionName?: string;
  countryCode: string;
  openDate: string;
  marketCount: number;
  isSelected: boolean;
  onClick: (id: string) => void;
}

const COUNTRY_FLAGS: Record<string, string> = {
  IT: '\uD83C\uDDEE\uD83C\uDDF9',
  GB: '\uD83C\uDDEC\uD83C\uDDE7',
  ES: '\uD83C\uDDEA\uD83C\uDDF8',
  DE: '\uD83C\uDDE9\uD83C\uDDEA',
  FR: '\uD83C\uDDEB\uD83C\uDDF7',
  US: '\uD83C\uDDFA\uD83C\uDDF8',
  EU: '\uD83C\uDDEA\uD83C\uDDFA',
  BR: '\uD83C\uDDE7\uD83C\uDDF7',
  AR: '\uD83C\uDDE6\uD83C\uDDF7',
  PT: '\uD83C\uDDF5\uD83C\uDDF9',
  NL: '\uD83C\uDDF3\uD83C\uDDF1',
};

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) return 'In corso';
  if (diffHours < 1) return `tra ${Math.round(diffHours * 60)} min`;
  if (diffHours < 24) return `tra ${Math.round(diffHours)} ore`;

  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTimeUrgency(dateStr: string): string {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) return 'text-green-400';
  if (diffHours < 2) return 'text-amber-400';
  return 'text-gray-500';
}

export default function EventCard({
  id,
  name,
  competitionName,
  countryCode,
  openDate,
  marketCount,
  isSelected,
  onClick,
}: EventCardProps) {
  const flag = COUNTRY_FLAGS[countryCode] ?? '\uD83C\uDFF3\uFE0F';
  const parts = name.split(' v ');
  const hasTeams = parts.length === 2;

  return (
    <button
      onClick={() => onClick(id)}
      className={`
        w-full text-left rounded-xl p-4 transition-all duration-200 border cursor-pointer
        ${isSelected
          ? 'bg-amber-600/10 border-amber-500/40'
          : 'bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/80'
        }
      `}
    >
      {/* Top: competizione + data */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">{flag}</span>
          {competitionName && (
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              {competitionName}
            </span>
          )}
        </div>
        <span className={`text-xs font-mono ${getTimeUrgency(openDate)}`}>
          {formatEventDate(openDate)}
        </span>
      </div>

      {/* Match name */}
      {hasTeams ? (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-100 flex-1 text-right">
            {parts[0]}
          </span>
          <span className="text-xs text-gray-600 font-bold px-2">v</span>
          <span className="text-sm font-semibold text-gray-100 flex-1 text-left">
            {parts[1]}
          </span>
        </div>
      ) : (
        <h3 className="text-sm font-semibold text-gray-100 mb-3 line-clamp-2">
          {name}
        </h3>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{marketCount} mercati</span>
        {isSelected && (
          <span className="text-amber-400 font-medium">Selezionato</span>
        )}
      </div>
    </button>
  );
}
