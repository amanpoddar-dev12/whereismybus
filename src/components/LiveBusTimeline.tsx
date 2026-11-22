import React, { Suspense, useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Compass,
  Gauge,
  Loader2,
  Map as MapIcon,
  Navigation,
  Pause,
  Play,
  QrCode,
  ShieldAlert,
  Star,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  buildLiveBusTrackingModel,
  calculateRouteFare,
  formatAccurateEta,
  getCrowdBadgeMeta,
} from '../utils/transitHelpers';
import { MapCanvasSkeleton } from './maps/MapCanvasSkeleton';
import { CrowdTelemetryDrawer } from './timeline/CrowdTelemetryDrawer';
import { TimelineStopRow } from './timeline/TimelineStopRow';
import { Badge, cn, StatusDot } from './ui/primitives';

// Contextual On-Demand Map: Leaflet is NEVER downloaded until `liveMapRequested` is true!
const LazyUnifiedTransitMap = React.lazy(
  () => import('./maps/UnifiedTransitMap')
);

export interface LiveBusTimelineProps {
  onClose?: () => void;
  embedded?: boolean;
}

export const LiveBusTimeline: React.FC<LiveBusTimelineProps> = ({
  onClose,
  embedded = false,
}) => {
  const {
    routes,
    savedRoutes,
    selectedRouteId,
    selectedBusIndex,
    setSelectedBusIndex,
    liveMapRequested,
    setLiveMapRequested,
    closeLiveTracking,
    isLoadingTripDetail,
    isSimPaused,
    setIsSimPaused,
    originQuery,
    destinationQuery,
    isRouteSaved,
    toggleSavedRoute,
    karmaPoints,
    onBoardBusIds,
    votedBusCrowd,
    toggleOnBoardBus,
    submitCrowdVote,
    alarms,
    openAlarmModal,
    openTicketModal,
    openSosModal,
    lastUpdatedTimestamp,
  } = useTransit();

  const [crowdDrawerOpen, setCrowdDrawerOpen] = useState<boolean>(false);

  const route = useMemo(
    () =>
      routes.find((r) => r.id === selectedRouteId) ||
      savedRoutes.find((r) => r.id === selectedRouteId) ||
      null,
    [routes, savedRoutes, selectedRouteId]
  );

  const activeBus = route ? route.buses[selectedBusIndex] || route.buses[0] : null;

  const tracking = useMemo(() => {
    if (!route || !activeBus) return null;
    return buildLiveBusTrackingModel(
      route,
      selectedBusIndex,
      lastUpdatedTimestamp
    );
  }, [route, activeBus, selectedBusIndex, lastUpdatedTimestamp]);

  const fare = useMemo(() => {
    if (!route) return 0;
    return calculateRouteFare(
      route,
      originQuery || route.boardingStopName,
      route.matchedDestStopName || destinationQuery
    );
  }, [route, originQuery, destinationQuery]);

  const handleClose = useCallback(() => {
    closeLiveTracking();
    onClose?.();
  }, [closeLiveTracking, onClose]);

  if (!route || !activeBus || !tracking) return null;

  const saved = isRouteSaved(route.id);
  const crowdMeta = getCrowdBadgeMeta(
    activeBus.crowdLevel,
    activeBus.crowdPercent
  );
  const { isOffline } = useNetworkStatus();
  const isUserOnBoard = onBoardBusIds.includes(activeBus.id);
  const userVotedLevel = votedBusCrowd[activeBus.id];

  return (
    <div className="flex flex-col bg-canvas text-zinc-900 dark:text-zinc-100 tabular-nums w-full max-w-full overflow-x-clip">
      {/* Sticky Header Card */}
      <div
        className={cn(
          'border-b border-border bg-card/95 backdrop-blur-md px-4 py-3.5',
          !embedded && 'sticky top-0 z-20 pt-safe'
        )}
      >
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Back to routes"
                className="flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-800 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div className="flex min-w-[56px] max-w-[74px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-950 dark:bg-zinc-100 px-2.5 py-1.5 text-white dark:text-zinc-950">
                <span className="max-w-full truncate text-sm font-semibold leading-none">
                  {tracking.routeNumber}
                </span>
                <span className="mt-1 max-w-full truncate text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {tracking.operator}
                </span>
              </div>

              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      tracking.overallStatus === 'DELAYED'
                        ? 'danger'
                        : tracking.overallStatus === 'COMPLETED'
                        ? 'subtle'
                        : 'live'
                    }
                  >
                    <StatusDot
                      tone={
                        tracking.overallStatus === 'DELAYED' ? 'danger' : 'live'
                      }
                      pulse={tracking.overallStatus !== 'DELAYED'}
                    />
                    <span>
                      {isOffline
                        ? 'Scheduled Timetable (Offline)'
                        : tracking.overallStatus === 'DELAYED'
                        ? `Delayed ${tracking.delayMinutes}m`
                        : tracking.overallStatus === 'EARLY'
                        ? 'Running Early'
                        : tracking.overallStatus === 'COMPLETED'
                        ? 'Arrived Terminal'
                        : 'On Time'}
                    </span>
                  </Badge>
                  <Badge variant="subtle">{tracking.busCategory}</Badge>
                </div>

                <h2 className="mt-1 text-xs sm:text-sm font-semibold text-zinc-950 dark:text-white leading-snug [overflow-wrap:anywhere] line-clamp-2">
                  <span>{tracking.origin}</span>
                  <ArrowRight className="mx-1 inline h-3 w-3 -mt-0.5 text-zinc-500 dark:text-zinc-500" />
                  <span>{tracking.destination}</span>
                </h2>
              </div>
            </div>

            {/* Right Controls: Bookmark Star + Optional On-Demand "Show Map" Toggle */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => toggleSavedRoute(route)}
                aria-label={
                  saved ? 'Remove route from saved' : 'Save favorite route'
                }
                className={cn(
                  'flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border transition-colors',
                  saved
                    ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-400'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                )}
              >
                <Star className={cn('h-4 w-4', saved && 'fill-current')} />
              </button>

              <button
                type="button"
                aria-pressed={liveMapRequested}
                onClick={() => setLiveMapRequested(!liveMapRequested)}
                className={cn(
                  'inline-flex h-12 min-h-[48px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors',
                  liveMapRequested
                    ? 'border-zinc-950 bg-zinc-950 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-950 hover:bg-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'
                )}
              >
                <MapIcon className="h-4 w-4 text-emerald-600 dark:text-current" />
                <span>{liveMapRequested ? 'Hide Map' : 'Show Map'}</span>
              </button>
            </div>
          </div>

          {/* Current Station & Next Upcoming Station Card with Dynamic ETA Countdown */}
          <div className="rounded-xl border border-zinc-300 bg-zinc-100/75 dark:border-border dark:bg-zinc-900/70 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-zinc-950 dark:text-zinc-100">
                  <Gauge className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  {tracking.speedKmh} km/h
                </span>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-400">
                  <Compass className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-500" />
                  {tracking.bearing}°
                </span>
                <span className="text-zinc-400 dark:text-zinc-700">·</span>
                <span className="font-mono text-[11px] font-medium text-zinc-800 dark:text-zinc-300">
                  {tracking.vehicleNumber}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-300">
                  <StatusDot tone={crowdMeta.tone} />
                  {crowdMeta.shortLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setIsSimPaused(!isSimPaused)}
                  aria-label={isSimPaused ? 'Resume live GPS' : 'Pause live GPS'}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white"
                >
                  {isSimPaused ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-zinc-200 dark:border-border">
              <div className="rounded-lg bg-card border border-zinc-300 dark:border-border px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Current Station
                </div>
                <div className="mt-0.5 text-xs sm:text-sm font-semibold text-zinc-950 dark:text-white break-words">
                  {tracking.currentStopName}
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950 dark:bg-zinc-800 px-3 py-2 text-white">
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  <span>Next Upcoming Stop</span>
                  <span>in {tracking.etaNextStopMinutes} mins</span>
                </div>
                <div className="mt-0.5 text-xs sm:text-sm font-semibold text-white break-words">
                  {tracking.nextStopName}
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Trips Strip */}
          {route.buses.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
              {route.buses.slice(0, 5).map((bus, idx) => {
                const active = idx === selectedBusIndex;
                const etaObj = formatAccurateEta(
                  bus.etaMinutes,
                  bus.arrivalIso,
                  bus.isTomorrow
                );
                return (
                  <button
                    key={bus.tripId}
                    type="button"
                    onClick={() => setSelectedBusIndex(idx)}
                    className={cn(
                      'min-h-[44px] shrink-0 rounded-xl border px-3 py-1.5 text-left transition-colors',
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700'
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span>{idx === 0 ? 'Active Bus' : `Trip #${idx + 1}`}</span>
                      <span
                        className={cn(
                          active
                            ? 'text-emerald-400 dark:text-emerald-700'
                            : 'text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        {etaObj.compact}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-[10px] font-mono',
                        active
                          ? 'text-zinc-300 dark:text-zinc-600'
                          : 'text-zinc-600 dark:text-zinc-400'
                      )}
                    >
                      {etaObj.subLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Contextual On-Demand Interactive Map (Loaded ONLY when user taps "Show Map") */}
      {liveMapRequested && (
        <div className="border-b border-border bg-zinc-100 dark:bg-zinc-900">
          <div className="mx-auto max-w-3xl">
            <div className="h-[290px] sm:h-[360px] w-full overflow-hidden sm:border-x sm:border-border">
              <Suspense fallback={<MapCanvasSkeleton />}>
                <LazyUnifiedTransitMap />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Body Container */}
      <div className="mx-auto w-full max-w-3xl px-4 py-4 space-y-4 pb-24">
        {/* Commuter Quick Actions (48px Touch Targets) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            aria-expanded={crowdDrawerOpen}
            onClick={() => setCrowdDrawerOpen(!crowdDrawerOpen)}
            className={cn(
              'flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors shadow-subtle',
              isUserOnBoard || crowdDrawerOpen
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950'
                : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            )}
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {isUserOnBoard ? 'Checked in' : 'On Bus'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              openAlarmModal(route, selectedBusIndex, tracking.nextStopId)
            }
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-900 shadow-subtle transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Bell className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400" />
            <span className="truncate">Wake Alarm</span>
          </button>

          <button
            type="button"
            onClick={() => openTicketModal(route)}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-900 shadow-subtle transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <QrCode className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-zinc-400" />
            <span className="truncate">Pass · ₹{fare}</span>
          </button>

          <button
            type="button"
            onClick={() => openSosModal(route, selectedBusIndex)}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 text-xs font-semibold text-rose-800 shadow-subtle transition-colors hover:bg-rose-100/70 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950/80"
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="truncate">SOS Share</span>
          </button>
        </div>

        {crowdDrawerOpen && (
          <CrowdTelemetryDrawer
            karmaPoints={karmaPoints}
            crowdsourcedCount={activeBus.crowdsourcedCount}
            isUserOnBoard={isUserOnBoard}
            userVotedLevel={userVotedLevel}
            onToggleOnBoard={() => toggleOnBoardBus(route.id, activeBus.id)}
            onVoteCrowd={(level) =>
              submitCrowdVote(route.id, activeBus.id, level)
            }
          />
        )}

        {/* Vertical Stop-by-Stop Live Timeline */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-subtle">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm sm:text-base font-semibold text-zinc-950 dark:text-white">
                <StatusDot tone="live" pulse />
                <span>Stop Timeline ({tracking.stops.length} stops)</span>
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                Passed, active &amp; upcoming stations with dynamic ETA countdowns
              </p>
            </div>

            {isLoadingTripDetail && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Syncing stops…</span>
              </span>
            )}
          </div>

          <ol className="relative" aria-label="Ordered bus stops timeline">
            {tracking.stops.map((stop, idx) => {
              const hasAlarm = alarms.some(
                (a) => a.active && a.routeId === route.id && a.stopId === stop.id
              );
              return (
                <TimelineStopRow
                  key={`${stop.id}-${stop.sequence}`}
                  stop={stop}
                  isFirst={idx === 0}
                  isLast={idx === tracking.stops.length - 1}
                  hasAlarm={hasAlarm}
                  onOpenAlarm={(stopId) =>
                    openAlarmModal(route, selectedBusIndex, stopId)
                  }
                />
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
};
