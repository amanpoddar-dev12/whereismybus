import React, { useEffect, useState } from 'react';
import {
  QrCode,
  Plus,
  Ticket,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { OfflineTicketPass } from '../OfflineTicketPass';
import { UpiTicketPass } from '../../types/transit';
import { Badge, DialogOverlay } from '../ui/primitives';

export const UpiTicketsTab: React.FC = () => {
  const { city, routes, tickets, openTicketModal, purchaseUpiTicket } = useTransit();

  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || '');
  const [expandedTicket, setExpandedTicket] = useState<UpiTicketPass | null>(null);
  const [securityClock, setSecurityClock] = useState<string>('');

  useEffect(() => {
    if (routes[0] && !selectedRouteId) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, selectedRouteId]);

  useEffect(() => {
    const tick = () =>
      setSecurityClock(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dailyPassPrice =
    city.primaryOperator.includes('BMTC')
      ? 120
      : city.primaryOperator.includes('TGSRTC')
      ? 100
      : city.primaryOperator.includes('DTC')
      ? 50
      : 70;

  const handleBuyDailyPass = () => {
    const templateRoute = routes[0];
    if (!templateRoute) return;
    const pass = purchaseUpiTicket({
      route: {
        ...templateRoute,
        operator: city.primaryOperator,
        routeNumber: 'DAY-PASS',
      },
      originStop: `All ${city.name} zones`,
      destinationStop: '24h unlimited transit',
      adultCount: 1,
      womenFreeCount: 0,
      totalFareInr: dailyPassPrice,
      upiApp: 'GPay',
    });
    setExpandedTicket(pass);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 space-y-5">
      {/* Express Ticket Header Card */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
              Digital QR tickets & passes
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Instant stage-fare QR tickets across {city.primaryOperator} routes
            </p>
          </div>
          <Badge variant="subtle" className="tabular-nums">
            {tickets.length} active
          </Badge>
        </div>

        {routes.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
            <select
              aria-label="Select route for express ticket"
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 px-3 text-xs sm:text-sm font-medium text-zinc-950 dark:text-zinc-100 focus:border-zinc-900 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
            >
              {routes.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {r.operator} {r.routeNumber}: {r.origin} → {r.destination}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const target =
                  routes.find((r) => r.id === selectedRouteId) || routes[0];
                if (target) openTicketModal(target);
              }}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-emerald-500 px-4 text-xs font-medium text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-emerald-400 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Book route ticket</span>
            </button>
          </div>
        )}
      </div>

      {/* 24-Hour Unlimited Digital Day Pass */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-subtle">
        <div className="space-y-1">
          <Badge variant="live">24-hour pass</Badge>
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">
            {city.name} ({city.primaryOperator}) unlimited day pass
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Valid on all city ordinary and AC routes until 23:59 tonight
          </p>
        </div>

        <button
          type="button"
          disabled={routes.length === 0}
          onClick={handleBuyDailyPass}
          className="rounded-lg border border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100 px-4 py-2 text-xs font-medium text-white dark:text-zinc-950 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 tabular-nums"
        >
          Activate pass · ₹{dailyPassPrice}
        </button>
      </div>

      {/* Issued Wallet Passes */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 tabular-nums">
          <Ticket className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>Issued passes ({tickets.length})</span>
        </h3>

        {tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-card p-10 text-center shadow-subtle">
            <QrCode className="mx-auto h-7 w-7 text-zinc-500 dark:text-zinc-500" />
            <p className="mt-2.5 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              No active passes yet
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
              Select a route above or choose “Pass” on any departure card to generate an instant QR ticket.
            </p>
          </div>
        ) : (
          tickets.map((tkt) => (
            <OfflineTicketPass
              key={tkt.id}
              ticket={tkt}
              qrSize={112}
              compact
              onEnlarge={setExpandedTicket}
            />
          ))
        )}
      </div>

      {/* Accessible Fullscreen Conductor Scan Dialog */}
      <DialogOverlay
        open={Boolean(expandedTicket)}
        onClose={() => setExpandedTicket(null)}
        title={
          expandedTicket
            ? `${expandedTicket.operator} ${expandedTicket.routeNumber}`
            : 'QR Pass'
        }
        subtitle={`Live verification · ${securityClock}`}
        icon={<QrCode className="h-4 w-4" />}
        maxWidthClass="max-w-sm"
      >
        {expandedTicket && (
          <div className="p-4 space-y-4 tabular-nums">
            <OfflineTicketPass ticket={expandedTicket} qrSize={196} />
            <button
              type="button"
              onClick={() => setExpandedTicket(null)}
              className="w-full rounded-lg bg-zinc-900 py-2.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        )}
      </DialogOverlay>
    </div>
  );
};
