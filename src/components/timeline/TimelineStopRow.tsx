import React from 'react';
import { Bell, Check, Navigation } from 'lucide-react';
import { buildLiveBusTrackingModel } from '../../utils/transitHelpers';
import { Badge, cn, StatusDot } from '../ui/primitives';

export type TimelineStop = ReturnType<
  typeof buildLiveBusTrackingModel
>['stops'][number];

export interface TimelineStopRowProps {
  stop: TimelineStop;
  isFirst: boolean;
  isLast: boolean;
  hasAlarm: boolean;
  onOpenAlarm: (stopId: string) => void;
}

/**
 * Single stop item in the vertical live bus timeline.
 */
export const TimelineStopRow: React.FC<TimelineStopRowProps> = ({
  stop,
  isFirst,
  isLast,
  hasAlarm,
  onOpenAlarm,
}) => {
  const isPassed = stop.status === 'passed';
  const isCurrent = stop.status === 'current';

  return (
    <li className="relative flex items-start gap-3 pb-4 last:pb-1">
      {!isLast && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-[13px] top-7 bottom-0 w-[2px]',
            isPassed
              ? 'bg-zinc-300 dark:bg-zinc-800'
              : isCurrent
              ? 'bg-emerald-500'
              : 'bg-zinc-300 dark:bg-zinc-800'
          )}
        />
      )}

      {/* Timeline State Node */}
      <div className="relative z-10 mt-1 shrink-0">
        {isPassed ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 ring-4 ring-card dark:bg-zinc-800 dark:text-zinc-500">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : isCurrent ? (
          <span className="relative flex h-7 w-7 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-emerald-50 dark:ring-emerald-950">
              <Navigation className="h-3.5 w-3.5" />
            </span>
          </span>
        ) : (
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card text-[10px] font-semibold ring-4 ring-card',
              isLast
                ? 'border-zinc-900 text-zinc-950 dark:border-zinc-100 dark:text-white'
                : 'border-zinc-400 text-zinc-700 dark:border-zinc-700 dark:text-zinc-400'
            )}
          >
            {stop.sequence}
          </span>
        )}
      </div>

      {/* Stop Details Card */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-xl border px-3.5 py-2.5 transition-colors',
          isCurrent
            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-subtle'
            : isPassed
            ? 'border-zinc-200 bg-zinc-100/70 dark:border-transparent dark:bg-zinc-900/40 opacity-80'
            : 'border-zinc-300 bg-card hover:border-zinc-400 dark:border-border dark:hover:border-zinc-700'
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'text-xs sm:text-sm font-semibold break-words',
                  isPassed
                    ? 'text-zinc-600 dark:text-zinc-500'
                    : 'text-zinc-950 dark:text-zinc-100'
                )}
              >
                {stop.name}
              </span>
              {isFirst && <Badge variant="subtle">Origin</Badge>}
              {isLast && <Badge variant="primary">Terminal</Badge>}
              {isCurrent && (
                <Badge variant="live">
                  <StatusDot tone="live" pulse />
                  <span>Active</span>
                </Badge>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
              <span>+{stop.scheduledOffsetMin}m</span>
              <span>· {stop.distanceFromStartKm.toFixed(1)} km</span>
              {stop.platform && <span>· {stop.platform}</span>}
              {stop.landmark && (
                <span className="truncate">· {stop.landmark}</span>
              )}
            </div>
          </div>

          {/* Right: ETA Countdown & Scheduled/Estimated Clock */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <div className="sm:text-right">
              {isPassed ? (
                <span className="inline-flex rounded-md bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-400">
                  Departed · {stop.scheduledArrival}
                </span>
              ) : (
                <>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                      isCurrent
                        ? 'bg-emerald-600 text-white'
                        : stop.delayMinutes > 2
                        ? 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                    )}
                  >
                    {stop.etaMinutes !== null && stop.etaMinutes <= 1
                      ? 'Arriving'
                      : `In ${stop.etaMinutes ?? 2} min`}
                  </span>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                    {stop.delayMinutes > 0 &&
                    stop.estimatedArrival !== stop.scheduledArrival ? (
                      <>
                        <span className="line-through text-zinc-500 dark:text-zinc-600 mr-1">
                          {stop.scheduledArrival}
                        </span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">
                          {stop.estimatedArrival}
                        </span>
                      </>
                    ) : (
                      <span>{stop.estimatedArrival}</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {!isPassed && (
              <button
                type="button"
                onClick={() => onOpenAlarm(stop.id)}
                aria-label={`Set arrival alarm for ${stop.name}`}
                title="Set arrival alarm"
                className={cn(
                  'flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors',
                  hasAlarm
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200'
                )}
              >
                <Bell className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};
