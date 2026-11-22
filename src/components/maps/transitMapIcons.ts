import L from 'leaflet';

function normalizeBearing(bearingDeg: number): number {
  return Math.round(((bearingDeg % 360) + 360) % 360);
}

export interface LiveBusIconOptions {
  etaMinutes?: number;
  delayMinutes?: number;
  isStale?: boolean;
  operator?: string;
}

/**
 * High-DPI custom branded live bus marker with:
 * - Compact status pill: [Route] • [ETA] • [Live/Delayed/GPS Lost]
 * - Directional heading cone/arrow with smooth 0.5s CSS rotation
 * - Custom bus silhouette SVG + live GPS pulse ring (desaturated & paused when stale > 60s)
 */
export function createDirectionalLiveBusIcon(
  routeNumber: string,
  bearingDeg: number,
  options: LiveBusIconOptions = {}
): L.DivIcon {
  const deg = normalizeBearing(bearingDeg);
  const { etaMinutes, delayMinutes = 0, isStale = false } = options;

  const etaText =
    etaMinutes !== undefined
      ? etaMinutes <= 1
        ? 'Now'
        : `${etaMinutes}m`
      : 'Live';

  const statusText = isStale
    ? 'GPS Lost'
    : delayMinutes > 2
    ? `+${delayMinutes}m Delayed`
    : 'Live';

  const ringColor = isStale
    ? '#71717A'
    : delayMinutes > 2
    ? '#F59E0B'
    : '#10B981';

  const statusDotColor = isStale
    ? '#A1A1AA'
    : delayMinutes > 2
    ? '#FBBF24'
    : '#34D399';

  const pulseRingHtml = isStale
    ? ''
    : `<span style="position:absolute;width:54px;height:54px;border-radius:9999px;background:rgba(16,185,129,0.22);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></span>`;

  const filterStyle = isStale ? 'filter:grayscale(1);opacity:0.78;' : '';
  const safeRoute = escapeHtml(routeNumber);

  return L.divIcon({
    className: 'wimb-live-bus-icon',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-62%);${filterStyle}">
        <div style="margin-bottom:4px;display:inline-flex;align-items:center;gap:4px;background:#09090B;color:#FFFFFF;font-family:Inter,sans-serif;font-weight:700;font-size:10px;line-height:1.1;padding:3px 8px;border-radius:9999px;border:1.5px solid #FFFFFF;box-shadow:0 4px 12px rgba(9,9,11,0.32);white-space:nowrap;">
          <span style="width:6px;height:6px;border-radius:9999px;background:${statusDotColor};flex-shrink:0;"></span>
          <span>${safeRoute}</span>
          <span style="color:#71717A;">•</span>
          <span>${escapeHtml(etaText)}</span>
          <span style="color:#71717A;">•</span>
          <span style="color:${statusDotColor};">${escapeHtml(statusText)}</span>
        </div>
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:54px;height:54px;">
          ${pulseRingHtml}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${deg}deg);transition:transform 0.5s ease-out;pointer-events:none;">
            <svg width="54" height="54" viewBox="0 0 54 54" fill="none">
              <path d="M27 2L33 12H21L27 2Z" fill="${ringColor}" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
          </div>
          <div style="position:relative;width:36px;height:36px;border-radius:9999px;background:#09090B;border:2.5px solid ${ringColor};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(9,9,11,0.35);">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 6v6"/>
              <path d="M15 6v6"/>
              <path d="M2 12h19.6"/>
              <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
              <circle cx="7" cy="18" r="2"/>
              <path d="M9 18h5"/>
              <circle cx="16" cy="18" r="2"/>
            </svg>
          </div>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function createTrackStopIcon(
  status: 'passed' | 'current' | 'upcoming'
): L.DivIcon {
  if (status === 'current') {
    return L.divIcon({
      className: 'wimb-stop-pin',
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:24px;height:24px;">
          <span style="position:absolute;width:22px;height:22px;border-radius:9999px;background:rgba(16,185,129,0.35);animation:ping 1.8s infinite;"></span>
          <div style="width:14px;height:14px;border-radius:9999px;background:#059669;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(5,150,105,0.45);"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  const bg = status === 'passed' ? '#D4D4D8' : '#FFFFFF';
  const border = status === 'passed' ? '#A1A1AA' : '#18181B';
  return L.divIcon({
    className: 'wimb-stop-pin',
    html: `<div style="width:12px;height:12px;border-radius:9999px;background:${bg};border:2.5px solid ${border};box-shadow:0 1px 4px rgba(0,0,0,0.16);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export function createFleetVehicleIcon(
  routeShortName: string,
  mode: string,
  bearingDeg = 0
): L.DivIcon {
  const bg =
    mode === 'SUBWAY' || mode === 'TRAM'
      ? '#4F46E5'
      : routeShortName.startsWith('KIA')
      ? '#0284C7'
      : '#18181B';
  const deg = normalizeBearing(bearingDeg);

  return L.divIcon({
    className: 'wimb-radar-marker',
    html: `
      <div style="display:inline-flex;align-items:center;gap:3px;background:${bg};color:#fff;font-family:Inter,sans-serif;font-weight:600;font-size:10px;padding:3px 6px;border-radius:6px;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(9,9,11,0.22);white-space:nowrap;">
        <span style="display:inline-block;transform:rotate(${deg}deg);color:#34D399;font-size:9px;line-height:1;">▲</span>
        <span>${routeShortName.slice(0, 8)}</span>
      </div>
    `,
    iconSize: [52, 22],
    iconAnchor: [26, 11],
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createUserLocationPin(): L.DivIcon {
  return L.divIcon({
    className: 'wimb-user-gps-pin',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
        <span style="position:absolute;width:24px;height:24px;border-radius:9999px;background:rgba(5,150,105,0.24);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></span>
        <span style="width:12px;height:12px;border-radius:9999px;background:#059669;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(9,9,11,0.3);"></span>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * Distinct Green Origin / Boarding Marker with SVG pulse ring & badge.
 */
export function createOriginMarkerIcon(stopLabel?: string): L.DivIcon {
  const safeLabel = stopLabel ? escapeHtml(stopLabel.slice(0, 22)) : 'Boarding';
  return L.divIcon({
    className: 'wimb-origin-marker',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-85%);">
        <span style="padding:2px 7px;border-radius:9999px;background:#059669;color:#FFFFFF;font-family:Inter,sans-serif;font-weight:700;font-size:10px;line-height:1.2;white-space:nowrap;border:1.5px solid #FFFFFF;box-shadow:0 4px 10px rgba(5,150,105,0.38);margin-bottom:3px;">
          ${safeLabel}
        </span>
        <div style="width:26px;height:26px;border-radius:9999px;background:#10B981;border:3px solid #FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(9,9,11,0.3);">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="5" fill="#FFFFFF"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * Distinct Transfer / Bus-Change Interchange Marker with SVG swap arrows.
 */
export function createTransferMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'wimb-transfer-marker',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <div style="width:30px;height:30px;border-radius:9999px;background:#F59E0B;border:2.5px solid #FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(245,158,11,0.42);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#18181B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 2l4 4-4 4"/>
            <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
            <path d="M7 22l-4-4 4-4"/>
            <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * Distinct Red Flagged Destination / Arrival Marker with SVG flag.
 */
export function createDestinationMarkerIcon(stopLabel?: string): L.DivIcon {
  const safeLabel = stopLabel ? escapeHtml(stopLabel.slice(0, 22)) : 'Destination';
  return L.divIcon({
    className: 'wimb-destination-marker',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-85%);">
        <span style="padding:2px 7px;border-radius:9999px;background:#DC2626;color:#FFFFFF;font-family:Inter,sans-serif;font-weight:700;font-size:10px;line-height:1.2;white-space:nowrap;border:1.5px solid #FFFFFF;box-shadow:0 4px 10px rgba(220,38,38,0.38);margin-bottom:3px;">
          ${safeLabel}
        </span>
        <div style="width:28px;height:28px;border-radius:9999px;background:#EF4444;border:3px solid #FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(9,9,11,0.32);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
