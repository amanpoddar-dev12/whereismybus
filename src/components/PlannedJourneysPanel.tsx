import React, { useMemo, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import {
  PlannedJourney,
  RecommendationPreference,
  ScheduleTimeBand,
} from '../types/transit';
import { formatIsoToIndianTime } from '../utils/transitHelpers';
import { parseTransitTimestampMs } from '../utils/transitTimeEngine';
import { PlannedJourneyCard } from './journeys/PlannedJourneyCard';
import { Badge, cn, SegmentedTabs } from './ui/primitives';

interface PlannedJourneysPanelProps {
  onPreviewMapRequested?: () => void;
}

export const PlannedJourneysPanel: React.FC<PlannedJourneysPanelProps> = ({
  onPreviewMapRequested,
}) => {
  const {
    plannedJourneys,
    isPlanningJourney,
    originCoords,
    destinationCoords,
    departureTimeMode,
    customDepartureIso,
    recommendationPreference,
    setRecommendationPreference,
    previewJourneyId,
    setPreviewJourneyId,
    openPlannedLegTracking,
  } = useTransit();

  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<'all' | ScheduleTimeBand>('all');
  const [showAllInBand, setShowAllInBand] = useState<boolean>(false);

  const bandCounts = useMemo(() => {
    const counts: Record<ScheduleTimeBand, number> = {
      nearest: 0,
      morning: 0,
      afternoon: 0,
      evening: 0,
      night: 0,
    };
    for (const p of plannedJourneys) {
      const b = p.scheduleBand || 'nearest';
      counts[b] += 1;
    }
    return counts;
  }, [plannedJourneys]);

  // Curate balanced multi-slot display when "All slots" is selected:
  // Top nearest-time routes + top routes from Morning, Afternoon, Evening, and Night!
  const { nearestList, otherSlotsList, filteredSingleBandList } = useMemo(() => {
    const nearest = plannedJourneys.filter(
      (p) => (p.scheduleBand || 'nearest') === 'nearest'
    );
    const others = plannedJourneys.filter(
      (p) => (p.scheduleBand || 'nearest') !== 'nearest'
    );

    if (selectedBand !== 'all') {
      const bandItems = plannedJourneys.filter(
        (p) => (p.scheduleBand || 'nearest') === selectedBand
      );
      return {
        nearestList: [] as PlannedJourney[],
        otherSlotsList: [] as PlannedJourney[],
        filteredSingleBandList: bandItems,
      };
    }

    // Pick top 2 per future band first so Morning, Afternoon, Evening & Night are all represented!
    const bandsOrder: Array<Exclude<ScheduleTimeBand, 'nearest'>> = [
      'morning',
      'afternoon',
      'evening',
      'night',
    ];
    const pickedOtherIds = new Set<string>();
    const diverseOthers: PlannedJourney[] = [];

    for (const band of bandsOrder) {
      const inBand = others.filter((p) => p.scheduleBand === band);
      for (const item of inBand.slice(0, showAllInBand ? 6 : 2)) {
        if (!pickedOtherIds.has(item.id)) {
          pickedOtherIds.add(item.id);
          diverseOthers.push(item);
        }
      }
    }

    // Sort other-slot recommendations chronologically by departure time so the day timeline reads naturally
    diverseOthers.sort(
      (a, b) =>
        parseTransitTimestampMs(a.startTimeIso) -
        parseTransitTimestampMs(b.startTimeIso)
    );

    return {
      nearestList: showAllInBand ? nearest : nearest.slice(0, 3),
      otherSlotsList: diverseOthers,
      filteredSingleBandList: [] as PlannedJourney[],
    };
  }, [plannedJourneys, selectedBand, showAllInBand]);

  if (!originCoords || !destinationCoords) return null;

  const prefTabs: Array<{
    id: RecommendationPreference;
    label: string;
  }> = [
    { id: 'smart_best', label: 'Best' },
    { id: 'fastest', label: 'Fastest' },
    { id: 'direct_only', label: 'Direct' },
    { id: 'lowest_fare', label: 'Lowest fare' },
    { id: 'least_walk', label: 'Least walk' },
  ];

  const timeSlotPills: Array<{
    id: 'all' | ScheduleTimeBand;
    label: string;
    subHint?: string;
    count: number;
  }> = [
    { id: 'all', label: 'All times', count: plannedJourneys.length },
    { id: 'nearest', label: 'Nearest', subHint: 'Now', count: bandCounts.nearest },
    { id: 'morning', label: 'Morning', subHint: '6–12', count: bandCounts.morning },
    { id: 'afternoon', label: 'Afternoon', subHint: '12–5', count: bandCounts.afternoon },
    { id: 'evening', label: 'Evening', subHint: '5–9', count: bandCounts.evening },
    { id: 'night', label: 'Night', subHint: '9 PM+', count: bandCounts.night },
  ];

  const effectiveActiveBand =
    selectedBand !== 'all' && bandCounts[selectedBand] === 0
      ? 'all'
      : selectedBand;

  return (
    <section
      aria-label="Recommended itineraries"
      className="w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3.5 sm:p-5 shadow-card space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 min-w-0">
        <div className="min-w-0 max-w-full flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
              Recommended routes
            </h2>
            <Badge variant="subtle" className="tabular-nums">
              {departureTimeMode === 'now' || !customDepartureIso
                ? 'Leaving now'
                : `${
                    departureTimeMode === 'arrive_by' ? 'Arrive by' : 'Depart'
                  } ${formatIsoToIndianTime(customDepartureIso)}`}
            </Badge>
          </div>
          <p className="truncate max-w-full text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            {originCoords.label} → {destinationCoords.label}
          </p>
        </div>

        {isPlanningJourney && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Calculating schedules…</span>
          </span>
        )}
      </div>

      {/* Preference + Time-Slot Controls */}
      {plannedJourneys.length > 0 && (
        <div className="space-y-2.5 w-full max-w-full min-w-0">
          {plannedJourneys.length > 1 && (
            <SegmentedTabs
              ariaLabel="Optimization preference"
              options={prefTabs}
              value={recommendationPreference}
              onChange={setRecommendationPreference}
              size="xs"
            />
          )}

          {/* Full-Day IST Schedule Time-Slot Filter Pills */}
          <div
            role="tablist"
            aria-label="Departure time slots"
            className="flex w-full max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
          >
            <Clock className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-500 shrink-0 mr-0.5" />
            {timeSlotPills
              .filter((pill) => pill.id === 'all' || pill.count > 0)
              .map((pill) => {
                const isSelected = effectiveActiveBand === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setSelectedBand(pill.id);
                      setShowAllInBand(false);
                    }}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums',
                      isSelected
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white'
                    )}
                  >
                    <span>{pill.label}</span>
                    {pill.subHint && !isSelected && (
                      <span className="text-[10px] font-normal text-zinc-600 dark:text-zinc-500">
                        {pill.subHint}
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded px-1 py-0.2 text-[10px] font-semibold',
                        isSelected
                          ? 'bg-white/20 text-white dark:bg-zinc-950/15 dark:text-zinc-950'
                          : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                      )}
                    >
                      {pill.count}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isPlanningJourney && plannedJourneys.length === 0 && (
        <div className="space-y-2.5">
          {[0, 1].map((sk) => (
            <div
              key={sk}
              className="animate-pulse rounded-xl border border-border bg-zinc-50 dark:bg-zinc-900/40 p-4 space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-4 w-40 max-w-[55vw] rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex gap-2">
                <div className="h-6 w-24 rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-6 w-28 rounded-md bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isPlanningJourney && plannedJourneys.length === 0 && (
        <div className="rounded-lg border border-zinc-300 bg-zinc-100/80 dark:border-border dark:bg-zinc-900/60 px-3.5 py-3 text-xs text-zinc-700 dark:text-zinc-400">
          No scheduled direct or single-transfer connection found between these stops for the selected time. Adjust your departure time or check nearby departures below.
        </div>
      )}

      {/* Ranked Itinerary Cards (Nearest + All Other Time-of-Day Schedule Slots) */}
      {plannedJourneys.length > 0 && (() => {
        const renderJourneyCard = (plan: PlannedJourney, isFeaturedTop: boolean) => {
          const isExpanded =
            expandedPlanId === plan.id ||
            (isFeaturedTop && expandedPlanId === null && plannedJourneys.length === 1);
          return (
            <PlannedJourneyCard
              key={plan.id}
              plan={plan}
              isFeaturedTop={isFeaturedTop}
              isExpanded={isExpanded}
              isMapPreviewed={previewJourneyId === plan.id}
              onToggleExpand={() =>
                setExpandedPlanId(isExpanded ? '__closed__' : plan.id)
              }
              onPreviewMap={() => {
                setPreviewJourneyId(plan.id);
                onPreviewMapRequested?.();
              }}
              onOpenLegTracking={openPlannedLegTracking}
            />
          );
        };

        if (effectiveActiveBand !== 'all') {
          const visible = showAllInBand
            ? filteredSingleBandList
            : filteredSingleBandList.slice(0, 6);
          return (
            <div className="space-y-2.5">
              {visible.map((plan, idx) => renderJourneyCard(plan, idx === 0))}
              {filteredSingleBandList.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllInBand((prev) => !prev)}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-100 dark:border-border dark:bg-zinc-900 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-300 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  {showAllInBand
                    ? 'Show fewer options'
                    : `Show all ${filteredSingleBandList.length} options in this time slot`}
                </button>
              )}
            </div>
          );
        }

        const totalShown = nearestList.length + otherSlotsList.length;
        return (
          <div className="space-y-4">
            {/* 1. Nearest / Immediate Departures */}
            {nearestList.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  <span>Leaving soon · Nearest buses</span>
                  <span className="tabular-nums">{bandCounts.nearest} available</span>
                </div>
                {nearestList.map((plan, idx) =>
                  renderJourneyCard(plan, idx === 0)
                )}
              </div>
            )}

            {/* 2. Other Time-of-Day Schedule Recommendations (Morning, Afternoon, Evening, Night) */}
            {otherSlotsList.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-zinc-500 dark:text-zinc-500 shrink-0" />
                    <span>Other time slots · Full-day schedule</span>
                  </span>
                  <span className="tabular-nums">
                    Morning · Afternoon · Evening · Night
                  </span>
                </div>
                {otherSlotsList.map((plan, idx) =>
                  renderJourneyCard(plan, nearestList.length === 0 && idx === 0)
                )}
              </div>
            )}

            {plannedJourneys.length > totalShown && !showAllInBand && (
              <button
                type="button"
                onClick={() => setShowAllInBand(true)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-100 dark:border-border dark:bg-zinc-900 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-300 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                View all {plannedJourneys.length} full-day bus schedules
              </button>
            )}
            {showAllInBand && plannedJourneys.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllInBand(false)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-100 dark:border-border dark:bg-zinc-900 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-300 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                Show compact view
              </button>
            )}
          </div>
        );
      })()}
    </section>
  );
};
