import React from 'react';
import {
  QrCode,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { DynamicQrCode } from '../DynamicQrCode';
import { UpiTicketPass } from '../../types/transit';
import { Badge, cn, DialogOverlay, StatusDot } from '../ui/primitives';
import { UPI_APP_OPTIONS, useUpiPayment } from '../../hooks/useUpiPayment';

interface PassengerCounterRowProps {
  title: string;
  subtitle: string;
  count: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (next: number) => void;
  withTopDivider?: boolean;
}

const PassengerCounterRow: React.FC<PassengerCounterRowProps> = ({
  title,
  subtitle,
  count,
  max,
  decreaseLabel,
  increaseLabel,
  onChange,
  withTopDivider = false,
}) => (
  <div
    className={cn(
      'flex items-center justify-between',
      withTopDivider && 'border-t border-zinc-200/80 pt-3'
    )}
  >
    <div>
      <p className="text-xs font-semibold text-zinc-900">{title}</p>
      <p className="text-[11px] text-zinc-500">{subtitle}</p>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={() => onChange(Math.max(0, count - 1))}
        className="h-8 w-8 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        −
      </button>
      <span className="w-5 text-center text-sm font-semibold text-zinc-950">
        {count}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(Math.min(max, count + 1))}
        className="h-8 w-8 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        +
      </button>
    </div>
  </div>
);

interface IssuedTicketReceiptProps {
  issuedPass: UpiTicketPass;
  liveClock: string;
  onOpenWallet: () => void;
  onDone: () => void;
}

const IssuedTicketReceipt: React.FC<IssuedTicketReceiptProps> = ({
  issuedPass,
  liveClock,
  onOpenWallet,
  onDone,
}) => (
  <div className="p-5 space-y-4 text-center tabular-nums">
    <Badge variant="live">
      <StatusDot tone="live" pulse />
      <span>Verified via {issuedPass.upiApp}</span>
    </Badge>

    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2 text-xs">
        <span className="font-semibold text-zinc-950">
          {issuedPass.operator} · {issuedPass.routeNumber}
        </span>
        <span className="font-mono text-[11px] text-emerald-700">
          {liveClock}
        </span>
      </div>

      <div className="py-2 flex justify-center">
        <DynamicQrCode seed={issuedPass.qrSeed} size={168} />
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-zinc-950">
        <span className="truncate max-w-[135px]">{issuedPass.originStop}</span>
        <ArrowRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <span className="truncate max-w-[135px]">
          {issuedPass.destinationStop}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 text-center text-xs">
        <div>
          <div className="text-[10px] text-zinc-400">Passengers</div>
          <div className="font-semibold text-zinc-900">
            {issuedPass.adultCount > 0 ? `${issuedPass.adultCount} adult` : ''}
            {issuedPass.adultCount > 0 && issuedPass.womenFreeCount > 0
              ? ' + '
              : ''}
            {issuedPass.womenFreeCount > 0
              ? `${issuedPass.womenFreeCount} free`
              : ''}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400">Paid</div>
          <div className="font-semibold text-emerald-700">
            ₹{issuedPass.totalFareInr}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400">Pass ID</div>
          <div className="font-mono text-[11px] font-medium text-zinc-800">
            {issuedPass.id.slice(-8)}
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1 text-[11px] text-zinc-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        <span>Present QR to conductor ETIM · Valid 2 hours</span>
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onOpenWallet}
        className="rounded-lg border border-zinc-200 bg-white py-2.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
      >
        Open wallet
      </button>
      <button
        type="button"
        onClick={onDone}
        className="rounded-lg bg-zinc-900 py-2.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
      >
        Done
      </button>
    </div>
  </div>
);

export const UpiTicketModal: React.FC = () => {
  const {
    ticketModalRoute,
    closeTicketModal,
    purchaseUpiTicket,
    setActiveTab,
  } = useTransit();

  const {
    stops,
    originIdx,
    destIdx,
    setDestIdx,
    handleOriginChange,
    adultCount,
    setAdultCount,
    womenFreeCount,
    setWomenFreeCount,
    selectedUpi,
    setSelectedUpi,
    paying,
    issuedPass,
    liveClock,
    singleAdultFare,
    totalFare,
    handlePayNow,
  } = useUpiPayment({
    ticketModalRoute,
    purchaseUpiTicket,
  });

  if (!ticketModalRoute) return null;

  return (
    <DialogOverlay
      open={Boolean(ticketModalRoute)}
      onClose={closeTicketModal}
      title="Express QR ticket"
      subtitle={`${ticketModalRoute.operator} Route ${ticketModalRoute.routeNumber}`}
      icon={<QrCode className="h-4 w-4" />}
    >
      {issuedPass ? (
        <IssuedTicketReceipt
          issuedPass={issuedPass}
          liveClock={liveClock}
          onOpenWallet={() => {
            closeTicketModal();
            setActiveTab('tickets');
          }}
          onDone={closeTicketModal}
        />
      ) : (
        <div className="p-5 space-y-4 tabular-nums">
          {/* Stop Selectors */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="ticket-origin-select"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Boarding stop
              </label>
              <select
                id="ticket-origin-select"
                value={originIdx}
                onChange={(e) => handleOriginChange(Number(e.target.value))}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 text-sm font-medium text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none"
              >
                {stops.map((s, idx) => (
                  <option
                    key={s.id}
                    value={idx}
                    className="bg-white text-zinc-900"
                  >
                    {idx + 1}. {s.name} ({s.platform})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="ticket-dest-select"
                className="block text-xs font-medium text-zinc-700 mb-1"
              >
                Alighting stop
              </label>
              <select
                id="ticket-dest-select"
                value={destIdx}
                onChange={(e) => setDestIdx(Number(e.target.value))}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 text-sm font-medium text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none"
              >
                {stops.map((s, idx) => (
                  <option
                    key={s.id}
                    value={idx}
                    disabled={idx === originIdx}
                    className="bg-white text-zinc-900"
                  >
                    {idx + 1}. {s.name} ({s.distanceFromStartKm.toFixed(1)} km)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Passenger Counters */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-3">
            <PassengerCounterRow
              title={`Adult fare (₹${singleAdultFare} / rider)`}
              subtitle="Stage-based RTC tariff"
              count={adultCount}
              max={6}
              decreaseLabel="Decrease adult tickets"
              increaseLabel="Increase adult tickets"
              onChange={setAdultCount}
            />

            {ticketModalRoute.womenFreeEligible && (
              <PassengerCounterRow
                title={`${ticketModalRoute.womenSchemeName} (₹0)`}
                subtitle="Zero-fare state concession pass"
                count={womenFreeCount}
                max={4}
                decreaseLabel="Decrease zero-fare women passes"
                increaseLabel="Increase zero-fare women passes"
                onChange={setWomenFreeCount}
                withTopDivider
              />
            )}
          </div>

          {/* UPI Method */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-700">Payment app</p>
            <div className="grid grid-cols-4 gap-1.5">
              {UPI_APP_OPTIONS.map((app) => {
                const isSel = selectedUpi === app;
                return (
                  <button
                    key={app}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setSelectedUpi(app)}
                    className={cn(
                      'rounded-lg border py-2 px-1 text-center text-xs font-medium transition-colors',
                      isSel
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                  >
                    {app}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pay CTA */}
          <button
            type="button"
            disabled={paying || (adultCount === 0 && womenFreeCount === 0)}
            onClick={handlePayNow}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            {paying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Confirming {selectedUpi}…</span>
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4" />
                <span>
                  {totalFare === 0 && womenFreeCount > 0
                    ? 'Issue ₹0 concession QR pass'
                    : `Pay ₹${totalFare} via ${selectedUpi}`}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </DialogOverlay>
  );
};
