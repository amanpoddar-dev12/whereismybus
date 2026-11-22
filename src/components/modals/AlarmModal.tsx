import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Volume2 } from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { Badge, cn, DialogOverlay } from '../ui/primitives';

export const AlarmModal: React.FC = () => {
  const {
    alarmModalContext,
    closeAlarmModal,
    addOrUpdateAlarm,
    ringingAlarm,
    dismissRingingAlarm,
  } = useTransit();

  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const [radiusMeters, setRadiusMeters] = useState<500 | 1000 | 2000>(500);

  useEffect(() => {
    if (alarmModalContext) {
      const { route, defaultStopId } = alarmModalContext;
      const fallbackStop =
        defaultStopId || route.stops[route.stops.length - 1]?.id || '';
      setSelectedStopId(fallbackStop);
      setRadiusMeters(500);
    }
  }, [alarmModalContext]);

  return (
    <>
      <DialogOverlay
        open={Boolean(alarmModalContext)}
        onClose={closeAlarmModal}
        title="Proximity stop alarm"
        subtitle={
          alarmModalContext
            ? `${alarmModalContext.route.operator} ${alarmModalContext.route.routeNumber} · ${alarmModalContext.route.stops.length} stops`
            : undefined
        }
        icon={<Bell className="h-4 w-4" />}
      >
        {alarmModalContext && (
          <div className="p-5 space-y-4 tabular-nums">
            <div>
              <label
                htmlFor="alarm-stop-select"
                className="block text-xs font-medium text-zinc-700 mb-1.5"
              >
                Destination stop
              </label>
              <select
                id="alarm-stop-select"
                value={selectedStopId}
                onChange={(e) => setSelectedStopId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-medium text-zinc-950 focus:border-zinc-900 focus:bg-white focus:outline-none"
              >
                {alarmModalContext.route.stops.map((stop, idx) => (
                  <option
                    key={`${stop.id}-${idx}`}
                    value={stop.id}
                    className="bg-white text-zinc-900"
                  >
                    {idx + 1}. {stop.name} ({stop.platform})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">
                Alert distance before stop
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { val: 500, label: '500 m', sub: '~1.5 min prior' },
                    { val: 1000, label: '1 km', sub: '~3 min prior' },
                    { val: 2000, label: '2 km', sub: '~6 min prior' },
                  ] as const
                ).map((opt) => {
                  const active = radiusMeters === opt.val;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRadiusMeters(opt.val)}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        active
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-300 bg-zinc-50 text-zinc-900 hover:bg-zinc-100'
                      )}
                    >
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div
                        className={cn(
                          'text-[11px] mt-0.5',
                          active ? 'text-zinc-300' : 'text-zinc-600'
                        )}
                      >
                        {opt.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const bus =
                  alarmModalContext.route.buses[alarmModalContext.busIndex] ||
                  alarmModalContext.route.buses[0];
                if (!bus) return;
                addOrUpdateAlarm({
                  routeId: alarmModalContext.route.id,
                  tripId: bus.tripId,
                  stopId: selectedStopId,
                  radiusMeters,
                });
                closeAlarmModal();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Check className="h-4 w-4" />
              <span>Set proximity alarm</span>
            </button>
          </div>
        )}
      </DialogOverlay>

      {/* Active Ringing Alert Dialog */}
      <DialogOverlay
        open={Boolean(ringingAlarm)}
        onClose={dismissRingingAlarm}
        title="Approaching your stop"
        subtitle={
          ringingAlarm
            ? `${ringingAlarm.operator} ${ringingAlarm.routeNumber}`
            : undefined
        }
        icon={<BellRing className="h-4 w-4" />}
        maxWidthClass="max-w-sm"
      >
        {ringingAlarm && (
          <div className="p-6 text-center space-y-4 tabular-nums">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <BellRing className="h-7 w-7" />
            </div>

            <Badge variant="warning">
              <Volume2 className="h-3 w-3" />
              <span>Arrival alert</span>
            </Badge>

            <div>
              <h3 className="text-lg font-semibold text-zinc-950">
                {ringingAlarm.stopName}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Route{' '}
                <strong className="font-semibold text-zinc-900">
                  {ringingAlarm.operator} {ringingAlarm.routeNumber}
                </strong>{' '}
                is within{' '}
                <strong className="font-semibold text-zinc-900">
                  {ringingAlarm.radiusMeters >= 1000
                    ? `${ringingAlarm.radiusMeters / 1000} km`
                    : `${ringingAlarm.radiusMeters} m`}
                </strong>{' '}
                of your stop.
              </p>
            </div>

            <button
              type="button"
              onClick={dismissRingingAlarm}
              className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Dismiss alarm
            </button>
          </div>
        )}
      </DialogOverlay>
    </>
  );
};
