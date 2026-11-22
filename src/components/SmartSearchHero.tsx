import React, { useId, useMemo, useState } from 'react';
import {
  Navigation,
  ArrowUpDown,
  Mic,
  X,
  LocateFixed,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  History,
  Bus,
  Building2,
  Trash2,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { useSmartPlaceAutocomplete } from '../hooks/useSmartPlaceAutocomplete';
import { QuickFilterId, SuggestionCategory } from '../types/transit';
import {
  estimateWalkingMinutes,
  formatIsoToIndianTime,
  formatMeters,
} from '../utils/transitHelpers';
import {
  anchorIstClockInputToEpochMs,
  getIstCalendarParts,
  parseTransitTimestampMs,
} from '../utils/transitTimeEngine';
import { splitHighlightSegments } from '../utils/stationSearchEngine';
import { cn, StatusDot } from './ui/primitives';

export const SmartSearchHero: React.FC = () => {
  const {
    city,
    userGeo,
    detectUserLocation,
    allAreaStops,
    nearestStop,
    activeStation,
    selectActiveStation,
    isLoadingStops,
    originQuery,
    setOriginQuery,
    destinationQuery,
    setDestinationQuery,
    originCoords,
    setOriginCoords,
    destinationCoords,
    setDestinationCoords,
    swapOriginDestination,
    clearSearch,
    recentSearches,
    clearRecentSearches,
    departureTimeMode,
    customDepartureIso,
    setDepartureSchedule,
    applyQuickTimeOffset,
    activeQuickFilters,
    toggleQuickFilter,
    setVoiceModalOpen,
    setActiveTab,
  } = useTransit();

  const [showNearbyDrawer, setShowNearbyDrawer] = useState<boolean>(false);
  const [showCustomTimePicker, setShowCustomTimePicker] = useState<boolean>(false);
  const [activeOffsetPill, setActiveOffsetPill] = useState<number | null>(0);

  const listboxId = useId();
  const {
    focusedField,
    setFocusedField,
    isSearchingPlaces,
    highlightedIdx,
    setHighlightedIdx,
    searchCardRef,
    optionRefs,
    activeQuery,
    unifiedSuggestions,
    handleSelectSuggestion,
    handleInputKeyDown,
  } = useSmartPlaceAutocomplete();

  const renderCategoryMeta = (category: SuggestionCategory, stopCode?: string) => {
    switch (category) {
      case 'route':
        return {
          icon: <Bus className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />,
          badge: 'Route',
          isDark: true,
        };
      case 'terminal':
        return {
          icon: <Building2 className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />,
          badge: stopCode ? `Hub #${stopCode}` : 'Hub',
          isDark: false,
        };
      case 'gtfs_stop':
        return {
          icon: <MapPin className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />,
          badge: stopCode ? `#${stopCode}` : 'Stop',
          isDark: false,
        };
      case 'osm_stop':
        return {
          icon: <MapPin className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />,
          badge: 'Stop',
          isDark: false,
        };
      case 'recent':
        return {
          icon: <History className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />,
          badge: 'Recent',
          isDark: false,
        };
      case 'gps':
        return {
          icon: <LocateFixed className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
          badge: 'GPS',
          isDark: false,
        };
      default:
        return {
          icon: <Navigation className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />,
          badge: 'Place',
          isDark: false,
        };
    }
  };

  const displayedStation = activeStation || nearestStop;
  const stationWalkMin = displayedStation?.distanceFromUserMeters
    ? estimateWalkingMinutes(displayedStation.distanceFromUserMeters * 1.2)
    : null;

  const customTimeInputValue = useMemo(() => {
    const rawMs = customDepartureIso
      ? parseTransitTimestampMs(customDepartureIso)
      : Date.now();
    const parts = getIstCalendarParts(Number.isNaN(rawMs) ? Date.now() : rawMs);
    const hh = String(parts.hours).padStart(2, '0');
    const mm = String(parts.minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }, [customDepartureIso]);

  const handleCustomTimeChange = (hhmm: string) => {
    if (!hhmm.includes(':')) return;
    const targetMs = anchorIstClockInputToEpochMs(hhmm, Date.now());
    setActiveOffsetPill(null);
    setDepartureSchedule(
      departureTimeMode === 'now' ? 'depart_at' : departureTimeMode,
      new Date(targetMs).toISOString()
    );
  };

  const quickChips: Array<{ id: QuickFilterId; label: string }> = [
    { id: 'nearest_hub', label: 'Nearest stop' },
    {
      id: 'women_free',
      label: `Women ₹0 (${city.womenSchemeTitle.split(' ')[0]})`,
    },
    { id: 'ac_electric', label: 'AC / Electric' },
    { id: 'low_crowd', label: 'Seats available' },
  ];

  const isPopupOpen = Boolean(
    focusedField && (unifiedSuggestions.length > 0 || isSearchingPlaces)
  );
  const activeOptionId =
    isPopupOpen && highlightedIdx >= 0
      ? `${listboxId}-opt-${highlightedIdx}`
      : undefined;

  return (
    <section className="rounded-xl bg-card">
      <div className="w-full max-w-full px-3.5 py-3.5 sm:px-4 space-y-3">
        {/* Contextual Nearest / Active Stop Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <StatusDot tone={isLoadingStops ? 'warning' : 'live'} pulse={!isLoadingStops} />
            {isLoadingStops ? (
              <span className="text-zinc-600 dark:text-zinc-400">Scanning nearby transit stations…</span>
            ) : displayedStation ? (
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
                <span className="text-zinc-600 dark:text-zinc-400 shrink-0">
                  {userGeo.status === 'granted' ? 'Nearest stop:' : 'Active hub:'}
                </span>
                <button
                  type="button"
                  onClick={() => selectActiveStation(displayedStation)}
                  className="truncate max-w-full font-semibold text-zinc-950 dark:text-zinc-100 underline decoration-zinc-400 dark:decoration-zinc-700 underline-offset-4 transition-colors hover:decoration-zinc-950 dark:hover:decoration-zinc-200"
                >
                  {displayedStation.name}
                </button>
                {displayedStation.stopCode && (
                  <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">
                    #{displayedStation.stopCode}
                  </span>
                )}
                {displayedStation.distanceFromUserMeters !== undefined && (
                  <span className="text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">
                    · {formatMeters(displayedStation.distanceFromUserMeters)}
                    {stationWalkMin ? ` (${stationWalkMin} min walk)` : ''}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-zinc-600 dark:text-zinc-400">
                Use GPS to find your closest boarding stop
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {allAreaStops.length > 1 && (
              <button
                type="button"
                aria-expanded={showNearbyDrawer}
                onClick={() => setShowNearbyDrawer(!showNearbyDrawer)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <span className="tabular-nums">
                  Nearby ({Math.min(15, allAreaStops.length)})
                </span>
                {showNearbyDrawer ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {userGeo.errorMessage && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/50 px-3 py-1.5 text-xs text-amber-950 dark:text-amber-200">
            {userGeo.errorMessage}
          </p>
        )}

        {/* Expandable Nearby Stops Strip */}
        {showNearbyDrawer && allAreaStops.length > 0 && (
          <div className="w-full max-w-full overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/70 p-2.5">
            <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 px-0.5">
              <span className="font-medium">Nearby verified stations</span>
              <button
                type="button"
                onClick={() => setActiveTab('saved')}
                className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline tabular-nums"
              >
                All {allAreaStops.length.toLocaleString()} stations →
              </button>
            </div>
            <div className="flex w-full max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {allAreaStops.slice(0, 15).map((st) => {
                const isCurrent = displayedStation?.stopId === st.stopId;
                return (
                  <button
                    key={st.stopId}
                    type="button"
                    onClick={() => {
                      selectActiveStation(st);
                      setShowNearbyDrawer(false);
                    }}
                    className={cn(
                      'shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                      isCurrent
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700'
                    )}
                  >
                    <div className="text-xs font-medium max-w-[180px] truncate">
                      {st.name}
                    </div>
                    <div
                      className={cn(
                        'text-[10px] tabular-nums mt-0.5',
                        isCurrent
                          ? 'text-zinc-300 dark:text-zinc-600'
                          : 'text-zinc-600 dark:text-zinc-400'
                      )}
                    >
                      {st.agencyPrefix}
                      {st.stopCode ? ` #${st.stopCode}` : ''} ·{' '}
                      {formatMeters(st.distanceFromUserMeters ?? 0)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Classic Unified Trip Planner Combobox Card */}
        <div
          ref={searchCardRef}
          className="relative rounded-xl border border-zinc-300 bg-zinc-50/70 shadow-subtle transition-colors focus-within:border-zinc-900 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950/70 dark:focus-within:border-zinc-500 dark:focus-within:bg-zinc-950 dark:focus-within:ring-white/10"
        >
          <div className="flex items-stretch">
            {/* Geometric Route Connector Rail */}
            <div
              aria-hidden="true"
              className="hidden sm:flex flex-col items-center justify-center pl-4 pr-1 py-3 shrink-0"
            >
              <span className="h-2 w-2 rounded-full border-2 border-zinc-900 bg-white dark:border-zinc-200 dark:bg-zinc-950" />
              <span className="my-1 h-6 w-px bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2 w-2 rounded-[2px] bg-zinc-900 dark:bg-zinc-200" />
            </div>

            {/* Origin & Destination Inputs */}
            <div className="flex-1 divide-y divide-zinc-200 dark:divide-zinc-800/80 min-w-0">
              {/* Origin Combobox */}
              <div className="relative flex items-center">
                <label
                  htmlFor="transit-origin-input"
                  className="pointer-events-none pl-3.5 sm:pl-2.5 w-14 shrink-0 text-[11px] font-semibold text-zinc-700 dark:text-zinc-400 select-none"
                >
                  From
                </label>
                <input
                  id="transit-origin-input"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={focusedField === 'origin' && isPopupOpen}
                  aria-controls={focusedField === 'origin' ? listboxId : undefined}
                  aria-activedescendant={
                    focusedField === 'origin' ? activeOptionId : undefined
                  }
                  value={originQuery}
                  onFocus={() => {
                    setFocusedField('origin');
                    setHighlightedIdx(-1);
                  }}
                  onKeyDown={handleInputKeyDown}
                  onChange={(e) => {
                    setOriginQuery(e.target.value);
                    setOriginCoords(null);
                    setHighlightedIdx(-1);
                  }}
                  placeholder={
                    displayedStation
                      ? `${displayedStation.name} (or stop #code)`
                      : 'Origin station, stop #code, or area…'
                  }
                  className="h-12 w-full min-w-0 bg-transparent pr-2 text-sm font-medium text-zinc-950 dark:text-zinc-100 placeholder:font-normal placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none"
                />
                {originQuery ? (
                  <button
                    type="button"
                    aria-label="Clear origin"
                    onClick={() => {
                      setOriginQuery('');
                      setOriginCoords(null);
                    }}
                    className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Use nearest GPS station"
                    aria-label="Use nearest GPS station"
                    onClick={() => {
                      if (displayedStation) {
                        selectActiveStation(displayedStation);
                      } else {
                        detectUserLocation();
                      }
                    }}
                    className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <LocateFixed className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Destination Combobox */}
              <div className="relative flex items-center">
                <label
                  htmlFor="transit-dest-input"
                  className="pointer-events-none pl-3.5 sm:pl-2.5 w-14 shrink-0 text-[11px] font-semibold text-zinc-700 dark:text-zinc-400 select-none"
                >
                  To
                </label>
                <input
                  id="transit-dest-input"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={focusedField === 'dest' && isPopupOpen}
                  aria-controls={focusedField === 'dest' ? listboxId : undefined}
                  aria-activedescendant={
                    focusedField === 'dest' ? activeOptionId : undefined
                  }
                  value={destinationQuery}
                  onFocus={() => {
                    setFocusedField('dest');
                    setHighlightedIdx(-1);
                  }}
                  onKeyDown={handleInputKeyDown}
                  onChange={(e) => {
                    setDestinationQuery(e.target.value);
                    setDestinationCoords(null);
                    setHighlightedIdx(-1);
                  }}
                  placeholder="Destination station, landmark, or bus number (e.g. 500D)…"
                  className="h-12 w-full min-w-0 bg-transparent pr-2 text-sm font-medium text-zinc-950 dark:text-zinc-100 placeholder:font-normal placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none"
                />
                {destinationQuery && (
                  <button
                    type="button"
                    aria-label="Clear destination"
                    onClick={() => {
                      setDestinationQuery('');
                      setDestinationCoords(null);
                    }}
                    className="mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Action Rail: Swap + Voice */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 border-l border-zinc-200 dark:border-zinc-800/80 px-1.5 sm:px-2.5 py-1.5 shrink-0">
              <button
                type="button"
                onClick={swapOriginDestination}
                title="Swap origin and destination"
                aria-label="Swap origin and destination"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setVoiceModalOpen(true)}
                title="Voice search (English, Hindi, Kannada, Telugu)"
                aria-label="Voice search"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-100 text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Accessible Autocomplete Listbox Popover */}
          {isPopupOpen && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-elevated">
              <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-950/60 px-3.5 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-400">
                <span>
                  {activeQuery.trim().length >= 1
                    ? `Suggestions (${unifiedSuggestions.length})`
                    : focusedField === 'origin'
                    ? 'Current location, recent & nearby stops'
                    : 'Recent & nearby stations'}
                </span>
                <div className="flex items-center gap-2.5">
                  {activeQuery.trim().length === 0 && recentSearches.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        clearRecentSearches();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear recent</span>
                    </button>
                  )}
                  {isSearchingPlaces && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Searching…</span>
                    </span>
                  )}
                </div>
              </div>

              <ul
                id={listboxId}
                role="listbox"
                aria-label="Transit search suggestions"
                className="max-h-72 overflow-y-auto divide-y divide-zinc-200/80 dark:divide-zinc-800"
              >
                {unifiedSuggestions.map((item, idx) => {
                  const meta = renderCategoryMeta(item.category, item.stopCode);
                  const isHighlighted = idx === highlightedIdx;
                  const segments = splitHighlightSegments(item.name, activeQuery);

                  return (
                    <li
                      key={`${item.id}-${idx}`}
                      id={`${listboxId}-opt-${idx}`}
                      role="option"
                      aria-selected={isHighlighted}
                    >
                      <button
                        ref={(el) => {
                          optionRefs.current[idx] = el;
                        }}
                        type="button"
                        tabIndex={-1}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors',
                          isHighlighted
                            ? 'bg-zinc-100 dark:bg-zinc-800'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
                            {meta.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-950 dark:text-zinc-100 truncate">
                              {segments.map((seg, sIdx) =>
                                seg.matched ? (
                                  <mark
                                    key={sIdx}
                                    className="rounded-sm bg-zinc-200 dark:bg-emerald-500/30 px-0.5 font-semibold text-zinc-950 dark:text-emerald-200"
                                  >
                                    {seg.text}
                                  </mark>
                                ) : (
                                  <span key={sIdx}>{seg.text}</span>
                                )
                              )}
                            </p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate mt-0.5 tabular-nums">
                              {item.subtitle}
                            </p>
                          </div>
                        </div>

                        <span
                          className={cn(
                            'shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                            meta.isDark
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-950'
                              : 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          )}
                        >
                          {meta.badge}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden sm:flex items-center justify-between border-t border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-950/60 px-3.5 py-1.5 text-[11px] text-zinc-600 dark:text-zinc-500">
                <span>Search by station name, alias (KBS, CSB, E-City), stop #code, or route</span>
                <span>↑↓ Navigate · ↵ Select · Esc Close</span>
              </div>
            </div>
          )}
        </div>

        {/* Clean Single-Row Toolbar: Departure Time + Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 max-w-full">
          {/* Departure Timing Controls */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 mr-1 shrink-0">
              <Clock className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-500" />
            </span>

            {(
              [
                { label: 'Leave now', mins: 0 },
                { label: '+15m', mins: 15 },
                { label: '+30m', mins: 30 },
                { label: '+1h', mins: 60 },
              ] as const
            ).map((preset) => {
              const isSelected =
                (preset.mins === 0 && departureTimeMode === 'now') ||
                (preset.mins > 0 &&
                  departureTimeMode !== 'now' &&
                  activeOffsetPill === preset.mins);
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setActiveOffsetPill(preset.mins);
                    setShowCustomTimePicker(false);
                    applyQuickTimeOffset(preset.mins);
                  }}
                  className={cn(
                    'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums',
                    isSelected
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white'
                  )}
                >
                  {preset.label}
                </button>
              );
            })}

            <button
              type="button"
              aria-expanded={showCustomTimePicker}
              onClick={() => setShowCustomTimePicker(!showCustomTimePicker)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums',
                showCustomTimePicker ||
                  (departureTimeMode !== 'now' && activeOffsetPill === null)
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white'
              )}
            >
              <span>
                {departureTimeMode !== 'now' && customDepartureIso
                  ? `${
                      departureTimeMode === 'arrive_by' ? 'Arrive' : 'Depart'
                    } ${formatIsoToIndianTime(customDepartureIso)}`
                  : 'Schedule'}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* Understated Filter Pills */}
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickChips.map((chip) => {
              const isActive = activeQuickFilters.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggleQuickFilter(chip.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    isActive
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white'
                  )}
                >
                  {chip.label}
                </button>
              );
            })}

            {(originQuery ||
              destinationQuery ||
              departureTimeMode !== 'now' ||
              activeQuickFilters.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  clearSearch();
                  setActiveOffsetPill(0);
                  setShowCustomTimePicker(false);
                  if (departureTimeMode !== 'now') {
                    setDepartureSchedule('now', null);
                  }
                  activeQuickFilters.forEach((f) => toggleQuickFilter(f));
                }}
                className="shrink-0 px-2 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white underline underline-offset-2"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Custom Schedule Time Popover Row */}
        {showCustomTimePicker && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900 p-2.5 text-xs">
            <div className="inline-flex rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 p-0.5">
              <button
                type="button"
                onClick={() =>
                  setDepartureSchedule(
                    'depart_at',
                    customDepartureIso || new Date().toISOString()
                  )
                }
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  departureTimeMode !== 'arrive_by'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                Depart at
              </button>
              <button
                type="button"
                onClick={() =>
                  setDepartureSchedule(
                    'arrive_by',
                    customDepartureIso ||
                      new Date(Date.now() + 45 * 60_000).toISOString()
                  )
                }
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  departureTimeMode === 'arrive_by'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                )}
              >
                Arrive by
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="time"
                aria-label="Select transit time"
                value={customTimeInputValue}
                onChange={(e) => handleCustomTimeChange(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-950 dark:text-zinc-100 tabular-nums focus:border-zinc-900 dark:focus:border-zinc-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setActiveOffsetPill(0);
                  setShowCustomTimePicker(false);
                  setDepartureSchedule('now', null);
                }}
                className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                Now
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
