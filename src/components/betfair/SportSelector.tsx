'use client';

interface Sport {
  id: string;
  name: string;
  marketCount: number;
}

interface SportSelectorProps {
  sports: Sport[];
  selectedSportId: string | null;
  onSelect: (sportId: string) => void;
}

const SPORT_ICONS: Record<string, string> = {
  '1': '\u26BD',      // Calcio
  '2': '\uD83C\uDFBE', // Tennis
  '7522': '\uD83C\uDFC0', // Basket
  '7': '\uD83C\uDFC7',  // Ippica
  '4': '\uD83C\uDFCF',  // Cricket
  '7524': '\uD83C\uDFD2', // Hockey
  '6423': '\uD83C\uDFC8', // Football americano
  '7511': '\u26BE',    // Baseball
  '3': '\u26F3',       // Golf
  '6': '\uD83E\uDD4A', // Boxe
  '2378961': '\uD83C\uDFDB\uFE0F', // Politica
  '11': '\uD83D\uDEB4', // Ciclismo
  '8': '\uD83C\uDFCE\uFE0F', // Motorsport
};

export default function SportSelector({
  sports,
  selectedSportId,
  onSelect,
}: SportSelectorProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
      {sports.map((sport) => {
        const isSelected = sport.id === selectedSportId;
        const icon = SPORT_ICONS[sport.id] ?? '\uD83C\uDFC6';

        return (
          <button
            key={sport.id}
            onClick={() => onSelect(sport.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              whitespace-nowrap transition-all duration-200 border
              ${isSelected
                ? 'bg-amber-600/20 border-amber-500/50 text-amber-300'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }
            `}
          >
            <span className="text-base">{icon}</span>
            <span>{sport.name}</span>
            <span className={`text-xs ${isSelected ? 'text-amber-400/70' : 'text-gray-600'}`}>
              {sport.marketCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}
