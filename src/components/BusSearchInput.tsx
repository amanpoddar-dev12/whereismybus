import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bus,
  History,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { BusRoute } from '../types/transit';
import { searchBusRoutesByNumberOrName } from '../data/featuredBusRoutes';
import {
  formatAccurateEta,
  inferBusServiceCategory,
} from '../utils/transitHelpers';
import { Badge, cn, StatusDot } from './ui/primitives';

const BUS_HISTORY_STORAGE_KEY = 'wimb_bus_search_history_v1';

const POPULAR_BUS_NUMBERS = ['216', '10H', '222A', '113M', '49M', 'AC Vajra'];

function readBusHistory(): string[] {
  try {
    const raw = localStorage.getItem(BUS_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

interface BusSearchInputProps {
  compact?: boolean;
  onBusSelected?: (route: BusRoute) => void;
}

export const BusSearchInput: React.FC<BusSearchInputProps> = ({
  compact = false,
  onBusSelected,
}) => {
  const {
    cityPresetId,
    routes,
    trackBusRoute,
    isRouteSaved,
    toggleSavedRoute,
  } = useTransit();

  const [rawQuery, setRawQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [history, setHistory] = useState<string[]>(() => readBusHistory());

  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 160ms debounce for auto-complete responsiveness
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(rawQuery);
      setActiveIndex(-1);
    }, 160);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    const onOutside = (ev: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(ev.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const matches = useMemo<BusRoute[]>(() => {
    if (!isOpen) return [];
    return searchBusRoutesByNumberOrName(
      debouncedQuery,
      routes,
      cityPresetId
    );
  }, [cityPresetId, debouncedQuery, isOpen, routes]);

  const recordBusNumberHistory = (routeNumber: string) => {
    const next = [
      routeNumber,
      ...history.filter(
        (h) => h.toUpperCase() !== routeNumber.toUpperCase()
      ),
    ].slice(0, 6);
    setHistory(next);
    try {
      localStorage.setItem(BUS_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleSelectRoute = (route: BusRoute) => {
    recordBusNumberHistory(route.routeNumber);
    setRawQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
    trackBusRoute(route, 0);
    onBusSelected?.(route);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < matches.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = matches[activeIndex >= 0 ? activeIndex : 0];
      if (chosen) handleSelectRoute(chosen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          'flex min-h-[48px] items-center gap-2.5 rounded-xl border bg-white px-3.5 shadow-subtle transition-colors',
          isOpen
            ? 'border-zinc-900 ring-2 ring-zinc-900/10'
            : 'border-zinc-200 hover:border-zinc-300'
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Search bus by route or service number"
          value={rawQuery}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setRawQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            compact
              ? 'Find bus no. (216, 10H, 222A, AC Vajra)…'
              : 'Search bus number or service (e.g. 216, 222A, 10H, 49M, AC Vajra)…'
          }
          className="w-full min-w-0 bg-transparent py-2.5 text-sm font-medium text-zinc-950 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none"
        />

        {rawQuery && (
          <button
            type="button"
            onClick={() => {
              setRawQuery('');
              setDebouncedQuery('');
            }}
            aria-label="Clear bus number search"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Auto-Complete Popover */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Bus route number suggestions"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[380px] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-elevated divide-y divide-zinc-100"
        >
          {/* Recent History & Quick-Tap Pills when input is empty */}
          {!rawQuery.trim() && (
            <div className="bg-zinc-50/80 px-3.5 py-2.5 space-y-2">
              {history.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 mr-1">
                    <History className="h-3 w-3" />
                    Recent:
                  </span>
                  {history.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setRawQuery(num);
                        setDebouncedQuery(num);
                      }}
                      className="min-h-[32px] rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:border-zinc-900"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 mr-1">
                  <Bus className="h-3 w-3" />
                  Popular lines:
                </span>
                {POPULAR_BUS_NUMBERS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setRawQuery(num);
                      setDebouncedQuery(num);
                    }}
                    className="min-h-[32px] rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-950"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}

          {matches.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              No bus route matching &ldquo;{rawQuery}&rdquo;. Try 216, 10H, 222A, 113M, 49M, or AC Vajra.
            </div>
          ) : (
            matches.map((route, idx) => {
              const bus = route.buses[0];
              const category = inferBusServiceCategory(route);
              const saved = isRouteSaved(route.id);
              const isDelayed = (bus?.delayMinutes ?? 0) > 2;
              const eta = bus
                ? formatAccurateEta(bus.etaMinutes, bus.arrivalIso, bus.isTomorrow)
                : null;

              return (
                <div
                  key={route.id}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={cn(
                    'flex items-center justify-between gap-2 px-3 py-2.5 transition-colors',
                    idx === activeIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectRoute(route)}
                    className="flex min-h-[48px] flex-1 items-center gap-3 text-left min-w-0 focus:outline-none"
                  >
                    <span className="flex min-w-[56px] shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-900 px-2 py-1.5 text-white">
                      <span className="text-xs sm:text-sm font-semibold tabular-nums leading-none">
                        {route.routeNumber}
                      </span>
                      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-zinc-400">
                        {route.operator}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-zinc-950">
                        <span className="truncate">{route.origin}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <span className="truncate">{route.destination}</span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        <Badge
                          variant={
                            category === 'AC' || category === 'Electric'
                              ? 'live'
                              : 'subtle'
                          }
                        >
                          {route.isElectric && (
                            <Zap className="h-2.5 w-2.5 text-emerald-600" />
                          )}
                          <span>{category}</span>
                        </Badge>
                        <span>· {route.stops.length} stops</span>
                        {eta && (
                          <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-zinc-800">
                            <StatusDot
                              tone={isDelayed ? 'danger' : 'live'}
                              pulse={!isDelayed}
                            />
                            <span
                              className={
                                isDelayed ? 'text-rose-600' : 'text-emerald-700'
                              }
                            >
                              {eta.compact}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* 48x48px Star Favorite Toggle */}
                  <button
                    type="button"
                    aria-label={
                      saved
                        ? `Remove bus ${route.routeNumber} from favorites`
                        : `Save bus ${route.routeNumber} to favorites`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSavedRoute(route);
                    }}
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors',
                      saved
                        ? 'border-amber-200 bg-amber-50 text-amber-500'
                        : 'border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700'
                    )}
                  >
                    <Star className={cn('h-4 w-4', saved && 'fill-current')} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
