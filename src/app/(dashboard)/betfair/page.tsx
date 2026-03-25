/**
 * Betfair dashboard — paper trading + browser mercati exchange.
 * AreaDashboard mostra metriche e sessioni, BetfairMarketBrowser mostra quote live.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { AreaDashboard } from '@/components/paper-trading/AreaDashboard';
import SportSelector from '@/components/betfair/SportSelector';
import EventCard from '@/components/betfair/EventCard';
import MarketOdds from '@/components/betfair/MarketOdds';
import { GamblingWarning } from '@/components/compliance/gambling-warning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BetfairPage() {
  return (
    <AreaDashboard area="betfair">
      <GamblingWarning />
      <BetfairMarketBrowser />
    </AreaDashboard>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sport {
  id: string;
  name: string;
  marketCount: number;
}

interface Competition {
  id: string;
  name: string;
  region: string;
  marketCount: number;
}

interface BetfairEvent {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
  openDate: string;
  marketCount: number;
  competitionId?: string;
  competitionName?: string;
}

interface Runner {
  selectionId: number;
  runnerName: string;
  handicap: number;
  lastPriceTraded?: number;
  totalMatched?: number;
  status: string;
  ex?: {
    availableToBack: { price: number; size: number }[];
    availableToLay: { price: number; size: number }[];
  };
}

interface Market {
  marketId: string;
  marketName: string;
  eventId: string;
  marketStartTime: string;
  totalMatched: number;
  runners: Runner[];
  status: string;
  inPlay: boolean;
}

// ---------------------------------------------------------------------------
// Market Browser
// ---------------------------------------------------------------------------

function BetfairMarketBrowser() {
  const [sports, setSports] = useState<Sport[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [events, setEvents] = useState<BetfairEvent[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);

  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [loadingSports, setLoadingSports] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSports() {
      setLoadingSports(true);
      try {
        const res = await fetch('/api/betfair/sports');
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        setSports(data.sports ?? []);
        if (data.sports?.length > 0) {
          const soccer = data.sports.find((s: Sport) => s.id === '1');
          setSelectedSportId(soccer?.id ?? data.sports[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore caricamento sport');
      } finally {
        setLoadingSports(false);
      }
    }
    fetchSports();
  }, []);

  const fetchEventsForSport = useCallback(async (sportId: string) => {
    setLoadingEvents(true);
    setCompetitions([]);
    setEvents([]);
    setMarkets([]);
    setSelectedCompetitionId(null);
    setSelectedEventId(null);
    setError(null);
    try {
      const res = await fetch(`/api/betfair/events?sportId=${sportId}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setCompetitions(data.competitions ?? []);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento eventi');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSportId) fetchEventsForSport(selectedSportId);
  }, [selectedSportId, fetchEventsForSport]);

  const fetchEventsForCompetition = useCallback(async (competitionId: string) => {
    setLoadingEvents(true);
    setEvents([]);
    setMarkets([]);
    setSelectedEventId(null);
    setError(null);
    try {
      const res = await fetch(`/api/betfair/events?competitionId=${competitionId}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento eventi');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchMarketsForEvent = useCallback(async (eventId: string) => {
    setLoadingMarkets(true);
    setMarkets([]);
    setError(null);
    try {
      const res = await fetch(`/api/betfair/markets?eventId=${eventId}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMarkets(data.markets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento mercati');
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  function handleSportSelect(sportId: string) {
    setSelectedSportId(sportId);
  }

  function handleCompetitionSelect(competitionId: string) {
    setSelectedCompetitionId(competitionId);
    fetchEventsForCompetition(competitionId);
  }

  function handleEventSelect(eventId: string) {
    setSelectedEventId(eventId);
    fetchMarketsForEvent(eventId);
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Betfair Exchange — Quote live</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sport selector */}
        {loadingSports ? (
          <div className="flex items-center gap-3 text-gray-400 py-4">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Caricamento sport...</span>
          </div>
        ) : (
          <SportSelector
            sports={sports}
            selectedSportId={selectedSportId}
            onSelect={handleSportSelect}
          />
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Competitions sidebar */}
          <div className="lg:col-span-3 space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Competizioni
            </h3>
            {loadingEvents && competitions.length === 0 ? (
              <LoadingPulse />
            ) : competitions.length === 0 ? (
              <p className="text-sm text-gray-600 py-4">Nessuna competizione</p>
            ) : (
              <div className="space-y-1">
                {competitions.map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => handleCompetitionSelect(comp.id)}
                    className={`
                      w-full text-left px-3 py-2 rounded-lg text-sm transition-all cursor-pointer
                      ${selectedCompetitionId === comp.id
                        ? 'bg-amber-600/15 text-amber-300 font-medium'
                        : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{comp.name}</span>
                      <span className="text-xs text-gray-600 ml-2">{comp.marketCount}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Events list */}
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Eventi
              {events.length > 0 && (
                <span className="ml-2 text-gray-600 font-mono">{events.length}</span>
              )}
            </h3>
            {loadingEvents ? (
              <LoadingPulse />
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-600 py-8 text-center">
                Seleziona una competizione per vedere gli eventi
              </p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    id={event.id}
                    name={event.name}
                    competitionName={event.competitionName}
                    countryCode={event.countryCode}
                    openDate={event.openDate}
                    marketCount={event.marketCount}
                    isSelected={event.id === selectedEventId}
                    onClick={handleEventSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Markets / Odds */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mercati
                {selectedEvent && (
                  <span className="ml-2 text-gray-400 normal-case tracking-normal">
                    — {selectedEvent.name}
                  </span>
                )}
              </h3>
              {markets.length > 0 && (
                <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-gray-800 text-gray-500 rounded-md border border-gray-700">
                  Cash Out (soon)
                </span>
              )}
            </div>

            {loadingMarkets ? (
              <LoadingPulse />
            ) : markets.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
                <p className="text-sm text-gray-600 text-center">
                  {selectedEventId
                    ? 'Caricamento mercati...'
                    : 'Seleziona un evento per vedere le quote'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {markets.map((market) => (
                  <MarketOdds
                    key={market.marketId}
                    marketName={market.marketName}
                    runners={market.runners}
                    totalMatched={market.totalMatched}
                    inPlay={market.inPlay}
                    status={market.status}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingPulse() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse"
        >
          <div className="h-3 bg-gray-800 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-800 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}
