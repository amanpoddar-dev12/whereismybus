import {
  BusRoute,
  RealTransitStop,
  SuggestionCategory,
} from '../types/transit';
import { formatAccurateEta, formatMeters, haversineMeters } from './transitHelpers';

export interface UnifiedSearchSuggestion {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  isTransitStop: boolean;
  stopId?: string;
  stopCode?: string;
  agencyPrefix?: string;
  distanceMeters?: number;
  category: SuggestionCategory;
  routeId?: string;
  routeNumber?: string;
  score: number;
}

/**
 * Common Indian Bus Station & Hub Abbreviations / Aliases for instant commuter recognition.
 */
const STATION_ALIAS_GROUPS: string[][] = [
  ['kbs', 'majestic', 'kempegowda bus station', 'kempegowda'],
  ['csb', 'silk board', 'central silk board'],
  ['kr puram', 'krp', 'krishnarajapuram', 'k r puram'],
  ['kr market', 'k r market', 'kalasipalyam', 'city market'],
  ['ecity', 'e city', 'electronic city', 'electronics city'],
  ['kia', 'bial', 'kempegowda international airport', 'devanahalli airport'],
  ['sbs', 'shivajinagar', 'shivaji nagar'],
  ['ypr', 'yeshwanthpur', 'yesvantpur'],
  ['tin factory', 'benniganahalli'],
  ['ttmc', 'shantinagar', 'jayanagar', 'banashankari', 'vijayanagar', 'kengeri', 'whitefield', 'itpl'],
  ['secbad', 'secunderabad', 'rathifile', 'jubilee bus station', 'jbs'],
  ['mgbs', 'imlibun', 'mahatma gandhi bus station', 'cbs'],
  ['hitech city', 'hi tech city', 'hitex', 'madhapur', 'gachibowli'],
  ['cmbt', 'koyambedu', 'puratchi thalaivar'],
  ['t nagar', 'thyagaraya nagar', 'panagal park'],
  ['isbt', 'kashmere gate', 'anand vihar', 'sarai kale khan'],
  ['cp', 'connaught place', 'rajiv chowk', 'shivaji stadium'],
  ['pnbs', 'pandit nehru bus station', 'benz circle'],
  ['csmt', 'vt', 'chhatrapati shivaji'],
  ['vyttila', 'vyttila mobility hub', 'ernakulam'],
];

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[#.,/_()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStationHub(name: string, agencyPrefix = '', description = ''): boolean {
  const combined = `${name} ${agencyPrefix} ${description}`.toLowerCase();
  return (
    combined.includes('bus station') ||
    combined.includes('bus stand') ||
    combined.includes('terminal') ||
    combined.includes('terminus') ||
    combined.includes('ttmc') ||
    combined.includes('hub') ||
    combined.includes('isbt') ||
    combined.includes('majestic') ||
    combined.includes('junction') ||
    combined.includes('depot') ||
    combined.includes('central') ||
    combined.includes('airport')
  );
}

/**
 * Fast bounded Levenshtein edit distance (bails out if > maxDist).
 */
function boundedEditDistance(a: string, b: string, maxDist = 2): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;

  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

function expandQueryAliases(normQuery: string): string[] {
  const expansions = new Set<string>([normQuery]);
  for (const group of STATION_ALIAS_GROUPS) {
    const matchedInGroup = group.some(
      (alias) =>
        alias === normQuery ||
        (normQuery.length >= 3 && alias.startsWith(normQuery)) ||
        (alias.length >= 3 && normQuery.includes(alias))
    );
    if (matchedInGroup) {
      for (const alias of group) {
        expansions.add(alias);
      }
    }
  }
  return Array.from(expansions);
}

/**
 * Scores how well a transit station/place matches the user's query (0 = no match, 100+ = top match).
 */
export function scoreStationMatch(
  query: string,
  targetName: string,
  stopCode?: string,
  extraText = '',
  distanceMeters?: number,
  isGtfs = false,
  isHub = false
): number {
  const qNorm = normalizeSearchText(query);
  if (!qNorm) return 0;

  const nameNorm = normalizeSearchText(targetName);
  const codeNorm = stopCode ? normalizeSearchText(stopCode) : '';
  const extraNorm = normalizeSearchText(extraText);

  let textScore = 0;

  // 1. Exact or Stop Code match
  if (nameNorm === qNorm || (codeNorm && codeNorm === qNorm)) {
    textScore = 105;
  } else if (codeNorm && codeNorm.startsWith(qNorm)) {
    textScore = 96;
  } else if (nameNorm.startsWith(qNorm)) {
    textScore = 92;
  } else {
    const nameWords = nameNorm.split(' ').filter(Boolean);
    const queryWords = qNorm.split(' ').filter(Boolean);

    // 2. Word-boundary prefix match for all query tokens
    const allTokensPrefixMatch =
      queryWords.length > 0 &&
      queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)));

    if (allTokensPrefixMatch) {
      textScore = 84;
    } else if (nameNorm.includes(qNorm)) {
      textScore = 76;
    } else {
      // 3. Alias expansion match (e.g. "kbs" -> "Kempegowda Bus Station")
      const aliases = expandQueryAliases(qNorm);
      for (const alt of aliases) {
        if (alt !== qNorm && (nameNorm.includes(alt) || extraNorm.includes(alt))) {
          textScore = Math.max(textScore, 82);
          break;
        }
      }

      // 4. Secondary metadata match (agency / street / district)
      if (textScore === 0 && extraNorm.includes(qNorm)) {
        textScore = 58;
      }

      // 5. Typo-tolerant fuzzy word match (1-2 edit distance on words >= 4 chars)
      if (textScore === 0 && qNorm.length >= 4) {
        const allFuzzyMatch = queryWords.every((qw) => {
          if (qw.length < 3) return nameNorm.includes(qw);
          const maxEdits = qw.length >= 6 ? 2 : 1;
          return nameWords.some((nw) => {
            const slice = nw.slice(0, Math.min(nw.length, qw.length + 1));
            return (
              boundedEditDistance(qw, nw, maxEdits) <= maxEdits ||
              boundedEditDistance(qw, slice, 1) <= 1
            );
          });
        });
        if (allFuzzyMatch) {
          textScore = 62;
        }
      }
    }
  }

  if (textScore === 0) return 0;

  // Quality & Proximity Bonuses
  let bonus = 0;
  if (isGtfs) bonus += 10;
  if (isHub) bonus += 9;
  if (distanceMeters !== undefined) {
    if (distanceMeters <= 500) bonus += 14;
    else if (distanceMeters <= 2000) bonus += 10;
    else if (distanceMeters <= 8000) bonus += 6;
    else if (distanceMeters <= 25000) bonus += 3;
    else if (distanceMeters > 80000) bonus -= 12; // de-rank faraway out-of-city hits
  }

  return textScore + bonus;
}

/**
 * Filters and ranks local `RealTransitStop` items using fuzzy + alias + stopCode search.
 */
export function searchLocalStopsSmart(
  stops: RealTransitStop[],
  query: string,
  limit = 100
): RealTransitStop[] {
  const q = query.trim();
  if (!q) return stops;

  const scored: Array<{ stop: RealTransitStop; score: number }> = [];
  for (const st of stops) {
    const hub = st.isHub ?? isStationHub(st.name, st.agencyPrefix, st.description);
    const sc = scoreStationMatch(
      q,
      st.name,
      st.stopCode,
      `${st.agencyPrefix} ${st.description || ''}`,
      st.distanceFromUserMeters,
      st.source === 'GTFS',
      hub
    );
    if (sc > 0) {
      scored.push({ stop: st, score: sc });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (
      (a.stop.distanceFromUserMeters ?? 999999) -
      (b.stop.distanceFromUserMeters ?? 999999)
    );
  });

  return scored.slice(0, limit).map((item) => item.stop);
}

/**
 * Merges Local Area Stops + Active Bus Routes + Remote Geocode Suggestions into a ranked, deduplicated list.
 */
export function buildHybridSearchSuggestions(params: {
  query: string;
  localStops: RealTransitStop[];
  routes: BusRoute[];
  remoteResults: Array<{
    id: string;
    name: string;
    subtitle: string;
    lat: number;
    lon: number;
    isTransitStop: boolean;
    stopId?: string;
    stopCode?: string;
  }>;
  refLat: number;
  refLon: number;
  includeRoutes?: boolean;
  maxResults?: number;
}): UnifiedSearchSuggestion[] {
  const {
    query,
    localStops,
    routes,
    remoteResults,
    refLat,
    refLon,
    includeRoutes = true,
    maxResults = 10,
  } = params;

  const q = query.trim();
  const qNorm = normalizeSearchText(q);
  if (!qNorm) return [];

  const candidates: UnifiedSearchSuggestion[] = [];

  // 1. Direct Bus Route Number / Corridor Matches (when searching Destination or general route)
  if (includeRoutes && routes.length > 0) {
    for (const r of routes) {
      const rNumNorm = normalizeSearchText(r.routeNumber);
      const rRawLower = r.routeNumber.toLowerCase();
      const qRawLower = q.toLowerCase();

      let routeScore = 0;
      if (rRawLower === qRawLower || rNumNorm === qNorm) {
        routeScore = 112;
      } else if (rRawLower.startsWith(qRawLower) || rNumNorm.startsWith(qNorm)) {
        routeScore = 95;
      } else if (qNorm.length >= 3 && rRawLower.includes(qRawLower)) {
        routeScore = 80;
      }

      if (routeScore > 0) {
        const nextBus = r.buses[0];
        const etaMeta = nextBus
          ? formatAccurateEta(nextBus.etaMinutes, nextBus.arrivalIso, nextBus.isTomorrow)
          : null;
        const stopTarget = r.stops[r.stops.length - 1] || r.stops[0];
        candidates.push({
          id: `route-${r.id}`,
          name: `${r.operator} ${r.routeNumber} • ${r.origin} → ${r.destination}`,
          subtitle: `${r.serviceType}${
            etaMeta ? ` • ${etaMeta.primary}` : ''
          } • Board at ${r.boardingStopName}`,
          lat: stopTarget?.lat ?? refLat,
          lon: stopTarget?.lng ?? refLon,
          isTransitStop: true,
          category: 'route',
          routeId: r.id,
          routeNumber: r.routeNumber,
          score: routeScore,
        });
      }
    }
  }

  // 2. Local Verified GTFS + OSM Stations (0ms instant fuzzy match with stopCode & walking distance!)
  for (const st of localStops) {
    const hub = st.isHub ?? isStationHub(st.name, st.agencyPrefix, st.description);
    const dist =
      st.distanceFromUserMeters ??
      Math.round(haversineMeters(refLat, refLon, st.lat, st.lon));
    const sc = scoreStationMatch(
      q,
      st.name,
      st.stopCode,
      `${st.agencyPrefix} ${st.description || ''}`,
      dist,
      st.source === 'GTFS',
      hub
    );
    if (sc > 0) {
      const category: SuggestionCategory = hub
        ? 'terminal'
        : st.source === 'GTFS'
        ? 'gtfs_stop'
        : 'osm_stop';

      candidates.push({
        id: st.stopId,
        name: st.name,
        subtitle: `${st.agencyPrefix}${st.stopCode ? ` #${st.stopCode}` : ''}${
          st.description ? ` • ${st.description}` : ''
        } • ${formatMeters(dist)} away`,
        lat: st.lat,
        lon: st.lon,
        isTransitStop: true,
        stopId: st.stopId,
        stopCode: st.stopCode,
        agencyPrefix: st.agencyPrefix,
        distanceMeters: dist,
        category,
        score: sc + 4, // slight local verification boost
      });
    }
  }

  // 3. Remote City-Wide / Nationwide GTFS + Photon Results
  for (const rem of remoteResults) {
    const dist = Math.round(haversineMeters(refLat, refLon, rem.lat, rem.lon));
    const hub = isStationHub(rem.name, rem.subtitle);
    const baseSc = scoreStationMatch(
      q,
      rem.name,
      rem.stopCode,
      rem.subtitle,
      dist,
      Boolean(rem.stopId),
      hub
    );
    // Keep remote geocode hits even if name is in local script or partial match (give minimum 52)
    const sc = Math.max(baseSc, rem.isTransitStop ? 60 : 50);

    const category: SuggestionCategory = hub
      ? 'terminal'
      : rem.stopId
      ? 'gtfs_stop'
      : rem.isTransitStop
      ? 'osm_stop'
      : 'landmark';

    const cleanSub = rem.subtitle.replace(/^[🚌🚏📍]\s*/, '');
    candidates.push({
      id: rem.id,
      name: rem.name,
      subtitle: `${cleanSub} • ${formatMeters(dist)}`,
      lat: rem.lat,
      lon: rem.lon,
      isTransitStop: rem.isTransitStop,
      stopId: rem.stopId,
      stopCode: rem.stopCode,
      distanceMeters: dist,
      category,
      score: sc,
    });
  }

  // Sort by highest relevance score first, then nearest distance
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999);
  });

  // Smart spatial + name deduplication (keep highest-scored GTFS entry when duplicates are within 160m)
  const deduped: UnifiedSearchSuggestion[] = [];
  for (const c of candidates) {
    if (c.category === 'route') {
      if (!deduped.some((d) => d.routeId === c.routeId)) {
        deduped.push(c);
      }
      continue;
    }

    const cNorm = normalizeSearchText(c.name);
    const isDuplicate = deduped.some((existing) => {
      if (existing.category === 'route') return false;
      const eNorm = normalizeSearchText(existing.name);
      if (eNorm !== cNorm) return false;
      // If both have distinct explicit GTFS platform stopCodes and user typed >3 chars, allow up to 2 platforms
      if (
        existing.stopCode &&
        c.stopCode &&
        existing.stopCode !== c.stopCode &&
        qNorm.length >= 4
      ) {
        return false;
      }
      const near = haversineMeters(existing.lat, existing.lon, c.lat, c.lon) < 220;
      return near;
    });

    if (!isDuplicate) {
      deduped.push(c);
    }
    if (deduped.length >= maxResults) break;
  }

  return deduped;
}

/**
 * Splits a label into `{ text, matched }` chunks so React can highlight search matches cleanly.
 */
export function splitHighlightSegments(
  text: string,
  query: string
): Array<{ text: string; matched: boolean }> {
  const q = query.trim();
  if (!q || q.length < 1) return [{ text, matched: false }];

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = escaped.split(/\s+/).filter((t) => t.length >= 1);
  if (tokens.length === 0) return [{ text, matched: false }];

  try {
    const regex = new RegExp(`(${tokens.join('|')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length <= 1) return [{ text, matched: false }];
    const lowerTokens = tokens.map((t) => t.toLowerCase().replace(/\\/g, ''));
    return parts
      .filter((p) => p.length > 0)
      .map((part) => ({
        text: part,
        matched: lowerTokens.some((lt) => part.toLowerCase() === lt),
      }));
  } catch {
    return [{ text, matched: false }];
  }
}
