import React, { useState } from 'react';
import {
  ShieldAlert,
  Share2,
  Copy,
  Check,
  PhoneCall,
  MapPin,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import { formatDistanceKm, getBusTelemetry } from '../../utils/transitHelpers';
import { DialogOverlay } from '../ui/primitives';

export const SosShareModal: React.FC = () => {
  const { sosModalContext, closeSosModal, city, userGeo, pushToast } = useTransit();
  const [copied, setCopied] = useState<boolean>(false);

  if (!sosModalContext) return null;

  const { route, busIndex } = sosModalContext;
  const bus = route.buses[busIndex] || route.buses[0];
  if (!bus) return null;

  const tel = getBusTelemetry(route.stops, bus.routeProgress);
  const nextStop = route.stops[tel.nextStopIndex] || route.stops[0];

  const latVal = userGeo.lat ?? tel.lat;
  const lonVal = userGeo.lon ?? tel.lng;
  const mapsLink = `https://www.openstreetmap.org/?mlat=${latVal.toFixed(
    5
  )}&mlon=${lonVal.toFixed(5)}#map=16/${latVal.toFixed(5)}/${lonVal.toFixed(5)}`;

  const shareText = `*Where is my BUS — Live Ride Safety Share*\n• Route: ${route.operator} ${route.routeNumber} (${route.origin} → ${route.destination})\n• Vehicle: *${bus.regNumber}* (${bus.tripId})\n• Position: ${formatDistanceKm(
    tel.distanceToNextStopKm
  )} before ${nextStop?.name || 'next stop'}\n• Live Map: ${mapsLink}\n• Emergency Helpline: 112`;

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {}
    setCopied(true);
    pushToast({
      title: 'Ride details copied',
      subtitle: `${route.operator} ${route.routeNumber} (${bus.regNumber})`,
      tone: 'emerald',
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <DialogOverlay
      open={Boolean(sosModalContext)}
      onClose={closeSosModal}
      title="Safety share & emergency helplines"
      subtitle="Share live vehicle and GPS telemetry with trusted contacts"
      icon={<ShieldAlert className="h-4 w-4" />}
      tone="danger"
    >
      <div className="p-5 space-y-4 tabular-nums">
        <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Vehicle registration</span>
            <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono font-medium text-white">
              {bus.regNumber}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Route & operator</span>
            <span className="font-semibold text-zinc-900">
              {route.operator} {route.routeNumber} ({route.serviceType})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-600">Coordinates</span>
            <span className="inline-flex items-center gap-1 font-mono text-zinc-800">
              <MapPin className="h-3 w-3 text-zinc-500" />
              {latVal.toFixed(4)}°N, {lonVal.toFixed(4)}°E
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2.5 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-800"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share on WhatsApp</span>
          </a>

          <button
            type="button"
            onClick={handleCopyShare}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-100 py-2.5 px-3 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200/80"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-zinc-600" />
                <span>Copy details</span>
              </>
            )}
          </button>
        </div>

        <div className="border-t border-zinc-200 pt-3.5 space-y-2">
          <p className="text-xs font-medium text-zinc-600">
            24×7 emergency & transit helplines
          </p>

          <a
            href="tel:112"
            className="flex items-center justify-between rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-rose-950 transition-colors hover:bg-rose-100/70"
          >
            <div>
              <p className="text-xs font-semibold">112 · National Emergency</p>
              <p className="text-[11px] text-rose-700">Police, ambulance & rapid response</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white">
              <PhoneCall className="h-3 w-3" />
              <span>Call 112</span>
            </span>
          </a>

          <a
            href="tel:1091"
            className="flex items-center justify-between rounded-lg border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            <div>
              <p className="text-xs font-semibold">1091 · Women Safety Helpline</p>
              <p className="text-[11px] text-zinc-600">Dedicated commuter safety desk</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900">
              <PhoneCall className="h-3 w-3" />
              <span>Call 1091</span>
            </span>
          </a>

          <a
            href={`tel:${city.rtcHelpline}`}
            className="flex items-center justify-between rounded-lg border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            <div>
              <p className="text-xs font-semibold">{city.primaryOperator} Control Room</p>
              <p className="font-mono text-[11px] text-zinc-600">{city.rtcHelpline}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-900">
              <PhoneCall className="h-3 w-3" />
              <span>Call</span>
            </span>
          </a>
        </div>
      </div>
    </DialogOverlay>
  );
};
