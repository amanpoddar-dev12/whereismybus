import React from 'react';
import {
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  MapPin,
  Plus,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { SavedRoutesSection } from '../SavedRoutesSection';
import { formatMeters } from '../../utils/transitHelpers';
import { cn } from '../ui/primitives';

export const SavedRoutesTab: React.FC = () => {
  const {
    routes,
    alarms,
    favoriteRoutes,
    allAreaStops,
    recentSearches,
    selectActiveStation,
    setActiveTab,
    toggleAlarmActive,
    removeAlarm,
    simulateAlarmRingNow,
    openAlarmModal,
  } = useTransit();

  // Combine user's recent transit stops with top nearby hubs for Frequent Stations quick-access
  const frequentStations = React.useMemo(() => {
    const recentStops = recentSearches
      .filter((r) => r.isTransitStop)
      .slice(0, 4)
      .map((r) => ({
        stopId: r.stopId || r.id,
        name: r.name,
        subtitle: r.subtitle,
        lat: r.lat,
        lon: r.lon,
      }));

    const hubFallbacks = allAreaStops.slice(0, 6).map((s) => ({
      stopId: s.stopId,
      name: s.name,
      subtitle: `${s.agencyPrefix}${s.stopCode ? ` #${s.stopCode}` : ''}${
        s.distanceFromUserMeters !== undefined
          ? ` · ${formatMeters(s.distanceFromUserMeters)}`
          : ''
      }`,
      lat: s.lat,
      lon: s.lon,
      rawStop: s,
    }));

    const seen = new Set<string>();
    const combined: Array<{
      stopId: string;
      name: string;
      subtitle: string;
      lat: number;
      lon: number;
    }> = [];

    for (const item of [...recentStops, ...hubFallbacks]) {
      const key = item.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
      if (combined.length >= 6) break;
    }
    return combined;
  }, [allAreaStops, recentSearches]);

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 px-3.5 py-4 sm:px-6 sm:py-6 space-y-7 pb-24 md:pb-12">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Saved Routes &amp; Stations
        </h1>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
          Offline-ready favorite bus lines, frequent boarding stops, and arrival wake alarms
        </p>
      </div>

      {/* 1. Bookmarked Favorite Routes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-zinc-950 dark:text-white tabular-nums">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
            <span>Favorite Bus Routes ({favoriteRoutes.length})</span>
          </h2>
        </div>

        <SavedRoutesSection variant="full" />
      </section>

      {/* 2. Frequent & Nearby Stations */}
      {frequentStations.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-zinc-950 dark:text-white">
            <Building2 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <span>Frequent &amp; Nearby Stations</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {frequentStations.map((st) => (
              <button
                key={st.stopId}
                type="button"
                onClick={() => {
                  const found = allAreaStops.find((a) => a.stopId === st.stopId) || {
                    stopId: st.stopId,
                    name: st.name,
                    lat: st.lat,
                    lon: st.lon,
                    modes: ['BUS'],
                    agencyPrefix: 'GTFS',
                    source: 'GTFS' as const,
                  };
                  selectActiveStation(found);
                  setActiveTab('search');
                }}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left shadow-subtle transition-colors hover:border-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-950 dark:text-zinc-100 truncate">
                      {st.name}
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate tabular-nums">
                      {st.subtitle}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3. Proximity Wake Alarms */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-zinc-950 dark:text-white tabular-nums">
            <BellRing className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            <span>Arrival Wake Alarms ({alarms.length})</span>
          </h2>

          {routes[0] && (
            <button
              type="button"
              onClick={() => openAlarmModal(routes[0], 0)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-zinc-900 dark:bg-emerald-500 px-3.5 text-xs font-semibold text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              <span>New Alarm</span>
            </button>
          )}
        </div>

        {alarms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-card p-6 text-center shadow-subtle">
            <Bell className="mx-auto h-5 w-5 text-zinc-500 dark:text-zinc-500" />
            <p className="mt-2 text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200">
              No active stop alarms
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Tap the bell icon inside any bus stop timeline to get alerted 500m–2km before your stop.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {alarms.map((alarm) => (
              <div
                key={alarm.id}
                className={cn(
                  'rounded-xl border border-border bg-card p-4 shadow-subtle flex flex-wrap items-center justify-between gap-3 transition-opacity',
                  !alarm.active && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      alarm.active
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500'
                    )}
                  >
                    <BellRing className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 tabular-nums">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-900 dark:bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-white dark:text-zinc-950">
                        {alarm.operator} {alarm.routeNumber}
                      </span>
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {alarm.radiusMeters >= 1000
                          ? `${alarm.radiusMeters / 1000} km`
                          : `${alarm.radiusMeters} m`}{' '}
                        prior
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-100 break-words">
                      {alarm.stopName}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => simulateAlarmRingNow(alarm.id)}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-zinc-300 bg-zinc-100 px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
                    <span>Test</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={alarm.active}
                    onClick={() => toggleAlarmActive(alarm.id)}
                    className={cn(
                      'min-h-[44px] rounded-xl px-3.5 text-xs font-semibold transition-colors',
                      alarm.active
                        ? 'bg-zinc-900 text-white dark:bg-emerald-500 dark:text-zinc-950'
                        : 'border border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
                    )}
                  >
                    {alarm.active ? 'Active' : 'Paused'}
                  </button>

                  <button
                    type="button"
                    aria-label="Delete alarm"
                    onClick={() => removeAlarm(alarm.id)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-rose-900 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
