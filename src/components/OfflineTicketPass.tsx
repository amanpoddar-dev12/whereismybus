import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  ShieldCheck,
  WifiOff,
  Maximize2,
} from 'lucide-react';
import { UpiTicketPass } from '../types/transit';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { computeTicketValidationHash } from '../services/db';
import { Badge, StatusDot } from './ui/primitives';

export interface OfflineTicketPassProps {
  ticket: UpiTicketPass;
  qrSize?: number;
  compact?: boolean;
  onEnlarge?: (ticket: UpiTicketPass) => void;
}

/**
 * Offline-capable UPI Ticket Pass with zero-network local SVG QR code (qrcode.react),
 * cryptographic validation hash, and an animated anti-fraud security watermark.
 */
export const OfflineTicketPass: React.FC<OfflineTicketPassProps> = ({
  ticket,
  qrSize = 120,
  compact = false,
  onEnlarge,
}) => {
  const { isOffline } = useNetworkStatus();
  const [liveTime, setLiveTime] = useState<string>('');
  const [validationHash, setValidationHash] = useState<string>('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setLiveTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    computeTicketValidationHash(ticket).then((hash) => {
      if (active) setValidationHash(hash);
    });
    return () => {
      active = false;
    };
  }, [ticket]);

  const qrPayload = useMemo(
    () =>
      JSON.stringify({
        id: ticket.id,
        route: ticket.routeNumber,
        op: ticket.operator,
        from: ticket.originStop,
        to: ticket.destinationStop,
        pax: ticket.adultCount + ticket.womenFreeCount,
        fare: ticket.totalFareInr,
        utr: ticket.utrNumber,
        exp: ticket.expiresAt,
        sig: validationHash || ticket.qrSeed,
      }),
    [ticket, validationHash]
  );

  const minsRemaining = Math.max(
    0,
    Math.round((ticket.expiresAt - Date.now()) / 60_000)
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Anti-Fraud Live Animated Security Ticker Header */}
      <div className="relative overflow-hidden border-b border-border bg-zinc-100/80 dark:bg-zinc-900/80 px-4 py-2.5 text-xs tabular-nums">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent animate-pulse"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-zinc-900 dark:bg-zinc-100 px-2 py-0.5 font-semibold text-white dark:text-zinc-950">
              {ticket.routeNumber}
            </span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {ticket.operator} · {ticket.id}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isOffline && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <WifiOff className="h-3 w-3" />
                <span>Offline Verified</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <StatusDot tone="live" pulse />
              <span>LIVE {liveTime}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Offline Context Notice */}
      {isOffline && !compact && (
        <div className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-2 text-[11px] font-medium text-amber-900 dark:text-amber-200">
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Cached offline pass — QR &amp; cryptographic signature ready for conductor scan
          </span>
        </div>
      )}

      {/* Conductor-Facing Pass Body */}
      <div
        className={
          compact
            ? 'p-4 flex flex-col sm:flex-row items-center gap-4'
            : 'p-5 flex flex-col items-center text-center gap-4'
        }
      >
        <div className="relative shrink-0 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-subtle">
          <QRCodeSVG
            value={qrPayload}
            size={qrSize}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#09090B"
          />
        </div>

        <div
          className={
            compact
              ? 'flex-1 space-y-2 w-full text-center sm:text-left'
              : 'w-full space-y-2.5 text-center'
          }
        >
          <div
            className={
              compact
                ? 'flex items-center justify-center sm:justify-start gap-1.5 text-sm font-semibold text-zinc-950 dark:text-white'
                : 'flex items-center justify-center gap-1.5 text-sm font-semibold text-zinc-950 dark:text-white'
            }
          >
            <span>{ticket.originStop}</span>
            <ArrowRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span>{ticket.destinationStop}</span>
          </div>

          <div
            className={
              compact
                ? 'flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs tabular-nums'
                : 'flex flex-wrap items-center justify-center gap-1.5 text-xs tabular-nums'
            }
          >
            <Badge variant="live">
              Paid ₹{ticket.totalFareInr} · {ticket.upiApp}
            </Badge>
            <Badge variant="subtle">
              {ticket.adultCount > 0 ? `${ticket.adultCount} adult` : ''}
              {ticket.adultCount > 0 && ticket.womenFreeCount > 0 ? ' + ' : ''}
              {ticket.womenFreeCount > 0
                ? `${ticket.womenFreeCount} women ₹0`
                : ''}
            </Badge>
            <span className="text-zinc-600 dark:text-zinc-400">
              · {minsRemaining > 0 ? `${minsRemaining} min left` : 'Expired'}
            </span>
          </div>

          <div
            className={
              compact
                ? 'flex flex-wrap items-center justify-center sm:justify-start gap-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums'
                : 'flex flex-wrap items-center justify-center gap-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 tabular-nums'
            }
          >
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>UTR {ticket.utrNumber}</span>
            </span>
            {validationHash && (
              <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px]">
                SIG {validationHash.slice(0, 10)}
              </span>
            )}
          </div>
        </div>

        {onEnlarge && (
          <button
            type="button"
            onClick={() => onEnlarge(ticket)}
            className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 transition-colors hover:bg-zinc-200/80 dark:hover:bg-zinc-700"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Enlarge QR</span>
          </button>
        )}
      </div>
    </div>
  );
};
