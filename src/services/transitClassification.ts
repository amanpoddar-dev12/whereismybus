import { CrowdLevel } from '../types/transit';
import { getIstCalendarParts, parseTransitTimestampMs } from '../utils/transitTimeEngine';

// In-memory response cache with TTL to keep UI snappy and avoid redundant API calls
const apiCache = new Map<string, { expires: number; data: unknown }>();

/**
 * Fetches JSON from `url` with an in-memory TTL cache.
 */
export async function cachedFetchJson<T>(
  url: string,
  ttlMs = 45_000,
  signal?: AbortSignal
): Promise<T> {
  const now = Date.now();
  const hit = apiCache.get(url);
  if (hit && hit.expires > now) {
    return hit.data as T;
  }

  const resp = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${url}`);
  }
  const data = (await resp.json()) as T;
  apiCache.set(url, { expires: now + ttlMs, data });
  return data;
}

const AGENCY_NAME_RULES: ReadonlyArray<[string[], string]> = [
  [['BMTC'], 'BMTC'],
  [['BMRCL', 'NAMMA METRO'], 'BMRCL Metro'],
  [['TGSRTC', 'TSRTC'], 'TGSRTC'],
  [['HMRL', 'HYDERABAD METRO'], 'Hyd Metro'],
  [['APSRTC', 'ANDHRA'], 'APSRTC'],
  [['KSRTC', 'KERALA'], 'KSRTC-KL'],
  [['KSRTC'], 'KSRTC'],
  [['KARNATAKA'], 'KSRTC'],
  [['KMRL', 'KOCHI METRO'], 'Kochi Metro'],
  [['DTC'], 'DTC'],
  [['DELHI'], 'DTC'],
  [['DMRC'], 'Delhi Metro'],
  [['BEST'], 'BEST'],
  [['MUMBAI'], 'BEST'],
  [['MTC'], 'MTC'],
  [['CHENNAI'], 'MTC'],
  [['CMRL'], 'Chennai Metro'],
  [['INDIAN RAILWAYS'], 'IR-SUBURBAN'],
];

/**
 * Extracts readable Indian RTC operator code from GTFS agencyName or stopId prefix.
 */
export function normalizeOperatorName(agencyName?: string, stopId?: string): string {
  if (agencyName) {
    const up = agencyName.toUpperCase();
    for (const [tokens, label] of AGENCY_NAME_RULES) {
      if (tokens.every((t) => up.includes(t))) {
        return label;
      }
    }
    if (agencyName.length <= 14) return agencyName;
  }
  if (stopId) {
    if (stopId.includes('BMTC')) return 'BMTC';
    if (stopId.includes('TGSRTC') || stopId.includes('TSRTC')) return 'TGSRTC';
    if (stopId.includes('KSRTC')) return 'KSRTC';
    if (stopId.includes('andhra')) return 'APSRTC';
    if (stopId.includes('flixbus')) return 'FlixBus';
    if (stopId.includes('Indian-Railways')) return 'IndianRail';
  }
  return agencyName ? agencyName.slice(0, 14) : 'City Bus';
}

const WOMEN_FREE_SCHEMES: ReadonlyArray<[string, string]> = [
  ['BMTC', 'Shakti ₹0 Women Free'],
  ['KSRTC', 'Shakti ₹0 Women Free'],
  ['TGSRTC', 'Mahalakshmi ₹0 Women Free'],
  ['DTC', 'Pink Ticket ₹0 Women Free'],
  ['MTC', 'Vidiyal Payanam ₹0 Free'],
  ['APSRTC', 'Stree Shakti ₹0 Free'],
];

/**
 * Infers Indian bus service class, AC/Electric status, fare bracket, and Women Free scheme eligibility
 * from real GTFS routeShortName, routeLongName, mode, and operator rules.
 */
export function classifyIndianBusService(
  routeShortName: string,
  operator: string,
  routeLongName = '',
  mode = 'BUS'
) {
  const r = routeShortName.toUpperCase();
  const l = routeLongName.toUpperCase();
  const m = mode.toUpperCase();

  const isMetroOrRail =
    m.includes('SUBWAY') ||
    m.includes('METRO') ||
    m.includes('TRAM') ||
    m.includes('RAIL') ||
    operator.toUpperCase().includes('METRO') ||
    operator === 'IR-SUBURBAN' ||
    operator === 'IndianRail';

  const isAirport =
    r.startsWith('KIA') ||
    r.includes('PUSHPAK') ||
    r.startsWith('AIR') ||
    l.includes('AIRPORT');

  const isVajraOrAc =
    isMetroOrRail ||
    isAirport ||
    r.startsWith('V-') ||
    r.startsWith('VAJRA') ||
    r.includes('AC') ||
    r.includes('GARUDA') ||
    r.includes('VOLVO') ||
    operator === 'FlixBus';

  const isMetroFeeder = r.startsWith('MF-') || r.includes('FEEDER');
  const isElectric =
    isMetroOrRail ||
    isAirport ||
    r.includes('EV') ||
    r.startsWith('500') ||
    r.startsWith('KBS') ||
    isMetroFeeder;

  let serviceType = 'Ordinary';
  if (m.includes('SUBWAY') || m.includes('METRO') || operator.includes('Metro')) {
    serviceType = 'Metro Rail';
  } else if (
    m.includes('RAIL') ||
    operator === 'IR-SUBURBAN' ||
    operator === 'IndianRail'
  ) {
    serviceType = 'Suburban Rail';
  } else if (isAirport) {
    serviceType = 'Airport AC';
  } else if (isVajraOrAc && isElectric) {
    serviceType = 'AC Electric';
  } else if (isVajraOrAc) {
    serviceType = 'AC Deluxe / Vajra';
  } else if (isMetroFeeder) {
    serviceType = 'Metro Feeder';
  }

  let womenFreeEligible = false;
  let womenSchemeName = 'Standard Fare';
  if (!isVajraOrAc && !isAirport && !isMetroOrRail) {
    const matched = WOMEN_FREE_SCHEMES.find(
      ([op]) => operator === op || (op === 'DTC' && operator.includes('Delhi'))
    );
    if (matched) {
      womenFreeEligible = true;
      womenSchemeName = matched[1];
    }
  } else if (isAirport) {
    womenSchemeName = 'Airport Express Pass';
  } else if (isMetroOrRail) {
    womenSchemeName = 'Metro / Rail Smart Fare';
  } else if (isVajraOrAc) {
    womenSchemeName = `${operator} AC Daily Pass Valid`;
  }

  const baseFareInr = isAirport ? 120 : isVajraOrAc ? 20 : 10;
  const maxFareInr = isAirport ? 280 : isVajraOrAc ? 65 : 30;

  return {
    serviceType,
    isElectric,
    isAC: isVajraOrAc,
    womenFreeEligible,
    womenSchemeName,
    baseFareInr,
    maxFareInr,
  };
}

/**
 * Estimates stage fare in INR for a single planned transit leg.
 */
export function estimateTransitLegFareInr(
  distanceMeters: number,
  svc: ReturnType<typeof classifyIndianBusService>
): number {
  const distKm = Math.max(1.2, distanceMeters / 1000);
  if (svc.serviceType === 'Airport AC') {
    return Math.min(280, Math.max(120, Math.round((100 + distKm * 6.2) / 10) * 10));
  }
  if (svc.serviceType === 'Metro Rail') {
    return Math.min(60, Math.max(10, Math.round((10 + distKm * 2.3) / 5) * 5));
  }
  if (svc.serviceType === 'Suburban Rail') {
    return Math.min(35, Math.max(10, Math.round((5 + distKm * 0.8) / 5) * 5));
  }
  const perKm = svc.isAC ? 2.35 : 1.35;
  const raw = Math.round((svc.baseFareInr + distKm * perKm) / 5) * 5;
  return Math.max(svc.baseFareInr, Math.min(svc.maxFareInr, raw));
}

const RTO_PREFIX_MAP: Record<string, string> = {
  BMTC: 'KA-57-F',
  KSRTC: 'KA-01-F',
  TGSRTC: 'TG-09-Z',
  APSRTC: 'AP-16-Z',
  DTC: 'DL-1P-C',
  BEST: 'MH-01-DR',
  MTC: 'TN-01-N',
};

/**
 * Generates a consistent fleet identifier combining state RTO prefix + GTFS trip hash.
 */
export function deriveVehicleIdentifier(
  operator: string,
  tripId: string,
  tripShortName?: string
): string {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) {
    hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  const num4 = 1000 + (hash % 8999);
  const rtoPrefix = RTO_PREFIX_MAP[operator] ?? 'IN-RT';

  if (tripShortName && /^\d{3,6}$/.test(tripShortName)) {
    return `${rtoPrefix}-${tripShortName.slice(-4)}`;
  }
  return `${rtoPrefix}-${num4}`;
}

/**
 * Estimates realistic time-of-day transit occupancy based on target commute hour & service type.
 */
export function estimateLiveOccupancy(
  tripId: string,
  etaMinutes: number,
  isAC: boolean,
  departureIso?: string
): {
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  crowdsourcedCount: number;
} {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) {
    hash = (hash * 17 + tripId.charCodeAt(i)) >>> 0;
  }
  const depMs = departureIso ? parseTransitTimestampMs(departureIso) : Date.now();
  const hour = getIstCalendarParts(Number.isNaN(depMs) ? Date.now() : depMs).hours;
  const isPeak = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 20);
  const isLateNight = hour >= 22 || hour <= 5;
  const base = isLateNight
    ? isAC
      ? 22
      : 28
    : isPeak
    ? isAC
      ? 54
      : 70
    : isAC
    ? 30
    : 40;
  const variance = (hash % 32) - 10 - Math.min(10, Math.floor(etaMinutes / 10));
  const crowdPercent = Math.max(12, Math.min(98, base + variance));
  const crowdLevel: CrowdLevel =
    crowdPercent < 40 ? 'low' : crowdPercent <= 85 ? 'medium' : 'high';
  const crowdsourcedCount = 3 + (hash % 24);
  return { crowdPercent, crowdLevel, crowdsourcedCount };
}
