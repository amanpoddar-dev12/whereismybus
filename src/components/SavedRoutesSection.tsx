import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  GripVertical,
  Star,
  Trash2,
  Tag,
  Check,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { SavedFavoriteRoute } from '../types/transit';
import { formatAccurateEta } from '../utils/transitHelpers';
import { Badge, cn, StatusDot } from './ui/primitives';

interface SavedRoutesSectionProps {
  variant?: 'compact' | 'full';
  onRouteOpened?: () => void;
}

export const SavedRoutesSection: React.FC<SavedRoutesSectionProps> = ({
  variant = 'compact',
  onRouteOpened,
}) => {
  const {
    favoriteRoutes,
    routes,
    trackBusRoute,
    removeFavoriteRoute,
    reorderFavoriteRoutes,
    moveFavoriteRoute,
    updateFavoriteLabel,
    setActiveTab,
  } = useTransit();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [swipedRouteId, setSwipedRouteId] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState<string>('');

  const touchStartXRef = useRef<number | null>(null);

  if (favoriteRoutes.length === 0 && variant === 'compact') {
    return null;
  }

  const resolveLiveRoute = (fav: SavedFavoriteRoute) => {
    return (
      routes.find((r) => r.id === fav.routeId) ||
      routes.find(
        (r) =>
          r.routeNumber.toUpperCase() === fav.routeNumber.toUpperCase() &&
          r.operator.toUpperCase() === fav.operator.toUpperCase()
      ) ||
      fav.routeSnapshot
    );
  };

  const handleLaunchRoute = (fav: SavedFavoriteRoute) => {
    const live = resolveLiveRoute(fav);
    trackBusRoute(live, 0);
    onRouteOpened?.();
  };

  if (variant === 'compact') {
    return (
      <section aria-label="Saved favorite routes" className="w-full max-w-full min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-400">
              Saved Favorites ({favoriteRoutes.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className="min-h-[44px] px-2.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            Manage
          </button>
        </div>

        <div className="flex w-full max-w-full snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {favoriteRoutes.map((fav) => {
            const live = resolveLiveRoute(fav);
            const activeBus = live.buses[0];
            const isDelayed = (activeBus?.delayMinutes ?? 0) > 2;
            const eta = activeBus
              ? formatAccurateEta(
                  activeBus.etaMinutes,
                  activeBus.arrivalIso,
                  activeBus.isTomorrow
                )
              : { compact: 'Live', subLabel: 'Scheduled' };

            return (
              <button
                key={fav.routeId}
                type="button"
                onClick={() => handleLaunchRoute(fav)}
                className="snap-start group flex min-w-[225px] max-w-[260px] min-h-[72px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3.5 text-left shadow-subtle transition-all hover:border-zinc-900 dark:hover:border-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
              >
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex max-w-[72px] truncate items-center rounded-md bg-zinc-900 dark:bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-white dark:text-zinc-950 tabular-nums">
                      {fav.routeNumber}
                    </span>
                    <span className="truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      {fav.customLabel || fav.busCategory}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0">
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
                      {eta.compact}
                    </span>
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-zinc-900 dark:text-zinc-200 w-full min-w-0">
                  <span className="truncate">{fav.origin}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-zinc-500 dark:text-zinc-500" />
                  <span className="truncate">{fav.destination}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // Full Management View (Drag-to-reorder + Swipe-to-delete + Custom Labels)
  return (
    <section aria-label="Saved favorite routes manager" className="space-y-3">
      {favoriteRoutes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-subtle">
          <Star className="mx-auto h-7 w-7 text-zinc-400 dark:text-zinc-600" />
          <p className="mt-2.5 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            No saved favorite routes yet
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
            Tap the star icon on any bus search result, route card, or live tracking header to pin it here for instant one-tap tracking.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-zinc-900 dark:bg-emerald-500 px-4 text-xs font-semibold text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-emerald-400"
          >
            Search &amp; bookmark bus routes
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Drag cards to reorder priority, or swipe left on mobile to remove. Tap any card to open its live GPS map and stop timeline.
          </p>

          <div className="space-y-2.5">
            {favoriteRoutes.map((fav, idx) => {
              const live = resolveLiveRoute(fav);
              const bus = live.buses[0];
              const isDelayed = (bus?.delayMinutes ?? 0) > 2;
              const eta = bus
                ? formatAccurateEta(bus.etaMinutes, bus.arrivalIso, bus.isTomorrow)
                : { primary: 'Scheduled', subLabel: '' };
              const isSwiped = swipedRouteId === fav.routeId;
              const isEditing = editingLabelId === fav.routeId;

              return (
                <div
                  key={fav.routeId}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverIndex(idx);
                  }}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== idx) {
                      reorderFavoriteRoutes(dragIndex, idx);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onTouchStart={(e) => {
                    touchStartXRef.current = e.touches[0]?.clientX ?? null;
                  }}
                  onTouchMove={(e) => {
                    if (touchStartXRef.current === null) return;
                    const deltaX =
                      (e.touches[0]?.clientX ?? touchStartXRef.current) -
                      touchStartXRef.current;
                    if (deltaX < -55) {
                      setSwipedRouteId(fav.routeId);
                    } else if (deltaX > 35 && isSwiped) {
                      setSwipedRouteId(null);
                    }
                  }}
                  onTouchEnd={() => {
                    touchStartXRef.current = null;
                  }}
                  className={cn(
                    'relative overflow-hidden rounded-xl border bg-card shadow-subtle transition-all',
                    dragOverIndex === idx
                      ? 'border-zinc-900 ring-2 ring-zinc-900/10 dark:border-emerald-500 dark:ring-emerald-500/20'
                      : 'border-border hover:border-zinc-300 dark:hover:border-zinc-700'
                  )}
                >
                  {/* Mobile Swipe-to-Delete Action Reveal */}
                  {isSwiped && (
                    <div className="flex items-center justify-between bg-rose-600 px-4 py-2 text-xs font-medium text-white">
                      <span>Remove {fav.routeNumber} from favorites?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSwipedRouteId(null)}
                          className="min-h-[36px] rounded-lg bg-rose-700 px-3 text-xs font-medium text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeFavoriteRoute(fav.routeId);
                            setSwipedRouteId(null);
                          }}
                          className="min-h-[36px] rounded-lg bg-white px-3 text-xs font-semibold text-rose-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        aria-hidden="true"
                        title="Drag to reorder"
                        className="hidden sm:inline-flex cursor-grab text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>

                      <button
                        type="button"
                        onClick={() => handleLaunchRoute(fav)}
                        className="flex min-h-[48px] w-[62px] max-w-[72px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg bg-zinc-900 dark:bg-zinc-100 px-2 py-1.5 text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200"
                      >
                        <span className="max-w-full truncate text-sm font-semibold tabular-nums leading-none">
                          {fav.routeNumber}
                        </span>
                        <span className="mt-1 max-w-full truncate text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {fav.operator}
                        </span>
                      </button>

                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="subtle">{fav.busCategory}</Badge>
                          {fav.customLabel && !isEditing && (
                            <Badge variant="primary">{fav.customLabel}</Badge>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
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
                              {eta.primary}
                            </span>
                            {isDelayed && bus && (
                              <span className="text-rose-600 dark:text-rose-400">
                                (+{bus.delayMinutes}m)
                              </span>
                            )}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleLaunchRoute(fav)}
                          className="mt-1 flex items-center gap-1.5 text-left text-sm font-semibold text-zinc-950 dark:text-zinc-100 hover:text-zinc-700 dark:hover:text-zinc-300 max-w-full overflow-hidden"
                        >
                          <span className="truncate">{fav.origin}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                          <span className="truncate">{fav.destination}</span>
                        </button>

                        {isEditing && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateFavoriteLabel(fav.routeId, labelDraft);
                              setEditingLabelId(null);
                            }}
                            className="mt-2 flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={labelDraft}
                              onChange={(e) => setLabelDraft(e.target.value)}
                              placeholder="e.g. Morning Office Commute"
                              className="h-9 flex-1 min-w-0 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:border-zinc-900 dark:focus:border-zinc-400 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center gap-1 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 text-xs font-medium text-white dark:text-zinc-950"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Save</span>
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Touch-Friendly Controls (48x48px targets) */}
                    <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingLabelId(null);
                          } else {
                            setEditingLabelId(fav.routeId);
                            setLabelDraft(fav.customLabel || '');
                          }
                        }}
                        aria-label="Edit custom label"
                        title="Add custom label"
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      >
                        <Tag className="h-4 w-4" />
                      </button>

                      {favoriteRoutes.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveFavoriteRoute(fav.routeId, 'up')}
                            aria-label={`Move route ${fav.routeNumber} up`}
                            className="flex h-12 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white disabled:opacity-35"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === favoriteRoutes.length - 1}
                            onClick={() => moveFavoriteRoute(fav.routeId, 'down')}
                            aria-label={`Move route ${fav.routeNumber} down`}
                            className="flex h-12 w-10 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white disabled:opacity-35"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleLaunchRoute(fav)}
                        className="inline-flex h-12 items-center gap-1 rounded-xl bg-zinc-900 dark:bg-emerald-500 px-3.5 text-xs font-semibold text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-emerald-400"
                      >
                        <span>Live Track</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeFavoriteRoute(fav.routeId)}
                        aria-label={`Remove route ${fav.routeNumber} from saved`}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-rose-900 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
