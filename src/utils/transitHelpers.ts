import {
  BusRoute,
  BusServiceCategory,
  BusStop,
  CrowdLevel,
  LiveBusTracking,
  RouteStop,
  UpcomingBusInstance,
} from '../types/transit';
import {
  anchorMonotonicStopTimestampsMs,
  formatIstClockTime,
  IST_TIMEZONE,
  parseTransitTimestampMs,
} from './transitTimeEngine';

export interface InterpolatedBusTelemetry {
  lat: number;
  lng: number;
  bearingDeg: number;
  lastPassedStopIndex: number;
  nextStopIndex: number;
  segmentFraction: number;
  distanceToNextStopKm: number;
  currentDistanceFromStartKm: number;
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimates realistic pedestrian walking minutes along streets (~75m/min = 4.5 km/h).
 */
export function estimateWalkingMinutes(straightOrStreetMeters: number): number {
  if (straightOrStreetMeters <= 50) return 1;
  return Math.max(1, Math.round(straightOrStreetMeters / 75));
}

/**
 * Decodes Google / MOTIS encoded polyline strings (supports precision 5, 6, or 7).
 */
export function decodeEncodedPolyline(
  encoded: string,
  precision = 5
): [number, number][] {
  if (!encoded) return [];
  const factor = Math.pow(10, precision);
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    const decodedLat = lat / factor;
    const decodedLng = lng / factor;
    if (Math.abs(decodedLat) <= 90 && Math.abs(decodedLng) <= 180) {
      points.push([decodedLat, decodedLng]);
    }
  }

  // Auto-detect precision mismatch (e.g. MOTIS v1 legGeometry defaults to precision 7 or 6)
  if (points.length === 0 && precision !== 7) {
    return decodeEncodedPolyline(encoded, 7);
  }
  if (
    points.length > 0 &&
    precision === 5 &&
    (Math.abs(points[0][0]) > 45 || Math.abs(points[0][1]) < 60)
  ) {
    const try6 = decodeEncodedPolyline(encoded, 6);
    if (try6.length > 0 && try6[0][0] >= 6 && try6[0][0] <= 38) return try6;
    const try7 = decodeEncodedPolyline(encoded, 7);
    if (try7.length > 0 && try7[0][0] >= 6 && try7[0][0] <= 38) return try7;
  }

  return points;
}

/**
 * Computes real-time bus telemetry from stop timestamps or live routeProgress.
 */
export function getBusTelemetry(
  stops: RouteStop[],
  routeProgress: number
): InterpolatedBusTelemetry {
  if (!stops || stops.length === 0) {
    return {
      lat: 12.9775,
      lng: 77.5714,
      bearingDeg: 0,
      lastPassedStopIndex: 0,
      nextStopIndex: 0,
      segmentFraction: 0,
      distanceToNextStopKm: 0.5,
      currentDistanceFromStartKm: 0,
    };
  }
  if (stops.length === 1) {
    return {
      lat: stops[0].lat,
      lng: stops[0].lng,
      bearingDeg: 0,
      lastPassedStopIndex: 0,
      nextStopIndex: 0,
      segmentFraction: 0,
      distanceToNextStopKm: 0.1,
      currentDistanceFromStartKm: 0,
    };
  }

  const maxIdx = stops.length - 1;
  const clamped = Math.max(0, Math.min(maxIdx - 0.001, routeProgress));
  const lastPassedStopIndex = Math.floor(clamped);
  const nextStopIndex = Math.min(maxIdx, lastPassedStopIndex + 1);
  const segmentFraction = clamped - lastPassedStopIndex;

  const fromStop = stops[lastPassedStopIndex];
  const toStop = stops[nextStopIndex];

  const lat = fromStop.lat + (toStop.lat - fromStop.lat) * segmentFraction;
  const lng = fromStop.lng + (toStop.lng - fromStop.lng) * segmentFraction;

  const dLng = ((toStop.lng - fromStop.lng) * Math.PI) / 180;
  const lat1 = (fromStop.lat * Math.PI) / 180;
  const lat2 = (toStop.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearingDeg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  const rawSegDistKm =
    toStop.distanceFromStartKm - fromStop.distanceFromStartKm;
  const fallbackSegDistKm =
    haversineMeters(fromStop.lat, fromStop.lng, toStop.lat, toStop.lng) / 1000;
  const segmentDistKm = Math.max(0.15, rawSegDistKm > 0 ? rawSegDistKm : fallbackSegDistKm);

  const distanceToNextStopKm = Math.max(0.03, segmentDistKm * (1 - segmentFraction));
  const currentDistanceFromStartKm =
    fromStop.distanceFromStartKm + segmentDistKm * segmentFraction;

  return {
    lat,
    lng,
    bearingDeg,
    lastPassedStopIndex,
    nextStopIndex,
    segmentFraction,
    distanceToNextStopKm,
    currentDistanceFromStartKm,
  };
}

/**
 * Calculates exact fractional stop progress based on current wall-clock time vs GTFS stop departure/arrival ISO timestamps.
 */
export function computeLiveProgressFromSchedule(
  stops: RouteStop[],
  nowMs: number = Date.now()
): number | null {
  if (stops.length < 2) return null;
  const times = anchorMonotonicStopTimestampsMs(
    stops.map(
      (s) => s.liveArrivalIso || s.scheduledArrivalIso || s.scheduledDepartureIso
    )
  );

  if (times.some((t) => Number.isNaN(t))) return null;

  if (nowMs <= times[0]) return 0.05;
  if (nowMs >= times[times.length - 1]) return Math.max(0.1, stops.length - 1.08);

  for (let i = 0; i < times.length - 1; i++) {
    if (nowMs >= times[i] && nowMs <= times[i + 1]) {
      const span = Math.max(10_000, times[i + 1] - times[i]);
      const frac = (nowMs - times[i]) / span;
      return i + Math.min(0.98, Math.max(0.02, frac));
    }
  }
  return 0.25;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) {
    const meters = Math.max(20, Math.round((km * 1000) / 10) * 10);
    return `${meters} m`;
  }
  return `${km.toFixed(1)} km`;
}

export function formatMeters(meters: number): string {
  if (meters < 1000) {
    return `${Math.max(15, Math.round(meters))}m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const mins = Math.max(1, Math.round(totalMinutes));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Formats an ETA accurately without misleading modulo wraps.
 */
export function formatAccurateEta(
  etaMinutes: number,
  arrivalIso?: string,
  isTomorrow?: boolean
): { primary: string; compact: string; subLabel: string } {
  const clock = formatIsoToIndianTime(arrivalIso);
  if (etaMinutes <= 1) {
    return {
      primary: 'Arriving Now',
      compact: 'Now',
      subLabel: clock || 'Due',
    };
  }
  if (etaMinutes < 60) {
    return {
      primary: `In ${etaMinutes} min`,
      compact: `${etaMinutes}m`,
      subLabel: clock,
    };
  }
  if (etaMinutes <= 180 && !isTomorrow) {
    const h = Math.floor(etaMinutes / 60);
    const m = etaMinutes % 60;
    const dur = m > 0 ? `${h}h ${m}m` : `${h}h`;
    return {
      primary: `In ${dur}`,
      compact: dur,
      subLabel: clock,
    };
  }
  return {
    primary: clock || `In ${Math.round(etaMinutes / 60)}h`,
    compact: clock || `${Math.round(etaMinutes / 60)}h`,
    subLabel: isTomorrow ? 'Tomorrow' : 'Scheduled',
  };
}

function normalizeStopToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Official Indian RTC stage-based fare estimator (₹ INR) based on route distance & service class.
 */
export function calculateRouteFare(
  route: BusRoute,
  originQuery?: string,
  destQuery?: string
): number {
  if (!originQuery && !destQuery) {
    return Math.max(
      route.baseFareInr,
      Math.round(((route.baseFareInr + route.maxFareInr) * 0.45) / 5) * 5
    );
  }

  const oNorm = originQuery ? normalizeStopToken(originQuery) : '';
  const dNorm = destQuery ? normalizeStopToken(destQuery) : '';

  const originIdx = oNorm
    ? route.stops.findIndex((s) => normalizeStopToken(s.name).includes(oNorm))
    : Math.max(
        0,
        route.stops.findIndex((s) => s.id === route.boardingStopId)
      );
  const destIdx = dNorm
    ? route.stops.findIndex((s) => normalizeStopToken(s.name).includes(dNorm))
    : route.stops.length - 1;

  const start = originIdx >= 0 ? originIdx : 0;
  const end = destIdx >= 0 ? destIdx : route.stops.length - 1;
  if (start === end) return route.baseFareInr;

  const distKm = Math.abs(
    (route.stops[end]?.distanceFromStartKm || 8) -
      (route.stops[start]?.distanceFromStartKm || 0)
  );

  if (distKm > 0.2) {
    const perKm = route.serviceType.includes('Airport')
      ? 6.5
      : route.isAC
      ? 2.4
      : 1.35;
    const computed = Math.round((route.baseFareInr + distKm * perKm) / 5) * 5;
    return Math.max(route.baseFareInr, Math.min(route.maxFareInr, computed));
  }

  const totalStops = Math.max(1, route.stops.length - 1);
  const ratio = Math.abs(end - start) / totalStops;
  const rawFare = route.baseFareInr + (route.maxFareInr - route.baseFareInr) * ratio;
  return Math.max(route.baseFareInr, Math.round(rawFare / 5) * 5);
}

export function getEtaMinutesToStop(
  route: BusRoute,
  bus: UpcomingBusInstance,
  stopIndex: number
): number | null {
  const telemetry = getBusTelemetry(route.stops, bus.routeProgress);
  if (stopIndex <= telemetry.lastPassedStopIndex) {
    return null;
  }
  const stop = route.stops[stopIndex];
  if (stop?.liveArrivalIso || stop?.scheduledArrivalIso) {
    const targetMs = parseTransitTimestampMs(
      stop.liveArrivalIso || stop.scheduledArrivalIso!
    );
    const diffMin = Math.round((targetMs - Date.now()) / 60_000);
    if (!Number.isNaN(diffMin) && diffMin >= 0 && diffMin < 300) {
      return Math.max(1, diffMin);
    }
  }

  const distRemainingKm = Math.max(
    0.1,
    stop.distanceFromStartKm - telemetry.currentDistanceFromStartKm
  );
  const effectiveSpeed = Math.max(16, bus.speedKmh);
  const travelMinutes = (distRemainingKm / effectiveSpeed) * 60 + bus.delayMinutes * 0.4;
  return Math.max(1, Math.round(travelMinutes));
}

export function formatClockTimeFromOffset(
  offsetMinutes: number,
  baseDate: Date = new Date()
): string {
  const target = new Date(baseDate.getTime() + offsetMinutes * 60_000);
  return target.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatIsoToIndianTime(iso?: string): string {
  return formatIstClockTime(iso);
}

export function getCrowdBadgeMeta(level: CrowdLevel, percent: number) {
  if (level === 'low' || percent < 40) {
    return {
      tone: 'live' as const,
      dot: '•',
      shortLabel: `Seats (${percent}%)`,
      fullLabel: `Seats available (${percent}%)`,
      bgClass: 'bg-emerald-50/80 text-emerald-800 border-emerald-200',
      solidClass: 'bg-emerald-600 text-white',
    };
  }
  if (level === 'medium' || percent <= 85) {
    return {
      tone: 'warning' as const,
      dot: '•',
      shortLabel: `Standing (${percent}%)`,
      fullLabel: `Standing room (${percent}%)`,
      bgClass: 'bg-amber-50/80 text-amber-800 border-amber-200',
      solidClass: 'bg-amber-500 text-zinc-950',
    };
  }
  return {
    tone: 'danger' as const,
    dot: '•',
    shortLabel: `Crowded (${percent}%)`,
    fullLabel: `Crowded (${percent}%)`,
    bgClass: 'bg-rose-50/80 text-rose-800 border-rose-200',
    solidClass: 'bg-rose-600 text-white',
  };
}

export function playAlarmChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [587.33, 880, 1174.66, 880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.16);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.16 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.16);
      osc.stop(ctx.currentTime + idx * 0.16 + 0.16);
    });
  } catch {
    // Ignore audio autoplay block
  }
}

/**
 * Normalizes any RTC service type label into a strict BusServiceCategory.
 */
export function inferBusServiceCategory(route: {
  serviceType?: string;
  isAC?: boolean;
  isElectric?: boolean;
  routeNumber?: string;
}): BusServiceCategory {
  const s = (route.serviceType || '').toLowerCase();
  const num = (route.routeNumber || '').toUpperCase();
  if (route.isElectric || s.includes('electric') || s.includes('ev') || s.includes('switch')) {
    return 'Electric';
  }
  if (
    route.isAC ||
    s.includes('ac') ||
    s.includes('vajra') ||
    s.includes('pushpak') ||
    s.includes('shivneri') ||
    num.startsWith('V-') ||
    num.startsWith('KIA')
  ) {
    return 'AC';
  }
  if (s.includes('metro express') || num.endsWith('M')) {
    return 'Metro Express';
  }
  if (s.includes('express') || s.includes('deluxe') || s.includes('fast')) {
    return 'Express';
  }
  return 'Ordinary';
}

/**
 * Transforms a BusRoute + active bus instance into a strict `LiveBusTracking`
 * real-time view model with `passed` | `current` | `upcoming` stop states.
 */
export function buildLiveBusTrackingModel(
  route: BusRoute,
  busIndex = 0,
  nowDate: Date = new Date()
): LiveBusTracking {
  const activeBus = route.buses[busIndex] || route.buses[0];
  const telemetry = getBusTelemetry(
    route.stops,
    activeBus ? activeBus.routeProgress : 0
  );

  // Determine the single active/current stop:
  // If segmentFraction < 0.35, the bus is right at/departing lastPassedStopIndex;
  // otherwise nextStopIndex is the active approaching/current station on the timeline.
  const currentActiveIdx =
    route.stops.length <= 1
      ? 0
      : telemetry.segmentFraction < 0.22
      ? telemetry.lastPassedStopIndex
      : telemetry.nextStopIndex;

  const nextIdx = Math.min(
    Math.max(0, route.stops.length - 1),
    telemetry.nextStopIndex
  );

  const stops: BusStop[] = route.stops.map((stop, idx) => {
    let status: 'passed' | 'current' | 'upcoming';
    if (idx < currentActiveIdx) {
      status = 'passed';
    } else if (idx === currentActiveIdx) {
      status = 'current';
    } else {
      status = 'upcoming';
    }

    const etaMin =
      status === 'passed'
        ? null
        : activeBus
        ? getEtaMinutesToStop(route, activeBus, idx)
        : Math.max(1, stop.scheduledOffsetMin);

    const delayMin = activeBus?.delayMinutes ?? 0;
    const schedClock =
      formatIsoToIndianTime(stop.scheduledArrivalIso || stop.scheduledDepartureIso) ||
      (etaMin !== null
        ? formatClockTimeFromOffset(Math.max(0, etaMin - delayMin), nowDate)
        : formatClockTimeFromOffset(-Math.max(2, (currentActiveIdx - idx) * 4), nowDate));

    const estClock =
      formatIsoToIndianTime(stop.liveArrivalIso || stop.liveDepartureIso) ||
      (etaMin !== null ? formatClockTimeFromOffset(etaMin, nowDate) : schedClock);

    return {
      id: stop.id,
      name: stop.name,
      sequence: idx + 1,
      latitude: stop.lat,
      longitude: stop.lng,
      scheduledArrival: schedClock,
      estimatedArrival: estClock,
      status,
      delayMinutes: delayMin,
      distanceFromStartKm: stop.distanceFromStartKm,
      scheduledOffsetMin: stop.scheduledOffsetMin,
      platform: stop.platform,
      landmark: stop.landmark,
      stopCode: stop.stopCode,
      etaMinutes: etaMin,
    };
  });

  const currentStopObj = stops[currentActiveIdx] || stops[0];
  const nextStopObj = stops[nextIdx] || stops[stops.length - 1];
  const etaNext =
    nextStopObj?.etaMinutes ??
    Math.max(
      1,
      Math.round((telemetry.distanceToNextStopKm / Math.max(16, activeBus?.speedKmh ?? 24)) * 60)
    );

  const delayMinutes = activeBus?.delayMinutes ?? 0;
  const overallStatus: LiveBusTracking['overallStatus'] =
    currentActiveIdx >= stops.length - 1 && telemetry.segmentFraction > 0.95
      ? 'COMPLETED'
      : delayMinutes > 2
      ? 'DELAYED'
      : delayMinutes < -1
      ? 'EARLY'
      : 'ON_TIME';

  return {
    routeId: route.id,
    routeNumber: route.routeNumber,
    busCategory: inferBusServiceCategory(route),
    operator: route.operator,
    origin: route.origin,
    destination: route.destination,
    vehicleNumber: activeBus?.regNumber || `${route.operator}-LIVE`,
    currentLatitude: telemetry.lat,
    currentLongitude: telemetry.lng,
    bearing: Math.round(telemetry.bearingDeg),
    speedKmh: activeBus?.speedKmh ?? 26,
    currentStopId: currentStopObj?.id || '',
    currentStopName: currentStopObj?.name || route.boardingStopName,
    nextStopId: nextStopObj?.id || '',
    nextStopName: nextStopObj?.name || route.destination,
    etaNextStopMinutes: etaNext,
    overallStatus,
    delayMinutes,
    stops,
    lastUpdated: nowDate.toISOString(),
  };
}

