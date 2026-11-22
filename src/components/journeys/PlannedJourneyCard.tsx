import React from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Footprints,
  Map as MapIcon,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { PlannedJourney } from '../../types/transit';
import {
  formatDurationMinutes,
  formatIsoToIndianTime,
  formatMeters,
} from '../../utils/transitHelpers';
import { parseTransitTimestampMs } from '../../utils/transitTimeEngine';
import { Badge, cn, StatusDot } from '../ui/primitives';

export interface PlannedJourneyCardProps {
  plan: PlannedJourney;
  isFeaturedTop: boolean;
  isExpanded: boolean;
  isMapPreviewed: boolean;
  onToggleExpand: () => void;
  onPreviewMap: () => void;
  onOpenLegTracking: (
    tripId: string,
    routeShortName?: string,
    operator?: string
  ) => void;
}

function computeTransferWaitMinutes(
  legs: PlannedJourney['legs'],
  legIndex: number
): number {
  const leg = legs[legIndex];
  if (leg.mode === 'WALK' || legIndex === 0) return 0;

  const prevTransitIdx =
    legs
      .slice(0, legIndex)
      .map((pl, pI) => (pl.mode !== 'WALK' ? pI : -1))
      .filter((pI) => pI >= 0)
      .pop() ?? -1;

  if (prevTransitIdx < 0) return 0;

  const prevTransit = legs[prevTransitIdx];
  const rawSpanSec =
    (parseTransitTimestampMs(leg.startTimeIso) -
      parseTransitTimestampMs(prevTransit.endTimeIso)) /
    1000;
  const interWalkSec = legs
    .slice(prevTransitIdx + 1, legIndex)
    .reduce((acc, wl) => acc + wl.durationSec, 0);

  return Math.max(0, Math.round((rawSpanSec - interWalkSec) / 60));
}

/**
 * Displays a single recommended transit itinerary card with proportional leg bar,
 * leg chain pills, expandable step-by-step guide, and map preview trigger.
 */
export const PlannedJourneyCard: React.FC<PlannedJourneyCardProps> = ({
  plan,
  isFeaturedTop,
  isExpanded,
  isMapPreviewed,
  onToggleExpand,
  onPreviewMap,
  onOpenLegTracking,
}) => {
  const travelMins = Math.max(1, Math.round(plan.durationSec / 60));
  const walkMins = Math.max(1, Math.round(plan.walkingDurationSec / 60));
  const transferWaitMin = Math.round(plan.transferWaitSeconds / 60);
  const isNearestSlot = (plan.scheduleBand || 'nearest') === 'nearest';
  const slotLabel =
    plan.scheduleBandLabel || (isNearestSlot ? 'Nearest' : 'Scheduled');

  const totalBarSec = Math.max(
    60,
    plan.legs.reduce((acc, l) => acc + Math.max(45, l.durationSec), 0)
  );

  return (
    <div
      className={cn(
        'w-full max-w-full min-w-0 overflow-hidden rounded-xl border bg-card p-3.5 sm:p-4 transition-all',
        isMapPreviewed
          ? 'border-zinc-900 ring-1 ring-zinc-900/10 dark:border-emerald-500/70 dark:ring-emerald-500/15'
          : isFeaturedTop
          ? 'border-zinc-300 dark:border-zinc-700 shadow-subtle'
          : 'border-border hover:border-zinc-300 dark:hover:border-zinc-700'
      )}
    >
      {/* Top Badges + Schedule Time-Slot Pill */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
          <Badge variant={isNearestSlot ? 'live' : 'subtle'}>
            {isNearestSlot && <StatusDot tone="live" pulse />}
            <span>{slotLabel}</span>
          </Badge>
          {plan.badges.map((badge) => {
            const isBest = badge === 'Best match';
            const isLive = badge === 'Live GPS';
            return (
              <Badge
                key={badge}
                variant={isBest ? 'primary' : isLive ? 'live' : 'subtle'}
              >
                {isLive && <StatusDot tone="live" />}
                <span>{badge}</span>
              </Badge>
            );
          })}
        </div>

        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">
          {plan.recommendationScore}% match
        </span>
      </div>

      {/* Main Time, Duration & Fare Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 tabular-nums">
            <span className="text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
              {formatIsoToIndianTime(plan.startTimeIso)}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-500 shrink-0" />
            <span className="text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
              {formatIsoToIndianTime(plan.endTimeIso)}
            </span>
            {isNearestSlot ? (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {plan.waitMinutesBeforeStart <= 1
                  ? '· Leaving now'
                  : `· Leave in ${plan.waitMinutesBeforeStart} min`}
              </span>
            ) : (
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                · {slotLabel} bus
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">
            <span className="font-medium text-zinc-800 dark:text-zinc-300">
              {plan.transfers === 0
                ? 'Direct'
                : `${plan.transfers} transfer${plan.transfers > 1 ? 's' : ''}${
                    transferWaitMin > 0 ? ` (${transferWaitMin}m wait)` : ''
                  }`}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Footprints className="h-3 w-3 text-zinc-500 dark:text-zinc-500 shrink-0" />
              {formatMeters(plan.totalWalkingMeters)} walk (~{walkMins} min)
            </span>
          </div>
        </div>

        {/* Right: Total Travel Duration + Fare */}
        <div className="flex items-center justify-between sm:flex-col sm:items-end border-t border-border pt-2 sm:border-t-0 sm:pt-0 shrink-0 tabular-nums">
          <div className="text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
            {formatDurationMinutes(travelMins)}
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            {plan.estimatedFareInr > 0 ? (
              <>
                <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                  ₹{plan.estimatedFareInr}
                </span>
                {plan.womenFreeFareInr === 0 && (
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {' '}
                    · Women ₹0
                  </span>
                )}
              </>
            ) : (
              <span>Walk only</span>
            )}
          </div>
        </div>
      </div>

      {/* Crisp 4px Proportional Leg Bar */}
      <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 gap-0.5">
        {plan.legs.map((leg, lIdx) => {
          const pct = Math.max(
            6,
            Math.round((Math.max(45, leg.durationSec) / totalBarSec) * 100)
          );
          const isWalk = leg.mode === 'WALK';
          const barColor = isWalk
            ? 'bg-zinc-400 dark:bg-zinc-600'
            : leg.isElectric
            ? 'bg-emerald-600 dark:bg-emerald-500'
            : lIdx % 2 === 0
            ? 'bg-zinc-900 dark:bg-zinc-200'
            : 'bg-zinc-600 dark:bg-zinc-400';
          return (
            <div
              key={lIdx}
              style={{ width: `${pct}%` }}
              title={`${leg.routeShortName || leg.mode}: ${Math.round(
                leg.durationSec / 60
              )} min`}
              className={cn('h-full rounded-full', barColor)}
            />
          );
        })}
      </div>

      {/* Compact Leg Chain */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 max-w-full overflow-hidden">
        {plan.legs.map((leg, idx) => {
          const isWalk = leg.mode === 'WALK';
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <ArrowRight className="h-3 w-3 text-zinc-400 dark:text-zinc-600 shrink-0" />
              )}
              {isWalk ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700/80 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
                  <Footprints className="h-3 w-3 text-zinc-500 dark:text-zinc-500 shrink-0" />
                  {formatMeters(leg.distanceMeters)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (leg.tripId) {
                      onOpenLegTracking(
                        leg.tripId,
                        leg.routeShortName,
                        leg.operator || leg.agencyName
                      );
                    }
                  }}
                  className="inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-950 dark:text-zinc-100 transition-colors hover:border-zinc-400 hover:bg-zinc-200/80 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 tabular-nums"
                >
                  {leg.isElectric && (
                    <Zap className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="truncate max-w-[160px] sm:max-w-[220px]">
                    {leg.operator ? `${leg.operator} ` : ''}
                    {leg.routeShortName || leg.mode}
                  </span>
                  <span className="font-normal text-zinc-600 dark:text-zinc-400 shrink-0">
                    · {leg.stopCount} stops
                  </span>
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Card Footer: Step-by-Step Disclosure + On-Demand Map Preview */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={onToggleExpand}
          className="inline-flex min-h-[48px] items-center gap-1 px-2 text-xs font-semibold text-zinc-700 dark:text-zinc-400 transition-colors hover:text-zinc-950 dark:hover:text-white"
        >
          <span>{isExpanded ? 'Hide steps' : 'Journey steps'}</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          aria-pressed={isMapPreviewed}
          onClick={onPreviewMap}
          className={cn(
            'inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors',
            isMapPreviewed
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950'
              : 'border-zinc-300 bg-zinc-100 text-zinc-900 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white'
          )}
        >
          <MapIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>View Route on Map</span>
        </button>
      </div>

      {/* Expanded Chronological Step Guide */}
      {isExpanded && (
        <div className="mt-3 rounded-lg border border-border bg-zinc-50/70 dark:bg-zinc-900/60 p-3.5 space-y-3">
          {plan.legs.map((leg, idx) => {
            const isWalk = leg.mode === 'WALK';
            const legMin = Math.max(1, Math.round(leg.durationSec / 60));
            const waitBeforeThisTransitMin = computeTransferWaitMinutes(
              plan.legs,
              idx
            );

            return (
              <React.Fragment key={idx}>
                {waitBeforeThisTransitMin > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-200/80 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 tabular-nums">
                    <RefreshCw className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="break-words">
                      Transfer at{' '}
                      <strong className="font-semibold">{leg.fromName}</strong> ·{' '}
                      {waitBeforeThisTransitMin} min connection
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-2.5 text-xs">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <span className="mt-0.5 w-16 shrink-0 font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {formatIsoToIndianTime(leg.startTimeIso)}
                    </span>
                    <div className="min-w-0 flex-1">
                      {isWalk ? (
                        <p className="text-zinc-600 dark:text-zinc-300 tabular-nums break-words">
                          Walk{' '}
                          <strong className="font-medium text-zinc-900 dark:text-white">
                            {formatMeters(leg.distanceMeters)}
                          </strong>{' '}
                          (~{legMin} min) to{' '}
                          <span className="font-medium text-zinc-900 dark:text-white">
                            {leg.toName}
                          </span>
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-zinc-900 dark:bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:text-zinc-950 tabular-nums">
                              {leg.operator || 'Transit'} {leg.routeShortName}
                            </span>
                            {leg.serviceType && (
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {leg.serviceType}
                              </span>
                            )}
                            {leg.delayMinutes && leg.delayMinutes > 0 ? (
                              <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400 tabular-nums">
                                · +{leg.delayMinutes}m delay
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                · {leg.realTime ? 'Live GPS' : 'On schedule'}
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100 break-words">
                            {leg.fromName}
                            {leg.fromStopCode ? ` (#${leg.fromStopCode})` : ''}{' '}
                            → {leg.toName}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums break-words">
                            {leg.stopCount} stops · {legMin} min ride
                            {leg.fareInr ? ` · ₹${leg.fareInr}` : ''}
                            {leg.headsign ? ` · Twd ${leg.headsign}` : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isWalk && leg.tripId && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenLegTracking(
                          leg.tripId!,
                          leg.routeShortName,
                          leg.operator || leg.agencyName
                        )
                      }
                      className="shrink-0 rounded-md bg-zinc-900 dark:bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-emerald-400"
                    >
                      Track
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
