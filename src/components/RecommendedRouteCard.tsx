import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock,
  MapPin,
  Star,
  Zap,
} from 'lucide-react';
import { BusRoute } from '../types/transit';
import { useTransit } from '../context/TransitContext';
import {
  calculateRouteFare,
  formatAccurateEta,
  formatMeters,
  getCrowdBadgeMeta,
  inferBusServiceCategory,
} from '../utils/transitHelpers';
import { Badge, cn, StatusDot } from './ui/primitives';

export interface RecommendedRouteCardProps {
  route: BusRoute;
  rankBadge?: string;
  onTrackSelected?: () => void;
}

/**
 * Fluid, mobile-first Recommended Route Card engineered for < 380px screens and live GTFS/OSM location routes:
 * - Zero horizontal overflow (`w-full max-w-full min-w-0 overflow-hidden`)
 * - Bounded Bus Number plate (`w-[62px] sm:w-[70px] max-w-[74px]`) so long GTFS route codes never crush corridor text
 * - Graceful `[overflow-wrap:anywhere]` line-wrapping + tap-to-preview full Origin -> Destination names
 * - Overflow-safe boarding stop & secondary badge wrapping
 * - Width-locked horizontal departure strip (`w-full max-w-full md:flex-1 min-w-0`) + >= 48x48px WCAG touch targets
 */
export const RecommendedRouteCard: React.FC<RecommendedRouteCardProps> = ({
  route,
  rankBadge,
  onTrackSelected,
}) => {
  const {
    originQuery,
    destinationQuery,
    trackBusRoute,
    isRouteSaved,
    toggleSavedRoute,
  } = useTransit();

  const [expandFullCorridor, setExpandFullCorridor] = useState<boolean>(false);

  const currentBus = route.buses[0];
  if (!currentBus) return null;

  const saved = isRouteSaved(route.id);
  const category = inferBusServiceCategory(route);
  const dynamicFare = calculateRouteFare(
    route,
    originQuery || route.boardingStopName,
    route.matchedDestStopName || destinationQuery
  );
  const currentCrowd = getCrowdBadgeMeta(
    currentBus.crowdLevel,
    currentBus.crowdPercent
  );
  const isDelayed = currentBus.delayMinutes > 2;
  const etaDisplay = formatAccurateEta(
    currentBus.etaMinutes,
    currentBus.arrivalIso,
    currentBus.isTomorrow
  );

  const topBadge =
    rankBadge ||
    (route.matchedDestStopName
      ? `Direct to ${route.matchedDestStopName}`
      : route.recommendationBadge === 'Recommended'
      ? 'Recommended'
      : undefined);

  const handleOpenTimeline = (busIdx = 0) => {
    trackBusRoute(route, busIdx, false);
    onTrackSelected?.();
  };

  return (
    <article
      className={cn(
        'w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3.5 sm:p-4 shadow-subtle transition-all',
        route.matchedDestStopName
          ? 'border-zinc-900 ring-1 ring-zinc-900/5 dark:border-emerald-500/60 dark:ring-emerald-500/10'
          : 'hover:border-zinc-300 dark:hover:border-zinc-700'
      )}
    >
      {/* Responsive Primary Row: Stacks cleanly on phones (< 640px), aligns side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3 w-full min-w-0">
        {/* Left: Bounded Bus Number Plate + Wrapping Corridor Details */}
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={() => handleOpenTimeline(0)}
            aria-label={`Open bus ${route.routeNumber} live timeline`}
            title={`${route.operator} ${route.routeNumber}`}
            className="flex min-h-[48px] w-[62px] sm:w-[70px] max-w-[74px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-950 px-2 py-1.5 text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-100"
          >
            <span className="max-w-full truncate text-xs sm:text-sm font-semibold tracking-tight leading-none tabular-nums">
              {route.routeNumber}
            </span>
            <span className="mt-1 max-w-full truncate text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {route.operator}
            </span>
          </button>

          <div className="min-w-0 flex-1 overflow-hidden">
            {/* Origin -> Destination: wraps cleanly on narrow screens (< 380px), tap for full preview */}
            <button
              type="button"
              onClick={() => setExpandFullCorridor((prev) => !prev)}
              title={`${route.origin} → ${route.destination}`}
              className="block w-full max-w-full text-left focus:outline-none group"
            >
              <h3
                className={cn(
                  'text-xs sm:text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 leading-snug [overflow-wrap:anywhere] group-hover:text-zinc-700 dark:group-hover:text-zinc-300',
                  !expandFullCorridor && 'line-clamp-2'
                )}
              >
                <span>{route.origin}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="mx-1 inline h-3 w-3 sm:h-3.5 sm:w-3.5 -mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-500"
                />
                <span>{route.destination}</span>
              </h3>
            </button>

            {/* Boarding Stop & Walking Distance (strictly bounded for long location stop names) */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs text-zinc-600 dark:text-zinc-400 min-w-0 max-w-full overflow-hidden">
              <span className="flex items-center gap-1 min-w-0 max-w-full overflow-hidden">
                <MapPin className="h-3 w-3 text-zinc-500 dark:text-zinc-500 shrink-0" />
                <span className="truncate">
                  Board{' '}
                  <strong className="font-medium text-zinc-900 dark:text-zinc-200">
                    {route.boardingStopName}
                  </strong>
                </span>
              </span>

              {route.walkingMetersToBoarding !== undefined &&
                route.walkingMetersToBoarding > 25 && (
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400 shrink-0">
                    · {formatMeters(route.walkingMetersToBoarding)} (
                    {route.walkingMinutesToBoarding}m walk)
                  </span>
                )}
            </div>
          </div>
        </div>

        {/* Right (or compact bar on < 640px): Live ETA + Stage Fare */}
        <div className="flex flex-wrap items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-x-2 gap-y-0.5 border-t border-border pt-2 sm:border-t-0 sm:pt-0 shrink-0 tabular-nums">
          <div className="inline-flex items-center gap-1.5">
            {!currentBus.isTomorrow && (
              <StatusDot
                tone={isDelayed ? 'danger' : 'live'}
                pulse={!isDelayed}
              />
            )}
            <span
              className={cn(
                'text-sm sm:text-base font-semibold tracking-tight',
                currentBus.isTomorrow
                  ? 'text-zinc-900 dark:text-zinc-100'
                  : isDelayed
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              )}
            >
              {etaDisplay.primary}
            </span>
          </div>

          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            <span>{etaDisplay.subLabel}</span>
            {isDelayed && !currentBus.isTomorrow && (
              <span className="text-rose-600 dark:text-rose-400">
                {' '}
                · +{currentBus.delayMinutes}m
              </span>
            )}
            <span className="text-zinc-400 dark:text-zinc-600"> · </span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-100">
              ₹{dynamicFare}
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Wrapping Badges Line: Frequency, Category, Women Scheme, Occupancy */}
      <div className="mt-2.5 sm:mt-3 flex flex-wrap items-center gap-1.5 text-[11px] max-w-full overflow-hidden">
        {topBadge && (
          <Badge variant="primary" className="max-w-[220px]">
            <span className="truncate">{topBadge}</span>
          </Badge>
        )}

        <Badge
          variant={category === 'AC' || category === 'Electric' ? 'live' : 'subtle'}
          className="max-w-[180px]"
        >
          {route.isElectric && (
            <Zap className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="truncate">
            {category === 'Ordinary' ? route.serviceType : category}
          </span>
        </Badge>

        {route.headwayMinutes && (
          <Badge variant="subtle">
            <Clock className="h-3 w-3 shrink-0 text-zinc-600 dark:text-zinc-400" />
            <span className="tabular-nums">Every {route.headwayMinutes} min</span>
          </Badge>
        )}

        {route.travelTimeToDestMin && (
          <Badge variant="subtle">
            <span className="tabular-nums">~{route.travelTimeToDestMin}m ride</span>
          </Badge>
        )}

        {route.womenFreeEligible && route.womenSchemeName && (
          <Badge variant="subtle" className="max-w-[200px]">
            <span className="truncate">{route.womenSchemeName}</span>
          </Badge>
        )}

        <Badge variant="subtle">
          <StatusDot tone={currentCrowd.tone} />
          <span className="tabular-nums">{currentCrowd.shortLabel}</span>
        </Badge>
      </div>

      {/* Upcoming Departures + WCAG >= 48x48px Action Row */}
      <div className="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5 border-t border-border pt-2.5 w-full min-w-0">
        {/* Next Scheduled Departures Strip (strictly width-constrained so 3+ chips never stretch mobile cards) */}
        <div className="flex w-full max-w-full md:flex-1 min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 shrink-0">
            Next:
          </span>
          {route.buses.slice(0, 3).map((bus, idx) => {
            const slotEta = formatAccurateEta(
              bus.etaMinutes,
              bus.arrivalIso,
              bus.isTomorrow
            );
            return (
              <button
                key={bus.tripId}
                type="button"
                onClick={() => handleOpenTimeline(idx)}
                className={cn(
                  'min-h-[36px] shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums',
                  idx === 0
                    ? 'border-zinc-400 bg-zinc-100 text-zinc-950 font-semibold dark:border-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-100'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
                )}
              >
                {bus.isTomorrow
                  ? `${slotEta.primary} (tmw)`
                  : `${slotEta.compact} · ${slotEta.subLabel}`}
              </button>
            );
          })}
        </div>

        {/* Strict 48x48px Touch Targets: Bookmark Star + Track Bus CTA */}
        <div className="flex w-full md:w-auto items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={
              saved
                ? `Remove bus ${route.routeNumber} from saved routes`
                : `Save bus ${route.routeNumber} to favorites`
            }
            title={saved ? 'Saved in Favorites' : 'Save Route'}
            onClick={() => toggleSavedRoute(route)}
            className={cn(
              'flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100',
              saved
                ? 'border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-400'
                : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
            )}
          >
            <Star className={cn('h-4 w-4', saved && 'fill-current')} />
          </button>

          <button
            type="button"
            onClick={() => handleOpenTimeline(0)}
            className="inline-flex h-12 min-h-[48px] flex-1 md:flex-initial items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-emerald-400"
          >
            <span>Track Bus</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </button>
        </div>
      </div>
    </article>
  );
};
