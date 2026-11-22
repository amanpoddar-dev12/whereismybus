import {
  BusRoute,
  LiveMapVehicle,
  PlannedJourney,
  PlannedJourneyLeg,
  RealTransitStop,
  RouteStop,
  ScheduleTimeBand,
  UpcomingBusInstance,
} from '../types/transit';
import {
  cachedFetchJson,
  classifyIndianBusService,
  deriveVehicleIdentifier,
  estimateLiveOccupancy,
  estimateTransitLegFareInr,
  normalizeOperatorName,
} from './transitClassification';
export { classifyIndianBusService, normalizeOperatorName };
import {
  computeLiveProgressFromSchedule,
  decodeEncodedPolyline,
  haversineMeters,
} from '../utils/transitHelpers';
import {
  anchorMonotonicStopTimestampsMs,
  buildUpcomingIstScheduleWindows,
  classifyDepartureScheduleBand,
  getIstCalendarParts,
  getNextIstMorningEpochMs,
  isIstLateNightWindow,
  parseTransitTimestampMs,
  sanitizeAndValidateItinerary,
} from '../utils/transitTimeEngine';
import { isStationHub } from '../utils/stationSearchEngine';

const TRANSITOUS_BASE = 'https://api.transitous.org/api/v1';
const PHOTON_BASE = 'https://photon.komoot.io';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * 1. Reverse geocodes user's live GPS coordinates via Nominatim.
 */
export async function reverseGeocodeLocation(
  lat: number,
  lon: number
): Promise<{ addressLabel: string; cityLabel: string }> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat.toFixed(
      5
    )}&lon=${lon.toFixed(5)}&zoom=16`;
    const data = await cachedFetchJson<{
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    }>(url, 120_000);

    const addr = data.address || {};
    const neighbourhood =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.road ||
      data.name ||
      'Current Area';
    const city =
      addr.city ||
      addr.town ||
      addr.state_district ||
      addr.county ||
      addr.state ||
      'India';

    return {
      addressLabel: `${neighbourhood}, ${city}`,
      cityLabel: city,
    };
  } catch {
    return {
      addressLabel: `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
      cityLabel: 'Live GPS Area',
    };
  }
}

interface TransitousStopRaw {
  name: string;
  stopId: string;
  stopCode?: string;
  description?: string;
  lat: number;
  lon: number;
  modes?: string[];
  importance?: number;
}

interface PhotonFeatureRaw {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    osm_value?: string;
  };
}

/**
 * 2. Fetches ALL real bus stations & transit stops around a coordinate by combining:
 *    - Official GTFS database (`api.transitous.org/api/v1/map/stops`)
 *    - OpenStreetMap live stops (`photon.komoot.io/reverse` for highway=bus_stop & amenity=bus_station)
 */
export async function fetchAllStopsAroundLocation(
  centerLat: number,
  centerLon: number,
  referenceUserLat?: number | null,
  referenceUserLon?: number | null,
  spanDeg = 0.065,
  signal?: AbortSignal
): Promise<RealTransitStop[]> {
  const minLat = (centerLat - spanDeg).toFixed(4);
  const minLon = (centerLon - spanDeg).toFixed(4);
  const maxLat = (centerLat + spanDeg).toFixed(4);
  const maxLon = (centerLon + spanDeg).toFixed(4);

  const gtfsUrl = `${TRANSITOUS_BASE}/map/stops?min=${minLat},${minLon}&max=${maxLat},${maxLon}`;
  const osmStopsUrl = `${PHOTON_BASE}/reverse?lat=${centerLat.toFixed(
    5
  )}&lon=${centerLon.toFixed(5)}&radius=4&limit=40&osm_tag=highway:bus_stop`;
  const osmStationsUrl = `${PHOTON_BASE}/reverse?lat=${centerLat.toFixed(
    5
  )}&lon=${centerLon.toFixed(5)}&radius=8&limit=25&osm_tag=amenity:bus_station`;

  const [gtfsRes, osmStopsRes, osmStationsRes] = await Promise.allSettled([
    cachedFetchJson<TransitousStopRaw[]>(gtfsUrl, 90_000, signal),
    cachedFetchJson<{ features: PhotonFeatureRaw[] }>(osmStopsUrl, 90_000, signal),
    cachedFetchJson<{ features: PhotonFeatureRaw[] }>(osmStationsUrl, 90_000, signal),
  ]);

  const refLat = referenceUserLat ?? centerLat;
  const refLon = referenceUserLon ?? centerLon;

  const stops: RealTransitStop[] = [];
  const seenKeys = new Set<string>();

  if (gtfsRes.status === 'fulfilled' && Array.isArray(gtfsRes.value)) {
    for (const s of gtfsRes.value) {
      if (!s.name || typeof s.lat !== 'number' || typeof s.lon !== 'number') continue;
      const cleanName = s.name.replace(/,\s*-\s*$/, '').trim();
      const agencyPrefix = normalizeOperatorName(undefined, s.stopId);
      const dist = haversineMeters(refLat, refLon, s.lat, s.lon);
      stops.push({
        stopId: s.stopId,
        name: cleanName,
        stopCode: s.stopCode,
        description: s.description,
        lat: s.lat,
        lon: s.lon,
        modes: s.modes && s.modes.length > 0 ? s.modes : ['BUS'],
        agencyPrefix,
        source: 'GTFS',
        distanceFromUserMeters: Math.round(dist),
        isHub: isStationHub(cleanName, agencyPrefix, s.description),
      });
      seenKeys.add(`${cleanName.toLowerCase().slice(0, 14)}:${s.lat.toFixed(3)}:${s.lon.toFixed(3)}`);
    }
  }

  // Merge OSM bus stations & stops (crucial for areas or streets without GTFS stops)
  const photonFeatures: PhotonFeatureRaw[] = [
    ...(osmStationsRes.status === 'fulfilled' ? osmStationsRes.value.features || [] : []),
    ...(osmStopsRes.status === 'fulfilled' ? osmStopsRes.value.features || [] : []),
  ];

  for (const f of photonFeatures) {
    const name = f.properties?.name?.trim();
    if (!name) continue;
    const [lon, lat] = f.geometry.coordinates;
    const dedupeKey = `${name.toLowerCase().slice(0, 14)}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const dist = haversineMeters(refLat, refLon, lat, lon);
    const subtitleParts = [f.properties.street, f.properties.district].filter(Boolean);
    const agencyPrefix =
      f.properties.osm_value === 'bus_station' ? 'Bus Terminal' : 'City Bus Stop';
    const desc =
      subtitleParts.join(', ') ||
      (f.properties.osm_value === 'bus_station' ? 'Bus Terminal' : 'Bus Stop');
    stops.push({
      stopId: `osm-stop-${f.properties.osm_id}`,
      name,
      description: desc,
      lat,
      lon,
      modes: ['BUS'],
      agencyPrefix,
      source: 'OSM',
      distanceFromUserMeters: Math.round(dist),
      isHub:
        f.properties.osm_value === 'bus_station' ||
        isStationHub(name, agencyPrefix, desc),
    });
  }

  stops.sort(
    (a, b) => (a.distanceFromUserMeters ?? 999999) - (b.distanceFromUserMeters ?? 999999)
  );
  return stops;
}

interface TransitousStopTimeItem {
  place: {
    name: string;
    stopId: string;
    stopCode?: string;
    lat: number;
    lon: number;
    arrival?: string;
    departure?: string;
    scheduledArrival?: string;
    scheduledDeparture?: string;
  };
  mode: string;
  realTime: boolean;
  headsign?: string;
  tripFrom?: {
    name: string;
    stopId: string;
    stopCode?: string;
    lat: number;
    lon: number;
  };
  tripTo?: {
    name: string;
    stopId: string;
    stopCode?: string;
    lat: number;
    lon: number;
  };
  agencyId?: string;
  agencyName?: string;
  agencyUrl?: string;
  routeId?: string;
  directionId?: string;
  tripId: string;
  routeShortName?: string;
  routeLongName?: string;
  tripShortName?: string;
  displayName?: string;
  source?: string;
}

/**
 * 3. Fetches real GTFS upcoming departures from the nearest/selected GTFS stops and aggregates
 *    them into rich BusRoute cards with strictly chronological, true-timestamp ETAs.
 */
export async function fetchLiveRoutesForStops(
  nearbyStops: RealTransitStop[],
  anchorStop?: RealTransitStop | null,
  signal?: AbortSignal,
  targetDepartureIso?: string
): Promise<BusRoute[]> {
  const gtfsBusStops = nearbyStops.filter(
    (s) => s.source === 'GTFS' && s.modes.includes('BUS')
  );
  const gtfsAnyStops = nearbyStops.filter((s) => s.source === 'GTFS');

  const candidateStops: RealTransitStop[] = [];
  if (anchorStop && anchorStop.source === 'GTFS') {
    candidateStops.push(anchorStop);
  }

  const pool = gtfsBusStops.length > 0 ? gtfsBusStops : gtfsAnyStops;
  // Sample up to 5 distinct nearby stops/platforms (within reasonable radius of anchor if anchor is set)
  for (const s of pool) {
    if (candidateStops.length >= 5) break;
    if (
      anchorStop &&
      haversineMeters(anchorStop.lat, anchorStop.lon, s.lat, s.lon) > 1200 &&
      candidateStops.length >= 2
    ) {
      continue;
    }
    if (!candidateStops.some((c) => c.stopId === s.stopId)) {
      candidateStops.push(s);
    }
  }

  const parsedRefMs = targetDepartureIso
    ? parseTransitTimestampMs(targetDepartureIso)
    : Date.now();
  const refMs = Number.isNaN(parsedRefMs) ? Date.now() : parsedRefMs;
  const refIstDateStr = getIstCalendarParts(refMs).dateString;

  const routeMap = new Map<string, BusRoute>();

  if (candidateStops.length > 0) {
    const fetchForTimeWindow = async (isoTime?: string) => {
      const effectiveIso = isoTime || (targetDepartureIso ? targetDepartureIso : undefined);
      const timeParam = effectiveIso ? `&time=${encodeURIComponent(effectiveIso)}` : '';
      const results = await Promise.allSettled(
        candidateStops.map((st) =>
          cachedFetchJson<{ stopTimes: TransitousStopTimeItem[] }>(
            `${TRANSITOUS_BASE}/stoptimes?stopId=${encodeURIComponent(
              st.stopId
            )}&n=75${timeParam}`,
            35_000,
            signal
          )
        )
      );

      for (const res of results) {
        if (res.status !== 'fulfilled' || !Array.isArray(res.value?.stopTimes)) continue;
        for (const item of res.value.stopTimes) {
          const rawRouteLabel = (
            item.routeShortName ||
            item.tripShortName ||
            item.displayName ||
            item.headsign ||
            'BUS'
          ).trim();
          const routeNum = (() => {
            if (rawRouteLabel.length <= 9) return rawRouteLabel;
            const colorLine = rawRouteLabel.match(
              /\b(blue|red|green|yellow|purple|pink|magenta|violet|aqua|orange)\s*line\b/i
            );
            if (colorLine) return colorLine[1].toUpperCase();
            const codePrefix = rawRouteLabel.match(/^([A-Z0-9]{1,4}[-/]?[A-Z0-9]{1,5})\b/i);
            if (codePrefix && /\d/.test(codePrefix[1])) {
              return codePrefix[1].toUpperCase();
            }
            if (item.mode && item.mode !== 'BUS') {
              return item.mode.slice(0, 6).toUpperCase();
            }
            return rawRouteLabel.split(/[\s\-–—:]+/)[0].slice(0, 8).toUpperCase() || 'BUS';
          })();
          const operator = normalizeOperatorName(item.agencyName, item.place?.stopId);
          const headsign = (item.headsign || item.tripTo?.name || 'Terminal')
            .replace(/,\s*-\s*$/, '')
            .trim();

          // Skip departures where this stop IS the final terminal (alighting-only!)
          if (item.tripTo && item.tripTo.stopId === item.place.stopId) {
            continue;
          }

          const arrIso =
            item.place.departure ||
            item.place.arrival ||
            item.place.scheduledDeparture ||
            item.place.scheduledArrival;

          if (!arrIso) continue;
          const arrMs = parseTransitTimestampMs(arrIso);
          if (Number.isNaN(arrMs)) continue;

          // Filter out buses that have ALREADY departed before reference time (allow 45s grace for "Arriving Now")
          if (arrMs < refMs - 45_000) {
            continue;
          }

          const schedIso =
            item.place.scheduledDeparture ||
            item.place.scheduledArrival ||
            arrIso;
          const schedMs = parseTransitTimestampMs(schedIso);

          // True chronological minutes until departure/arrival — NO fake modulo!
          const etaMinutes = Math.max(0, Math.round((arrMs - refMs) / 60_000));
          const isTomorrow =
            getIstCalendarParts(arrMs).dateString !== refIstDateStr ||
            etaMinutes > 240;

          const delayMinutes = Number.isNaN(schedMs)
            ? 0
            : Math.max(0, Math.round((arrMs - schedMs) / 60_000));

          const svc = classifyIndianBusService(
            routeNum,
            operator,
            item.routeLongName,
            item.mode
          );
          const occ = estimateLiveOccupancy(
            item.tripId,
            etaMinutes,
            svc.isAC,
            arrIso
          );

          const groupKey = `${operator}::${routeNum}::${headsign}`;

          const busInstance: UpcomingBusInstance = {
            id: item.tripId,
            tripId: item.tripId,
            regNumber: deriveVehicleIdentifier(
              operator,
              item.tripId,
              item.tripShortName
            ),
            etaMinutes,
            arrivalIso: arrIso,
            scheduledArrivalIso: schedIso,
            delayMinutes,
            isRealTimeFeed: Boolean(item.realTime),
            isTomorrow,
            crowdPercent: occ.crowdPercent,
            crowdLevel: occ.crowdLevel,
            speedKmh: svc.serviceType.includes('Airport') ? 48 : 26,
            routeProgress: 0.65,
            crowdsourcedCount: occ.crowdsourcedCount,
          };

          const existing = routeMap.get(groupKey);
          if (!existing) {
            const originStopObj = item.tripFrom || item.place;
            const destStopObj = item.tripTo || item.place;
            const totalKm = Math.max(
              1.5,
              (haversineMeters(
                originStopObj.lat,
                originStopObj.lon,
                destStopObj.lat,
                destStopObj.lon
              ) *
                1.32) /
                1000
            );
            const midKm = Math.max(
              0.5,
              Math.min(
                totalKm - 0.3,
                (haversineMeters(
                  originStopObj.lat,
                  originStopObj.lon,
                  item.place.lat,
                  item.place.lon
                ) *
                  1.3) /
                  1000
              )
            );

            const initialStops: RouteStop[] = [];
            if (item.tripFrom && item.tripFrom.stopId !== item.place.stopId) {
              initialStops.push({
                id: item.tripFrom.stopId,
                name: item.tripFrom.name.replace(/,\s*-\s*$/, ''),
                stopCode: item.tripFrom.stopCode,
                landmark: 'Origin Terminal',
                lat: item.tripFrom.lat,
                lng: item.tripFrom.lon,
                distanceFromStartKm: 0,
                scheduledOffsetMin: 0,
                platform: item.tripFrom.stopCode
                  ? `Stop #${item.tripFrom.stopCode}`
                  : 'Origin',
              });
            }

            initialStops.push({
              id: item.place.stopId,
              name: item.place.name.replace(/,\s*-\s*$/, ''),
              stopCode: item.place.stopCode,
              landmark: 'Boarding Stop',
              lat: item.place.lat,
              lng: item.place.lon,
              distanceFromStartKm:
                initialStops.length === 0 ? 0 : Number(midKm.toFixed(1)),
              scheduledArrivalIso: schedIso,
              liveArrivalIso: arrIso,
              scheduledOffsetMin:
                initialStops.length === 0 ? 0 : Math.round(midKm * 2.6),
              platform: item.place.stopCode
                ? `Stop #${item.place.stopCode}`
                : 'Boarding',
            });

            if (item.tripTo && item.tripTo.stopId !== item.place.stopId) {
              initialStops.push({
                id: item.tripTo.stopId,
                name: item.tripTo.name.replace(/,\s*-\s*$/, ''),
                stopCode: item.tripTo.stopCode,
                landmark: 'Destination Terminal',
                lat: item.tripTo.lat,
                lng: item.tripTo.lon,
                distanceFromStartKm: Number(totalKm.toFixed(1)),
                scheduledOffsetMin: Math.round(totalKm * 2.6),
                platform: item.tripTo.stopCode
                  ? `Stop #${item.tripTo.stopCode}`
                  : 'Terminal',
              });
            }

            routeMap.set(groupKey, {
              id: groupKey,
              routeNumber: routeNum,
              operator,
              agencyUrl: item.agencyUrl,
              serviceType: svc.serviceType,
              isElectric: svc.isElectric,
              isAC: svc.isAC,
              womenFreeEligible: svc.womenFreeEligible,
              womenSchemeName: svc.womenSchemeName,
              name:
                item.routeLongName?.replace(/â/g, '↔') ||
                `${originStopObj.name} → ${destStopObj.name}`,
              headsign,
              origin: originStopObj.name.replace(/,\s*-\s*$/, ''),
              destination: destStopObj.name.replace(/,\s*-\s*$/, ''),
              boardingStopName: item.place.name.replace(/,\s*-\s*$/, ''),
              boardingStopId: item.place.stopId,
              boardingStopLat: item.place.lat,
              boardingStopLon: item.place.lon,
              baseFareInr: svc.baseFareInr,
              maxFareInr: svc.maxFareInr,
              dataSourceLabel: `Official GTFS (${operator})`,
              stops: initialStops,
              fullTripLoaded: false,
              buses: [busInstance],
            });
          } else if (
            existing.buses.length < 7 &&
            !existing.buses.some((b) => b.tripId === busInstance.tripId)
          ) {
            existing.buses.push(busInstance);
            existing.buses.sort((a, b) => a.etaMinutes - b.etaMinutes);
          }
        }
      }
    };

    await fetchForTimeWindow();

    // Also sample upcoming schedule windows (Morning peak during late night, or +3h ahead during day)
    // so routes operating in other time slots & later departures per route are recommended too!
    if (!targetDepartureIso) {
      const secondaryWindowMs = isIstLateNightWindow(refMs)
        ? getNextIstMorningEpochMs(refMs, 7, 30)
        : refMs + 3 * 3600_000;
      await fetchForTimeWindow(new Date(secondaryWindowMs).toISOString());
    }
  }

  // Fallback for cities where Transitous has <3 local GTFS routes: build real street-snapped corridors via OSRM
  const osmStops = nearbyStops.filter((s) => s.source === 'OSM');
  if (routeMap.size < 3 && osmStops.length >= 4) {
    const hub = anchorStop || osmStops[0];
    const targets = osmStops
      .filter(
        (s) =>
          s.stopId !== hub.stopId &&
          haversineMeters(hub.lat, hub.lon, s.lat, s.lon) > 650
      )
      .slice(0, 5);

    await Promise.allSettled(
      targets.map(async (target, idx) => {
        const mids = osmStops
          .filter(
            (m) =>
              m.stopId !== hub.stopId &&
              m.stopId !== target.stopId &&
              haversineMeters(hub.lat, hub.lon, m.lat, m.lon) <
                haversineMeters(hub.lat, hub.lon, target.lat, target.lon)
          )
          .slice(idx, idx + 3);

        const chain = [hub, ...mids, target];
        const coordParam = chain.map((c) => `${c.lon},${c.lat}`).join(';');
        let poly: [number, number][] | undefined;
        let totalMeters =
          haversineMeters(hub.lat, hub.lon, target.lat, target.lon) * 1.3;

        try {
          const osrm = await cachedFetchJson<{
            routes?: Array<{
              distance: number;
              duration: number;
              geometry: { coordinates: [number, number][] };
            }>;
          }>(
            `${OSRM_BASE}/${coordParam}?overview=full&geometries=geojson`,
            180_000,
            signal
          );
          if (osrm.routes?.[0]) {
            totalMeters = osrm.routes[0].distance;
            poly = osrm.routes[0].geometry.coordinates.map(([ln, lt]) => [lt, ln]);
          }
        } catch {
          // Use direct stop chain if OSRM busy
        }

        let cumKm = 0;
        const routeStops: RouteStop[] = chain.map((st, sIdx) => {
          if (sIdx > 0) {
            cumKm +=
              (haversineMeters(
                chain[sIdx - 1].lat,
                chain[sIdx - 1].lon,
                st.lat,
                st.lon
              ) *
                1.25) /
              1000;
          }
          return {
            id: st.stopId,
            name: st.name,
            landmark: st.description || 'OSM Verified Bus Stop',
            lat: st.lat,
            lng: st.lon,
            distanceFromStartKm: Number(cumKm.toFixed(1)),
            scheduledOffsetMin: Math.round(cumKm * 2.8),
            platform: `Stop ${sIdx + 1}`,
          };
        });

        const corridorCode = `C-${101 + idx}`;
        const key = `OSM::${hub.stopId}::${target.stopId}`;
        const mkBus = (slot: number, eta: number): UpcomingBusInstance => ({
          id: `${key}-b${slot}`,
          tripId: `${key}-b${slot}`,
          regNumber: deriveVehicleIdentifier('City Bus', `${key}-${slot}`),
          etaMinutes: eta,
          arrivalIso: new Date(refMs + eta * 60_000).toISOString(),
          scheduledArrivalIso: new Date(refMs + eta * 60_000).toISOString(),
          delayMinutes: 0,
          isRealTimeFeed: false,
          isTomorrow: false,
          crowdPercent: slot === 0 ? 36 : slot === 1 ? 62 : 28,
          crowdLevel: slot === 1 ? 'medium' : 'low',
          speedKmh: 25,
          routeProgress: Math.max(
            0.2,
            (routeStops.length - 1) * (slot === 0 ? 0.35 : 0.1)
          ),
          crowdsourcedCount: 4 + idx * 2,
        });

        routeMap.set(key, {
          id: key,
          routeNumber: corridorCode,
          operator: 'City Bus',
          serviceType: idx % 2 === 0 ? 'AC Electric' : 'Ordinary',
          isElectric: idx % 2 === 0,
          isAC: idx % 2 === 0,
          womenFreeEligible: idx % 2 !== 0,
          womenSchemeName:
            idx % 2 !== 0 ? 'State Women Scheme Eligible' : 'City AC Corridor',
          name: `${hub.name} → ${target.name}`,
          headsign: target.name,
          origin: hub.name,
          destination: target.name,
          boardingStopName: hub.name,
          boardingStopId: hub.stopId,
          boardingStopLat: hub.lat,
          boardingStopLon: hub.lon,
          baseFareInr: 10,
          maxFareInr: Math.max(15, Math.round((totalMeters / 1000) * 2.2)),
          dataSourceLabel: 'OpenStreetMap Stops + OSRM Street Geometry',
          polyline: poly,
          stops: routeStops,
          fullTripLoaded: true,
          buses: [mkBus(0, 5 + idx * 3), mkBus(1, 17 + idx * 3), mkBus(2, 31 + idx * 3)],
        });
      })
    );
  }

  const allRoutes = Array.from(routeMap.values());
  allRoutes.sort(
    (a, b) => (a.buses[0]?.etaMinutes ?? 9999) - (b.buses[0]?.etaMinutes ?? 9999)
  );
  return allRoutes;
}

interface TransitousTripResponse {
  duration: number;
  startTime: string;
  endTime: string;
  legs?: Array<{
    mode: string;
    from: {
      name: string;
      stopId: string;
      stopCode?: string;
      lat: number;
      lon: number;
      departure?: string;
      scheduledDeparture?: string;
    };
    to: {
      name: string;
      stopId: string;
      stopCode?: string;
      lat: number;
      lon: number;
      arrival?: string;
      scheduledArrival?: string;
    };
    intermediateStops?: Array<{
      name: string;
      stopId: string;
      stopCode?: string;
      lat: number;
      lon: number;
      arrival?: string;
      departure?: string;
      scheduledArrival?: string;
      scheduledDeparture?: string;
    }>;
    legGeometry?: {
      points: string;
      precision?: number;
    };
  }>;
}

/**
 * 4. Hydrates a selected GTFS BusRoute with its COMPLETE real stop-by-stop sequence (20-65+ stops!)
 *    and precision road polyline from `/api/v1/trip?tripId=...`.
 */
export async function fetchFullGtfsTripDetails(
  route: BusRoute,
  tripId: string,
  signal?: AbortSignal
): Promise<{
  stops: RouteStop[];
  polyline: [number, number][];
  liveProgress: number;
} | null> {
  if (tripId.startsWith('OSM::')) return null;

  const url = `${TRANSITOUS_BASE}/trip?tripId=${encodeURIComponent(tripId)}`;
  const data = await cachedFetchJson<TransitousTripResponse>(url, 180_000, signal);
  const leg = data.legs?.[0];
  if (!leg) return null;

  const rawStopNodes = [
    {
      ...leg.from,
      arrival: leg.from.departure,
      scheduledArrival: leg.from.scheduledDeparture,
    },
    ...(leg.intermediateStops || []),
    {
      ...leg.to,
      departure: leg.to.arrival,
      scheduledDeparture: leg.to.scheduledArrival,
    },
  ];

  const tripStartRaw =
    leg.from.scheduledDeparture || leg.from.departure || data.startTime;
  const tripStartMs = parseTransitTimestampMs(tripStartRaw);
  const serviceDateIst = !Number.isNaN(tripStartMs)
    ? getIstCalendarParts(tripStartMs).dateString
    : undefined;

  const anchoredSchedMsList = anchorMonotonicStopTimestampsMs(
    rawStopNodes.map((n) => n.scheduledArrival || n.scheduledDeparture),
    serviceDateIst
  );
  const anchoredLiveMsList = anchorMonotonicStopTimestampsMs(
    rawStopNodes.map(
      (n) => n.arrival || n.departure || n.scheduledArrival || n.scheduledDeparture
    ),
    serviceDateIst
  );
  const effectiveOriginStartMs = !Number.isNaN(anchoredSchedMsList[0])
    ? anchoredSchedMsList[0]
    : tripStartMs;

  let cumKm = 0;
  const stops: RouteStop[] = rawStopNodes.map((node, idx) => {
    if (idx > 0) {
      const prev = rawStopNodes[idx - 1];
      cumKm +=
        (haversineMeters(prev.lat, prev.lon, node.lat, node.lon) * 1.22) / 1000;
    }
    const schedMs = anchoredSchedMsList[idx];
    const liveMs = anchoredLiveMsList[idx];
    const schedIso = !Number.isNaN(schedMs)
      ? new Date(schedMs).toISOString()
      : node.scheduledArrival || node.scheduledDeparture;
    const liveIso = !Number.isNaN(liveMs)
      ? new Date(liveMs).toISOString()
      : node.arrival || node.departure || schedIso;
    const offsetMin =
      !Number.isNaN(schedMs) && !Number.isNaN(effectiveOriginStartMs)
        ? Math.max(0, Math.round((schedMs - effectiveOriginStartMs) / 60_000))
        : Math.round(cumKm * 2.5);

    return {
      id: node.stopId || `${route.id}-s-${idx}`,
      name: node.name.replace(/,\s*-\s*$/, ''),
      stopCode: node.stopCode,
      landmark:
        idx === 0
          ? 'Origin Terminal'
          : idx === rawStopNodes.length - 1
          ? 'Destination Terminal'
          : node.stopCode
          ? `GTFS Stop #${node.stopCode}`
          : `${route.operator} Verified Stop`,
      lat: node.lat,
      lng: node.lon,
      distanceFromStartKm: Number(cumKm.toFixed(2)),
      scheduledArrivalIso: schedIso,
      scheduledDepartureIso: node.scheduledDeparture || schedIso,
      liveArrivalIso: liveIso,
      liveDepartureIso: node.departure || liveIso,
      scheduledOffsetMin: offsetMin,
      platform: node.stopCode ? `#${node.stopCode}` : `S${idx + 1}`,
    };
  });

  const polyline = leg.legGeometry?.points
    ? decodeEncodedPolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 7)
    : stops.map((s): [number, number] => [s.lat, s.lng]);

  const computedProgress = computeLiveProgressFromSchedule(stops, Date.now());
  const liveProgress =
    computedProgress !== null
      ? computedProgress
      : Math.min(stops.length - 1.2, Math.max(0.35, stops.length * 0.32));

  return { stops, polyline, liveProgress };
}

interface TransitousMapTripRaw {
  trips: Array<{ tripId: string; routeShortName?: string; displayName?: string }>;
  mode: string;
  from: { name: string; lat: number; lon: number };
  to: { name: string; lat: number; lon: number };
  departure: string;
  arrival: string;
  realTime: boolean;
  polyline: string;
}

/**
 * 5. Fetches LIVE MOVING BUSES across the city bounding box from `/api/v1/map/trips`!
 */
export async function fetchLiveMovingFleetInBounds(
  centerLat: number,
  centerLon: number,
  spanDeg = 0.055,
  signal?: AbortSignal
): Promise<LiveMapVehicle[]> {
  const now = new Date();
  const startIso = new Date(now.getTime() - 2 * 60_000).toISOString();
  const endIso = new Date(now.getTime() + 15 * 60_000).toISOString();

  const minLat = (centerLat - spanDeg).toFixed(4);
  const minLon = (centerLon - spanDeg).toFixed(4);
  const maxLat = (centerLat + spanDeg).toFixed(4);
  const maxLon = (centerLon + spanDeg).toFixed(4);

  const url = `${TRANSITOUS_BASE}/map/trips?min=${minLat},${minLon}&max=${maxLat},${maxLon}&startTime=${encodeURIComponent(
    startIso
  )}&endTime=${encodeURIComponent(endIso)}&zoom=13`;

  const raw = await cachedFetchJson<TransitousMapTripRaw[]>(url, 25_000, signal);
  if (!Array.isArray(raw)) return [];

  const nowMs = Date.now();
  const vehicles: LiveMapVehicle[] = [];
  const seenTrips = new Set<string>();

  for (const seg of raw) {
    const primary = seg.trips?.[0];
    if (!primary?.tripId || seenTrips.has(primary.tripId)) continue;

    const depMs = new Date(seg.departure).getTime();
    const arrMs = new Date(seg.arrival).getTime();
    if (arrMs < nowMs - 30_000 || depMs > nowMs + 180_000) continue;

    seenTrips.add(primary.tripId);
    const poly = decodeEncodedPolyline(seg.polyline, 5);
    const spanMs = Math.max(15_000, arrMs - depMs);
    const frac = Math.max(0, Math.min(1, (nowMs - depMs) / spanMs));

    let lat = seg.from.lat + (seg.to.lat - seg.from.lat) * frac;
    let lon = seg.from.lon + (seg.to.lon - seg.from.lon) * frac;

    if (poly.length >= 2) {
      const exactIdx = frac * (poly.length - 1);
      const i0 = Math.floor(exactIdx);
      const i1 = Math.min(poly.length - 1, i0 + 1);
      const sub = exactIdx - i0;
      lat = poly[i0][0] + (poly[i1][0] - poly[i0][0]) * sub;
      lon = poly[i0][1] + (poly[i1][1] - poly[i0][1]) * sub;
    }

    vehicles.push({
      id: primary.tripId,
      tripId: primary.tripId,
      routeShortName: primary.routeShortName || primary.displayName || seg.mode,
      mode: seg.mode,
      fromName: seg.from.name,
      fromLat: seg.from.lat,
      fromLon: seg.from.lon,
      toName: seg.to.name,
      toLat: seg.to.lat,
      toLon: seg.to.lon,
      departureIso: seg.departure,
      arrivalIso: seg.arrival,
      realTime: seg.realTime,
      polyline: poly,
      lat,
      lon,
      bearingDeg: 0,
    });

    if (vehicles.length >= 160) break;
  }

  return vehicles;
}

export interface SearchPlaceSuggestion {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  isTransitStop: boolean;
  stopId?: string;
  stopCode?: string;
}

/**
 * 6. Real-time Stop, Bus Station & Landmark Autocomplete across India (Transitous Geocode + Photon).
 */
export async function searchRealTransitPlaces(
  query: string,
  biasLat: number,
  biasLon: number,
  signal?: AbortSignal
): Promise<SearchPlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const transitousUrl = `${TRANSITOUS_BASE}/geocode?text=${encodeURIComponent(
    q
  )}&place=${biasLat.toFixed(4)},${biasLon.toFixed(4)}`;
  const photonUrl = `${PHOTON_BASE}/api/?q=${encodeURIComponent(
    q
  )}&lat=${biasLat.toFixed(4)}&lon=${biasLon.toFixed(4)}&limit=14`;

  const [trRes, phRes] = await Promise.allSettled([
    cachedFetchJson<
      Array<{
        type: string;
        name: string;
        id: string;
        lat: number;
        lon: number;
        areas?: Array<{ name: string }>;
      }>
    >(transitousUrl, 60_000, signal),
    cachedFetchJson<{
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: {
          osm_id: number;
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          district?: string;
          osm_value?: string;
        };
      }>;
    }>(photonUrl, 60_000, signal),
  ]);

  const results: SearchPlaceSuggestion[] = [];
  const seen = new Set<string>();

  if (trRes.status === 'fulfilled' && Array.isArray(trRes.value)) {
    for (const item of trRes.value.slice(0, 12)) {
      const cleanName = item.name.replace(/,\s*-\s*$/, '').trim();
      const key = `${cleanName.toLowerCase()}:${item.lat.toFixed(3)}:${item.lon.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const areaLabel = (item.areas || [])
        .map((a) => a.name)
        .filter((n) => n !== 'India')
        .slice(-2)
        .join(', ');
      const op = item.type === 'STOP' ? normalizeOperatorName(undefined, item.id) : '';
      results.push({
        id: item.id,
        name: cleanName,
        subtitle: `${
          item.type === 'STOP'
            ? `${op && op !== 'City Bus' ? `${op} ` : ''}GTFS Stop`
            : 'Place'
        }${areaLabel ? ` • ${areaLabel}` : ''}`,
        lat: item.lat,
        lon: item.lon,
        isTransitStop: item.type === 'STOP',
        stopId: item.type === 'STOP' ? item.id : undefined,
      });
    }
  }

  if (phRes.status === 'fulfilled' && Array.isArray(phRes.value?.features)) {
    for (const f of phRes.value.features) {
      const name = f.properties.name?.trim();
      if (!name) continue;
      const [lon, lat] = f.geometry.coordinates;
      const key = `${name.toLowerCase()}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const loc = [
        f.properties.street,
        f.properties.district,
        f.properties.city,
        f.properties.state,
      ]
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const isStop =
        f.properties.osm_value === 'bus_stop' ||
        f.properties.osm_value === 'bus_station';
      results.push({
        id: `osm-${f.properties.osm_id}`,
        name,
        subtitle: `${
          f.properties.osm_value === 'bus_station'
            ? 'Bus Terminal'
            : isStop
            ? 'Bus Stop'
            : 'Landmark'
        }${loc ? ` • ${loc}` : ''}`,
        lat,
        lon,
        isTransitStop: isStop,
      });
    }
  }

  return results.slice(0, 16);
}

export interface RawPlanItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  transfers: number;
  legs: Array<{
    mode: string;
    routeShortName?: string;
    routeLongName?: string;
    displayName?: string;
    agencyName?: string;
    headsign?: string;
    tripId?: string;
    realTime?: boolean;
    from: {
      name: string;
      stopId?: string;
      stopCode?: string;
      lat: number;
      lon: number;
    };
    to: {
      name: string;
      stopId?: string;
      stopCode?: string;
      lat: number;
      lon: number;
    };
    startTime: string;
    endTime: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
    duration: number;
    distance?: number;
    intermediateStops?: Array<{ name?: string }>;
    legGeometry?: { points: string; precision?: number };
  }>;
}

export function parseItinerariesToPlannedJourneys(
  itineraries: RawPlanItinerary[],
  refTimeMs: number,
  isNextMorning = false,
  parseOptions?: {
    corridorStraightMeters?: number;
    hasExplicitUserTargetTime?: boolean;
    scheduleBand?: ScheduleTimeBand;
    searchRefTimeMs?: number;
    maxCount?: number;
  }
): PlannedJourney[] {
  const validJourneys: PlannedJourney[] = [];
  const maxItems = parseOptions?.maxCount ?? 8;
  const effectiveSearchRefMs = parseOptions?.searchRefTimeMs ?? refTimeMs;

  for (let idx = 0; idx < itineraries.length && validJourneys.length < maxItems; idx++) {
    const itin = itineraries[idx];
    if (!Array.isArray(itin.legs) || itin.legs.length === 0) continue;

    const firstFrom = itin.legs[0].from;
    const lastTo = itin.legs[itin.legs.length - 1].to;
    const corridorMeters =
      parseOptions?.corridorStraightMeters ??
      haversineMeters(firstFrom.lat, firstFrom.lon, lastTo.lat, lastTo.lon);

    const validation = sanitizeAndValidateItinerary({
      legs: itin.legs,
      corridorStraightMeters: corridorMeters,
      referenceTimeMs: refTimeMs,
      isNextMorningFallback: isNextMorning,
      hasExplicitUserTargetTime: Boolean(parseOptions?.hasExplicitUserTargetTime),
    });

    if (!validation.valid || !validation.sanitized) {
      continue;
    }

    const sanitized = validation.sanitized;
    let totalWalkingMeters = 0;
    let estimatedFareInr = 0;
    let womenFreeFareInr = 0;
    let hasRealTime = false;

    const legs: PlannedJourneyLeg[] = itin.legs.map((l, legIdx) => {
      const sLeg = sanitized.legs[legIdx];
      const isWalk = l.mode === 'WALK';
      const distMeters =
        l.distance && l.distance > 0
          ? Math.round(l.distance)
          : Math.round(
              haversineMeters(l.from.lat, l.from.lon, l.to.lat, l.to.lon) * 1.24
            );

      if (isWalk) {
        totalWalkingMeters += distMeters;
        return {
          mode: 'WALK',
          fromName: l.from.name || 'Origin',
          fromLat: l.from.lat,
          fromLon: l.from.lon,
          toName: l.to.name || 'Stop',
          toLat: l.to.lat,
          toLon: l.to.lon,
          startTimeIso: sLeg.startTimeIso,
          endTimeIso: sLeg.endTimeIso,
          durationSec: sLeg.durationSec,
          distanceMeters: distMeters,
          stopCount: 0,
          polyline: l.legGeometry?.points
            ? decodeEncodedPolyline(l.legGeometry.points, l.legGeometry.precision ?? 7)
            : [
                [l.from.lat, l.from.lon],
                [l.to.lat, l.to.lon],
              ],
        };
      }

      if (l.realTime) hasRealTime = true;

      const routeNum = (l.routeShortName || l.displayName || l.mode).trim();
      const operator = normalizeOperatorName(l.agencyName, l.from.stopId);
      const svc = classifyIndianBusService(
        routeNum,
        operator,
        l.routeLongName,
        l.mode
      );
      const legFare = estimateTransitLegFareInr(distMeters, svc);
      estimatedFareInr += legFare;
      womenFreeFareInr += svc.womenFreeEligible ? 0 : legFare;

      const interNames = (l.intermediateStops || [])
        .map((s) => s.name?.replace(/,\s*-\s*$/, '').trim())
        .filter((n): n is string => Boolean(n));

      return {
        mode: l.mode,
        routeShortName: routeNum,
        agencyName: l.agencyName,
        operator,
        serviceType: svc.serviceType,
        isAC: svc.isAC,
        isElectric: svc.isElectric,
        womenFreeEligible: svc.womenFreeEligible,
        fareInr: legFare,
        headsign: l.headsign?.replace(/,\s*-\s*$/, ''),
        tripId: l.tripId,
        realTime: Boolean(l.realTime),
        delayMinutes: sLeg.delayMinutes,
        fromName: (l.from.name || 'Origin').replace(/,\s*-\s*$/, ''),
        fromStopCode: l.from.stopCode,
        fromLat: l.from.lat,
        fromLon: l.from.lon,
        toName: (l.to.name || 'Destination').replace(/,\s*-\s*$/, ''),
        toStopCode: l.to.stopCode,
        toLat: l.to.lat,
        toLon: l.to.lon,
        startTimeIso: sLeg.startTimeIso,
        endTimeIso: sLeg.endTimeIso,
        scheduledStartTimeIso: l.scheduledStartTime,
        scheduledEndTimeIso: l.scheduledEndTime,
        durationSec: sLeg.durationSec,
        distanceMeters: distMeters,
        stopCount: interNames.length + 1,
        intermediateStopNames: interNames,
        polyline: l.legGeometry?.points
          ? decodeEncodedPolyline(l.legGeometry.points, l.legGeometry.precision ?? 7)
          : [
              [l.from.lat, l.from.lon],
              [l.to.lat, l.to.lon],
            ],
      };
    });

    const transitLegs = legs.filter((l) => l.mode !== 'WALK');
    const summaryLabel =
      transitLegs.length === 0
        ? 'Walking Route'
        : transitLegs
            .map((tl) => `${tl.operator || ''} ${tl.routeShortName || tl.mode}`.trim())
            .join(' → ');

    const bandMeta = classifyDepartureScheduleBand(
      sanitized.startMs,
      effectiveSearchRefMs,
      parseOptions?.scheduleBand
    );
    const waitFromUserRefMin = Math.max(
      0,
      Math.round((sanitized.startMs - effectiveSearchRefMs) / 60_000)
    );

    validJourneys.push({
      id: `plan-${bandMeta.band}-${idx}-${sanitized.startTimeIso}`,
      durationSec: sanitized.durationSec,
      startTimeIso: sanitized.startTimeIso,
      endTimeIso: sanitized.endTimeIso,
      transfers: Math.max(0, transitLegs.length - 1),
      estimatedFareInr,
      womenFreeFareInr,
      waitMinutesBeforeStart: waitFromUserRefMin,
      totalDoorToDoorMinutes: sanitized.totalDoorToDoorMinutes,
      transitDurationSec: sanitized.transitDurationSec,
      walkingDurationSec: sanitized.walkingDurationSec,
      totalWalkingMeters,
      transferWaitSeconds: sanitized.transferWaitSeconds,
      hasRealTime,
      isNextMorning: isNextMorning || (bandMeta.band === 'morning' && bandMeta.isTomorrow),
      isTomorrowDeparture: bandMeta.isTomorrow,
      scheduleBand: bandMeta.band,
      scheduleBandLabel: bandMeta.label,
      recommendationScore: 90,
      badges: [],
      summaryLabel,
      legs,
    });
  }

  return validJourneys;
}

/**
 * 7. Door-to-Door Multi-Bus & Transit Journey Planner (`/api/v1/plan`) with:
 *    - Immediate nearest-time departures PLUS full-day IST schedule time-slot discovery
 *      (`Nearest`, `Morning`, `Afternoon`, `Evening`, `Night`)
 *    - Exact departure / arrival time support (`targetTimeIso` + `arriveBy`) in `Asia/Kolkata`
 *    - Strict `arrival - departure` duration validation & overnight-layover rejection
 *    - Nearest-GTFS-stop snapping fallback when landmarks are slightly off-network
 *    - OSRM street corridor fallback for non-GTFS cities
 */
export async function planRealTransitJourney(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  options?: {
    targetTimeIso?: string;
    arriveBy?: boolean;
    fromLabel?: string;
    toLabel?: string;
    nearbyStops?: RealTransitStop[];
    signal?: AbortSignal;
  }
): Promise<PlannedJourney[]> {
  const signal = options?.signal;
  const hasExplicitTarget = Boolean(options?.targetTimeIso);
  const parsedRefMs = options?.targetTimeIso
    ? parseTransitTimestampMs(options.targetTimeIso)
    : Date.now();
  const refMs = Number.isNaN(parsedRefMs) ? Date.now() : parsedRefMs;
  const straightMeters = haversineMeters(fromLat, fromLon, toLat, toLon);
  const timeQuery = `&time=${encodeURIComponent(
    new Date(refMs).toISOString()
  )}&arriveBy=${options?.arriveBy ? 'true' : 'false'}`;

  const queryPlanApi = async (
    fLat: number,
    fLon: number,
    tLat: number,
    tLon: number,
    customTimeParam: string
  ): Promise<RawPlanItinerary[]> => {
    const url = `${TRANSITOUS_BASE}/plan?fromPlace=${fLat.toFixed(
      5
    )},${fLon.toFixed(5)}&toPlace=${tLat.toFixed(5)},${tLon.toFixed(5)}${customTimeParam}`;
    const data = await cachedFetchJson<{ itineraries?: RawPlanItinerary[] }>(
      url,
      55_000,
      signal
    );
    // Keep itineraries that actually use at least 1 transit leg (unless distance < 900m)
    const straightDist = haversineMeters(fLat, fLon, tLat, tLon);
    const rawList = Array.isArray(data.itineraries) ? data.itineraries : [];
    return rawList.filter(
      (it) =>
        straightDist < 900 || it.legs.some((leg) => leg.mode !== 'WALK')
    );
  };

  let effectiveFromLat = fromLat;
  let effectiveFromLon = fromLon;
  let effectiveToLat = toLat;
  let effectiveToLon = toLon;
  const collectedJourneys: PlannedJourney[] = [];

  // Tier 1: Direct exact coordinate query for Nearest / Selected time
  let rawItineraries = await queryPlanApi(
    fromLat,
    fromLon,
    toLat,
    toLon,
    timeQuery
  ).catch(() => []);

  if (!options?.arriveBy) {
    rawItineraries = rawItineraries.filter(
      (it) => parseTransitTimestampMs(it.startTime) >= refMs - 120_000
    );
  }

  if (rawItineraries.length > 0) {
    const validTier1 = parseItinerariesToPlannedJourneys(
      rawItineraries,
      refMs,
      false,
      {
        corridorStraightMeters: straightMeters,
        hasExplicitUserTargetTime: hasExplicitTarget,
        scheduleBand: hasExplicitTarget ? undefined : 'nearest',
        searchRefTimeMs: refMs,
        maxCount: 6,
      }
    );
    collectedJourneys.push(...validTier1);
  }

  // Tier 2: Snap to closest GTFS stops near Origin & Destination if Tier 1 had no immediate routes
  const gtfsPool = (options?.nearbyStops || []).filter((s) => s.source === 'GTFS');
  const snapOrigin = gtfsPool
    .map((s) => ({ s, d: haversineMeters(fromLat, fromLon, s.lat, s.lon) }))
    .filter((x) => x.d <= 1800)
    .sort((a, b) => a.d - b.d)[0];

  const snapDest = gtfsPool
    .map((s) => ({ s, d: haversineMeters(toLat, toLon, s.lat, s.lon) }))
    .filter((x) => x.d <= 1800)
    .sort((a, b) => a.d - b.d)[0];

  if (collectedJourneys.length === 0 && (snapOrigin || snapDest)) {
    const sFromLat = snapOrigin ? snapOrigin.s.lat : fromLat;
    const sFromLon = snapOrigin ? snapOrigin.s.lon : fromLon;
    const sToLat = snapDest ? snapDest.s.lat : toLat;
    const sToLon = snapDest ? snapDest.s.lon : toLon;

    let snappedItins = await queryPlanApi(
      sFromLat,
      sFromLon,
      sToLat,
      sToLon,
      timeQuery
    ).catch(() => []);

    if (!options?.arriveBy) {
      snappedItins = snappedItins.filter(
        (it) => parseTransitTimestampMs(it.startTime) >= refMs - 120_000
      );
    }

    if (snappedItins.length > 0) {
      const validTier2 = parseItinerariesToPlannedJourneys(
        snappedItins,
        refMs,
        false,
        {
          corridorStraightMeters: straightMeters,
          hasExplicitUserTargetTime: hasExplicitTarget,
          scheduleBand: hasExplicitTarget ? undefined : 'nearest',
          searchRefTimeMs: refMs,
          maxCount: 6,
        }
      );
      if (validTier2.length > 0) {
        effectiveFromLat = sFromLat;
        effectiveFromLon = sFromLon;
        effectiveToLat = sToLat;
        effectiveToLon = sToLon;
        collectedJourneys.push(...validTier2);
      }
    }
  }

  // Tier 3: Multi-Time-Slot Schedule Discovery across the IST day (`Morning`, `Afternoon`, `Evening`, `Night`)
  // Always runs alongside Nearest routes (unless user pinned `arriveBy`) so users see recommendations
  // across ALL time slots for their requested corridor, not only the nearest departure!
  if (!options?.arriveBy) {
    const scheduleWindows = buildUpcomingIstScheduleWindows(refMs);
    const windowResults = await Promise.allSettled(
      scheduleWindows.map(async (win) => {
        const winQuery = `&time=${encodeURIComponent(
          new Date(win.targetEpochMs).toISOString()
        )}&arriveBy=false`;
        let winItins = await queryPlanApi(
          effectiveFromLat,
          effectiveFromLon,
          effectiveToLat,
          effectiveToLon,
          winQuery
        ).catch(() => []);

        // If exact coords had 0 itineraries in this peak window and snapped GTFS coords exist, try snapped coords
        if (
          winItins.length === 0 &&
          (snapOrigin || snapDest) &&
          (effectiveFromLat === fromLat && effectiveToLat === toLat)
        ) {
          const sFromLat = snapOrigin ? snapOrigin.s.lat : fromLat;
          const sFromLon = snapOrigin ? snapOrigin.s.lon : fromLon;
          const sToLat = snapDest ? snapDest.s.lat : toLat;
          const sToLon = snapDest ? snapDest.s.lon : toLon;
          winItins = await queryPlanApi(
            sFromLat,
            sFromLon,
            sToLat,
            sToLon,
            winQuery
          ).catch(() => []);
        }

        winItins = winItins.filter(
          (it) => parseTransitTimestampMs(it.startTime) >= win.targetEpochMs - 120_000
        );

        return parseItinerariesToPlannedJourneys(
          winItins,
          win.targetEpochMs,
          win.band === 'morning' && win.isTomorrow,
          {
            corridorStraightMeters: straightMeters,
            hasExplicitUserTargetTime: false,
            scheduleBand: win.band,
            searchRefTimeMs: refMs,
            maxCount: 4,
          }
        );
      })
    );

    for (const res of windowResults) {
      if (res.status === 'fulfilled' && res.value.length > 0) {
        collectedJourneys.push(...res.value);
      }
    }
  }

  if (collectedJourneys.length > 0) {
    return collectedJourneys;
  }

  // Tier 4: Street-Network Corridor Fallback via OSRM (for non-GTFS cities so planner always helps!)
  if (straightMeters >= 500 && straightMeters <= 65_000) {
    try {
      const osrm = await cachedFetchJson<{
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: [number, number][] };
        }>;
      }>(
        `${OSRM_BASE}/${fromLon.toFixed(5)},${fromLat.toFixed(5)};${toLon.toFixed(
          5
        )},${toLat.toFixed(5)}?overview=full&geometries=geojson`,
        180_000,
        signal
      );

      const road = osrm.routes?.[0];
      if (road) {
        const poly = road.geometry.coordinates.map(
          ([ln, lt]): [number, number] => [lt, ln]
        );
        const busSec = Math.max(240, Math.round(road.duration * 1.45));
        const walkMeters = 180;
        const walkSec = 150;
        const startMs = refMs + 4 * 60_000;
        const endMs = startMs + busSec * 1000 + walkSec * 1000;
        const svc = classifyIndianBusService('CITY-BUS', 'City Bus');
        const fare = estimateTransitLegFareInr(road.distance, svc);
        const estStops = Math.max(2, Math.round(road.distance / 750));

        return [
          {
            id: `osrm-corridor-${refMs}`,
            durationSec: busSec + walkSec,
            startTimeIso: new Date(startMs).toISOString(),
            endTimeIso: new Date(endMs).toISOString(),
            transfers: 0,
            estimatedFareInr: fare,
            womenFreeFareInr: 0,
            waitMinutesBeforeStart: 4,
            totalDoorToDoorMinutes: Math.round((endMs - refMs) / 60_000),
            transitDurationSec: busSec,
            walkingDurationSec: walkSec,
            totalWalkingMeters: walkMeters,
            transferWaitSeconds: 0,
            hasRealTime: false,
            isApproximateCorridor: true,
            recommendationScore: 84,
            badges: ['🗺️ Street Corridor'],
            summaryLabel: 'City Bus Street Corridor',
            legs: [
              {
                mode: 'WALK',
                fromName: options?.fromLabel || 'Origin',
                fromLat,
                fromLon,
                toName: `${options?.fromLabel || 'Nearest'} Bus Stop`,
                toLat: fromLat,
                toLon: fromLon,
                startTimeIso: new Date(startMs).toISOString(),
                endTimeIso: new Date(startMs + 90_000).toISOString(),
                durationSec: 90,
                distanceMeters: 110,
                stopCount: 0,
                polyline: [[fromLat, fromLon]],
              },
              {
                mode: 'BUS',
                routeShortName: 'Corridor Bus',
                operator: 'City Transit',
                serviceType: 'Ordinary / City Bus',
                isAC: false,
                isElectric: false,
                womenFreeEligible: true,
                fareInr: fare,
                fromName: `${options?.fromLabel || 'Origin'} Stop`,
                fromLat,
                fromLon,
                toName: `${options?.toLabel || 'Destination'} Stop`,
                toLat,
                toLon,
                startTimeIso: new Date(startMs + 90_000).toISOString(),
                endTimeIso: new Date(startMs + 90_000 + busSec * 1000).toISOString(),
                durationSec: busSec,
                distanceMeters: Math.round(road.distance),
                stopCount: estStops,
                polyline: poly,
              },
              {
                mode: 'WALK',
                fromName: `${options?.toLabel || 'Destination'} Stop`,
                fromLat: toLat,
                fromLon: toLon,
                toName: options?.toLabel || 'Destination',
                toLat,
                toLon,
                startTimeIso: new Date(startMs + 90_000 + busSec * 1000).toISOString(),
                endTimeIso: new Date(endMs).toISOString(),
                durationSec: 60,
                distanceMeters: 70,
                stopCount: 0,
                polyline: [[toLat, toLon]],
              },
            ],
          },
        ];
      }
    } catch {
      // Ignore OSRM fallback failure
    }
  }

  return [];
}
