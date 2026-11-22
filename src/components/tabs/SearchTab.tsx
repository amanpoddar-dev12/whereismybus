import React, { Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  History,
  MapPin,
  Mic,
  Route as RouteIcon,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { usePersistedState } from '../../hooks/usePersistedState';
import {
  BusRoute,
  BusServiceCategory,
  RealTransitStop,
  RouteSortBy,
} from '../../types/transit';
import { searchBusRoutesByNumberOrName } from '../../data/featuredBusRoutes';
import { searchLocalStopsSmart } from '../../utils/stationSearchEngine';
import {
  formatAccurateEta,
  formatMeters,
  inferBusServiceCategory,
} from '../../utils/transitHelpers';
import { RecommendedRouteCard } from '../RecommendedRouteCard';
import { SmartSearchHero } from '../SmartSearchHero';
import { PlannedJourneysPanel } from '../PlannedJourneysPanel';
import { MapCanvasSkeleton } from '../maps/MapCanvasSkeleton';
import { Badge, cn, SegmentedTabs, StatusDot } from '../ui/primitives';

// On-Demand Journey Map Preview (loaded ONLY when user taps "View Route on Map")
const LazyUnifiedTransitMap = React.lazy(
  () => import('../maps/UnifiedTransitMap')
);

const SEARCH_HISTORY_KEY = 'wimb_bus_search_history_v1';
const POPULAR_LINES = ['216', '113M', '10H', '222A', '49M', 'AC Vajra'];

type CategoryFilter = 'all' | BusServiceCategory | 'women_free';

export const SearchTab: React.FC = () => {
  const {
    cityPresetId,
    allAreaStops,
    routes,
    filteredRoutes,
    searchFilterQuery,
    setSearchFilterQuery,
    selectActiveStation,
    trackBusRoute,
    isRouteSaved,
    toggleSavedRoute,
    routeSortBy,
    setRouteSortBy,
    originCoords,
    destinationCoords,
    previewJourney,
    setVoiceModalOpen,
  } = useTransit();

  const [debouncedQuery, setDebouncedQuery] = useState<string>(searchFilterQuery);
  const [isSuggestOpen, setIsSuggestOpen] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showTripPlanner, setShowTripPlanner] = useState<boolean>(
    Boolean(originCoords && destinationCoords)
  );
  const [showJourneyMapModal, setShowJourneyMapModal] = useState<boolean>(false);
  const [history, setHistory] = usePersistedState<string[]>(SEARCH_HISTORY_KEY, []);
  const [visibleCount, setVisibleCount] = useState<number>(25);

  const listboxId = useId();
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchFilterQuery), 140);
    return () => clearTimeout(t);
  }, [searchFilterQuery]);

  useEffect(() => {
    if (originCoords && destinationCoords) {
      setShowTripPlanner(true);
    }
  }, [destinationCoords, originCoords]);

  useEffect(() => {
    const onOutside = (ev: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(ev.target as Node)
      ) {
        setIsSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const saveHistoryTerm = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setHistory((prev) =>
      [clean, ...prev.filter((h) => h.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        6
      )
    );
  };

  // Instant Bus Number & Stop Name matching
  const matchedRoutes = useMemo<BusRoute[]>(() => {
    const q = debouncedQuery.trim();
    const baseList = q
      ? searchBusRoutesByNumberOrName(q, routes, cityPresetId)
      : filteredRoutes;

    return baseList.filter((route) => {
      if (categoryFilter === 'all') return true;
      if (categoryFilter === 'women_free') return route.womenFreeEligible;
      return inferBusServiceCategory(route) === categoryFilter;
    });
  }, [categoryFilter, cityPresetId, debouncedQuery, filteredRoutes, routes]);

  const matchedStops = useMemo<RealTransitStop[]>(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) return [];
    return searchLocalStopsSmart(allAreaStops, q, 5);
  }, [allAreaStops, debouncedQuery]);

  const categoryPills: Array<{ id: CategoryFilter; label: string }> = [
    { id: 'all', label: 'All Routes' },
    { id: 'AC', label: 'AC' },
    { id: 'Electric', label: 'Electric' },
    { id: 'Metro Express', label: 'Metro Express' },
    { id: 'Express', label: 'Express' },
    { id: 'Ordinary', label: 'Ordinary' },
    { id: 'women_free', label: 'Women ₹0' },
  ];

  const sortOptions: Array<{ id: RouteSortBy; label: string }> = [
    { id: 'recommended', label: 'Recommended' },
    { id: 'soonest', label: 'Soonest' },
    { id: 'lowest_fare', label: 'Lowest Fare' },
    { id: 'least_crowd', label: 'Least Crowd' },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 px-3.5 py-4 sm:px-6 sm:py-6 space-y-5 pb-24 md:pb-12">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            Search &amp; Routes
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Find any bus by route number (e.g. 216, 113M, 10H, AC Vajra) or stop name
          </p>
        </div>

        <button
          type="button"
          aria-expanded={showTripPlanner}
          onClick={() => setShowTripPlanner(!showTripPlanner)}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors shrink-0',
            showTripPlanner
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
              : 'border-zinc-300 bg-white text-zinc-900 shadow-subtle hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
          )}
        >
          <RouteIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Origin ➔ Dest</span>
          {showTripPlanner ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Primary Bus Number & Stop Search Bar + Live Auto-Suggest */}
      <div ref={searchBoxRef} className="relative">
        <div
          className={cn(
            'flex min-h-[52px] items-center gap-2 rounded-xl border bg-card px-3.5 shadow-card transition-colors',
            isSuggestOpen
              ? 'border-zinc-900 ring-2 ring-zinc-900/10 dark:border-zinc-400 dark:ring-white/10'
              : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-700'
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-zinc-600 dark:text-zinc-400" />
          <input
            type="text"
            role="combobox"
            aria-expanded={isSuggestOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label="Search bus number or stop name"
            value={searchFilterQuery}
            onFocus={() => setIsSuggestOpen(true)}
            onChange={(e) => {
              setSearchFilterQuery(e.target.value);
              setIsSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsSuggestOpen(false);
              if (e.key === 'Enter' && matchedRoutes[0]) {
                saveHistoryTerm(matchedRoutes[0].routeNumber);
                setIsSuggestOpen(false);
                trackBusRoute(matchedRoutes[0], 0, false);
              }
            }}
            placeholder="Bus number (216, 113M, 10H, AC Vajra) or stop name…"
            className="w-full min-w-0 bg-transparent py-3 text-sm font-medium text-zinc-950 dark:text-zinc-100 placeholder:font-normal placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none"
          />

          {searchFilterQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchFilterQuery('');
                setDebouncedQuery('');
              }}
              aria-label="Clear search query"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setVoiceModalOpen(true)}
            aria-label="Voice search"
            title="Voice search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        {/* Live Auto-Suggest Dropdown */}
        {isSuggestOpen && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Instant bus and station matches"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[400px] overflow-y-auto rounded-xl border border-zinc-300 bg-card shadow-elevated divide-y divide-zinc-200 dark:border-zinc-800 dark:divide-zinc-800"
          >
            {/* Quick History & Popular Bus Numbers when blank */}
            {!searchFilterQuery.trim() && (
              <div className="bg-zinc-100/70 dark:bg-zinc-900/80 px-3.5 py-3 space-y-2.5">
                {history.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mr-1">
                      <History className="h-3 w-3" />
                      Recent:
                    </span>
                    {history.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setSearchFilterQuery(term);
                          setDebouncedQuery(term);
                        }}
                        className="min-h-[34px] rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900 hover:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-400"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mr-1">
                    Popular:
                  </span>
                  {POPULAR_LINES.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setSearchFilterQuery(num);
                        setDebouncedQuery(num);
                      }}
                      className="min-h-[34px] rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:border-zinc-900 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-white"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Instant Route Suggestions */}
            {matchedRoutes.slice(0, 6).map((route) => {
              const bus = route.buses[0];
              const category = inferBusServiceCategory(route);
              const saved = isRouteSaved(route.id);
              const isDelayed = (bus?.delayMinutes ?? 0) > 2;
              const eta = bus
                ? formatAccurateEta(bus.etaMinutes, bus.arrivalIso, bus.isTomorrow)
                : null;

              return (
                <div
                  key={`suggest-route-${route.id}`}
                  role="option"
                  aria-selected={false}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                >
                  <button
                    type="button"
                    onClick={() => {
                      saveHistoryTerm(route.routeNumber);
                      setIsSuggestOpen(false);
                      trackBusRoute(route, 0, false);
                    }}
                    className="flex min-h-[48px] flex-1 items-center gap-3 text-left min-w-0 overflow-hidden focus:outline-none"
                  >
                    <span className="flex w-[58px] max-w-[68px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg bg-zinc-950 dark:bg-zinc-100 px-2 py-1.5 text-white dark:text-zinc-950">
                      <span className="max-w-full truncate text-xs sm:text-sm font-semibold tabular-nums leading-none">
                        {route.routeNumber}
                      </span>
                      <span className="mt-0.5 max-w-full truncate text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        {route.operator}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-100 [overflow-wrap:anywhere] line-clamp-1">
                        <span>{route.origin}</span>
                        <ArrowRight className="mx-1 inline h-3 w-3 -mt-0.5 text-zinc-500 dark:text-zinc-500" />
                        <span>{route.destination}</span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                        <Badge variant="subtle">
                          {route.isElectric && (
                            <Zap className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span>{category}</span>
                        </Badge>
                        {eta && (
                          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                            <StatusDot
                              tone={isDelayed ? 'danger' : 'live'}
                              pulse={!isDelayed}
                            />
                            <span
                              className={
                                isDelayed
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }
                            >
                              Next: {eta.primary} ({eta.subLabel})
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label={
                      saved
                        ? `Remove ${route.routeNumber} from favorites`
                        : `Save ${route.routeNumber} to favorites`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSavedRoute(route);
                    }}
                    className={cn(
                      'flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border transition-colors',
                      saved
                        ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-400'
                        : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    )}
                  >
                    <Star className={cn('h-4 w-4', saved && 'fill-current')} />
                  </button>
                </div>
              );
            })}

            {/* Matching Stops */}
            {matchedStops.length > 0 && (
              <div className="bg-zinc-50 dark:bg-zinc-900/40 divide-y divide-zinc-200/80 dark:divide-zinc-800">
                <div className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Matching Bus Stops
                </div>
                {matchedStops.map((stop) => (
                  <button
                    key={`suggest-stop-${stop.stopId}`}
                    type="button"
                    onClick={() => {
                      saveHistoryTerm(stop.name);
                      selectActiveStation(stop);
                      setSearchFilterQuery('');
                      setIsSuggestOpen(false);
                    }}
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-zinc-950 dark:text-zinc-100 truncate">
                          {stop.name}
                        </p>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums">
                          {stop.agencyPrefix}
                          {stop.stopCode ? ` #${stop.stopCode}` : ''}
                          {stop.distanceFromUserMeters !== undefined
                            ? ` · ${formatMeters(stop.distanceFromUserMeters)}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-300 shrink-0">
                      Load Stop →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional Expandable Origin -> Destination Trip Planner */}
      {showTripPlanner && (
        <div className="w-full max-w-full rounded-xl border border-border bg-card shadow-subtle">
          <SmartSearchHero />
        </div>
      )}

      {/* Multi-Time-Slot Planned Journeys (shown when Origin & Destination are set) */}
      <PlannedJourneysPanel
        onPreviewMapRequested={() => setShowJourneyMapModal(true)}
      />

      {/* Category Filter Pills & Sort Controls */}
      <div className="space-y-3 w-full max-w-full min-w-0">
        <div
          role="group"
          aria-label="Filter by bus service category"
          className="flex w-full max-w-full items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
        >
          {categoryPills.map((pill) => {
            const active = categoryFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryFilter(pill.id)}
                className={cn(
                  'min-h-[40px] shrink-0 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'border-zinc-300 bg-white text-zinc-800 shadow-subtle hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white'
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-400 tabular-nums">
            {matchedRoutes.length}{' '}
            {matchedRoutes.length === 1 ? 'bus route' : 'bus routes'}
            {debouncedQuery.trim() ? ` matching “${debouncedQuery.trim()}”` : ''}
          </span>

          {matchedRoutes.length > 1 && (
            <SegmentedTabs
              ariaLabel="Sort routes"
              options={sortOptions}
              value={routeSortBy}
              onChange={setRouteSortBy}
              size="xs"
              variant="pills"
            />
          )}
        </div>
      </div>

      {/* Live Matching Route Cards */}
      {matchedRoutes.length > 0 ? (
        <div className="w-full max-w-full min-w-0 space-y-3">
          {matchedRoutes.slice(0, visibleCount).map((route) => (
            <RecommendedRouteCard key={route.id} route={route} />
          ))}

          {matchedRoutes.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + 25)}
              className="min-h-[48px] w-full rounded-xl border border-zinc-300 bg-white dark:border-border dark:bg-card px-4 text-xs font-semibold text-zinc-950 dark:text-zinc-100 shadow-subtle hover:bg-zinc-100 dark:hover:bg-zinc-800/80 tabular-nums"
            >
              Load more routes ({visibleCount} of {matchedRoutes.length})
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-subtle">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            No routes match your current filter
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Try searching for 216, 113M, 10H, 222A, 49M, or AC Vajra, or reset category filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchFilterQuery('');
              setDebouncedQuery('');
              setCategoryFilter('all');
            }}
            className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-zinc-900 dark:bg-emerald-500 px-4 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-emerald-400"
          >
            Reset search &amp; filters
          </button>
        </div>
      )}

      {/* Contextual On-Demand Journey Map Overlay (Loaded ONLY when user taps "View Route on Map") */}
      {showJourneyMapModal && previewJourney && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Route corridor map preview"
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950/65 backdrop-blur-sm p-3 sm:p-6"
        >
          <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white truncate">
                  {previewJourney.summaryLabel}
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  On-demand corridor map preview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowJourneyMapModal(false)}
                aria-label="Close map preview"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 relative">
              <Suspense fallback={<MapCanvasSkeleton />}>
                <LazyUnifiedTransitMap />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
