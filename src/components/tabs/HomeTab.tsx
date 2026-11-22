import React, { Suspense, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { SmartSearchHero } from '../SmartSearchHero';
import { PlannedJourneysPanel } from '../PlannedJourneysPanel';
import { RecommendedRouteCard } from '../RecommendedRouteCard';
import { SavedRoutesSection } from '../SavedRoutesSection';
import { MapCanvasSkeleton } from '../maps/MapCanvasSkeleton';
import { cn, StatusDot } from '../ui/primitives';

// Contextual On-Demand Map: Loaded ONLY if the user explicitly clicks "View Route on Map"
const LazyUnifiedTransitMap = React.lazy(
  () => import('../maps/UnifiedTransitMap')
);

/**
 * Minimal, High-Usability Home Landing Page ("Where is my BUS"):
 * - Origin -> Destination Journey Search right at the top of the main page
 * - Multi-time-slot Journey Recommendations when Origin & Destination are selected
 * - Quick-access horizontal swipe cards for Saved/Favorite Routes
 * - Fluid < 380px responsive Recommended Routes cards (by live GPS / active station location)
 * - One-tap "Search All Bus Routes ->" shortcut switching to Tab 2
 * - ZERO default map rendered or imported unless requested on demand
 */
export const HomeTab: React.FC = () => {
  const {
    city,
    userGeo,
    activeStation,
    nearestStop,
    filteredRoutes,
    favoriteRoutes,
    previewJourney,
    isLoadingRoutes,
    apiError,
    refreshLiveTransitData,
    setActiveTab,
    lastUpdatedTimestamp,
  } = useTransit();

  const [showJourneyMapModal, setShowJourneyMapModal] = useState<boolean>(false);

  // Top recommended commuter routes (lightweight curated slice for fast scanning)
  const recommendedRoutes = useMemo(
    () => filteredRoutes.slice(0, 6),
    [filteredRoutes]
  );

  const locationContextLabel =
    activeStation?.name ||
    nearestStop?.name ||
    userGeo.addressLabel ||
    city.name;

  const getRankBadge = (idx: number, headway?: number): string | undefined => {
    if (idx === 0) return 'Top Pick';
    if (idx === 1) return 'Fastest';
    if (headway && headway <= 10) return 'High Frequency';
    return undefined;
  };

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 px-3.5 py-4 sm:px-6 sm:py-6 space-y-5 sm:space-y-6 pb-24 md:pb-12">
      {/* 1. Origin -> Destination Search Card on Main Page */}
      <div className="w-full max-w-full rounded-xl border border-border bg-card shadow-subtle">
        <SmartSearchHero />
      </div>

      {/* Multi-Time-Slot Door-to-Door Route Recommendations (shown when From & To are selected) */}
      <PlannedJourneysPanel
        onPreviewMapRequested={() => setShowJourneyMapModal(true)}
      />

      {/* 2. Quick-Access Saved / Favorite Routes (Horizontal Swipe Cards) */}
      {favoriteRoutes.length > 0 ? (
        <SavedRoutesSection variant="compact" />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-300 bg-card dark:border-zinc-800 px-3.5 py-3 text-xs text-zinc-700 dark:text-zinc-400 shadow-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <Star className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="min-w-0 break-words">
              Tap the{' '}
              <strong className="font-semibold text-zinc-950 dark:text-zinc-100">
                star icon
              </strong>{' '}
              on any bus card to pin quick-access favorites here.
            </span>
          </div>
        </div>
      )}

      {/* Network Retry Alert (only if offline/degraded) */}
      {apiError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/50 px-4 py-3 text-amber-950 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 text-xs font-medium min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="break-words">{apiError}</span>
          </div>
          <button
            type="button"
            onClick={refreshLiveTransitData}
            className="min-h-[40px] shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. Recommended Routes Section (Location-Based Default Cards) */}
      <section
        aria-label="Recommended routes"
        className="w-full max-w-full min-w-0 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950 dark:text-white truncate">
                Recommended Routes
              </h2>
            </div>
            {locationContextLabel && (
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 truncate">
                Near {locationContextLabel}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 tabular-nums">
              <StatusDot tone="live" pulse />
              <span>
                {lastUpdatedTimestamp.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
            <button
              type="button"
              onClick={refreshLiveTransitData}
              aria-label="Refresh live bus arrivals"
              title="Refresh live bus arrivals"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-700 shadow-subtle transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isLoadingRoutes && 'animate-spin')}
              />
            </button>
          </div>
        </div>

        {isLoadingRoutes ? (
          <div
            className="w-full max-w-full min-w-0 space-y-3"
            aria-busy="true"
            aria-label="Loading recommended routes"
          >
            {[0, 1, 2].map((sk) => (
              <div
                key={sk}
                className="h-[168px] w-full max-w-full overflow-hidden animate-pulse rounded-xl border border-border bg-card p-4 shadow-subtle flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-14 shrink-0 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                    <div className="space-y-2 min-w-0">
                      <div className="h-4 w-44 max-w-[55vw] rounded bg-zinc-200 dark:bg-zinc-800" />
                      <div className="h-3 w-32 max-w-[42vw] rounded bg-zinc-200/80 dark:bg-zinc-800" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-5 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800" />
                  <div className="h-5 w-24 rounded bg-zinc-200/80 dark:bg-zinc-800" />
                </div>
                <div className="h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
              </div>
            ))}
          </div>
        ) : recommendedRoutes.length > 0 ? (
          <div className="w-full max-w-full min-w-0 space-y-3">
            {recommendedRoutes.map((route, idx) => (
              <RecommendedRouteCard
                key={route.id}
                route={route}
                rankBadge={getRankBadge(idx, route.headwayMinutes)}
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-full rounded-xl border border-border bg-card p-8 text-center shadow-subtle">
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              No immediate departures at this stop
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Use Search &amp; Routes to look up any bus number or corridor across{' '}
              {city.name}.
            </p>
          </div>
        )}
      </section>

      {/* 4. One-Tap Shortcut Button -> Switches to Tab 2 (Search & Routes) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className="flex min-h-[52px] w-full max-w-full items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-zinc-950 px-4 sm:px-5 py-3.5 text-left text-sm font-semibold text-white shadow-card transition-all hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-100"
        >
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <Search className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="truncate">Search All Bus Routes</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 tabular-nums shrink-0">
            <span>{filteredRoutes.length}+ lines</span>
            <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

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
