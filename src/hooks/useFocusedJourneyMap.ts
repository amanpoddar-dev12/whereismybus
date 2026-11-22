import { useMemo } from 'react';
import {
  BusRoute,
  LiveMapVehicle,
  PlannedJourney,
  PlannedJourneyLeg,
} from '../types/transit';
import { formatIsoToIndianTime } from '../utils/transitHelpers';

export interface JourneyEndpointMarker {
  lat: number;
  lon: number;
  stopName: string;
  timeLabel: string;
  routeLabel?: string;
}

export interface JourneyTransferPoint {
  id: string;
  lat: number;
  lon: number;
  stopName: string;
  fromRoute: string;
  toRoute: string;
  waitMinutes: number;
  walkConnectorPolyline?: [number, number][];
}

export interface StyledJourneyLeg {
  id: string;
  leg: PlannedJourneyLeg;
  isWalk: boolean;
  color: string;
  haloColor: string;
  weight: number;
  dashArray?: string;
  positions: [number, number][];
}

export interface FocusedJourneyMapState {
  isFocusMode: boolean;
  departureMarker: JourneyEndpointMarker | null;
  arrivalMarker: JourneyEndpointMarker | null;
  transferPoints: JourneyTransferPoint[];
  styledLegs: StyledJourneyLeg[];
  focusedVehicles: LiveMapVehicle[];
  cameraBoundsPoints: [number, number][];
}

const TRANSIT_LEG_COLORS = ['#2563EB', '#7C3AED', '#059669'];
const WALK_LEG_COLOR = '#6B7280';

/**
 * Isolates the active journey or tracked bus route for map "Focus Mode":
 * - Computes distinct Origin, Transfer, and Destination markers
 * - Styles Leg 1 (#2563EB), Walk (#6B7280 dashed), and Leg 2 (#7C3AED) polylines
 * - Filters out all irrelevant vehicles not matching activeTripIds / activeRouteIds
 * - Aggregates camera fitBounds coordinates (origin, destination, and live bus positions)
 */
export function useFocusedJourneyMap(
  previewJourney: PlannedJourney | null,
  trackedRoute: BusRoute | null,
  trackedBusPos: [number, number] | null,
  liveFleetVehicles: LiveMapVehicle[]
): FocusedJourneyMapState {
  return useMemo(() => {
    const isFocusMode = Boolean(trackedRoute || previewJourney);

    // Mode A: Active single-route live tracking
    if (trackedRoute) {
      const firstStop = trackedRoute.stops[0];
      const lastStop = trackedRoute.stops[trackedRoute.stops.length - 1];
      const activeBus = trackedRoute.buses[0];

      const departureMarker: JourneyEndpointMarker | null = firstStop
        ? {
            lat: firstStop.lat,
            lon: firstStop.lng,
            stopName: firstStop.name,
            timeLabel: firstStop.scheduledDepartureIso
              ? formatIsoToIndianTime(firstStop.scheduledDepartureIso)
              : activeBus
              ? `In ${activeBus.etaMinutes} min`
              : 'Origin',
            routeLabel: `${trackedRoute.operator} ${trackedRoute.routeNumber}`,
          }
        : null;

      const arrivalMarker: JourneyEndpointMarker | null = lastStop
        ? {
            lat: lastStop.lat,
            lon: lastStop.lng,
            stopName: lastStop.name,
            timeLabel: lastStop.liveArrivalIso
              ? formatIsoToIndianTime(lastStop.liveArrivalIso)
              : lastStop.scheduledArrivalIso
              ? formatIsoToIndianTime(lastStop.scheduledArrivalIso)
              : 'Destination',
            routeLabel: `${trackedRoute.operator} ${trackedRoute.routeNumber}`,
          }
        : null;

      const routePts: [number, number][] =
        trackedRoute.polyline && trackedRoute.polyline.length >= 2
          ? [...trackedRoute.polyline]
          : trackedRoute.stops.map((s) => [s.lat, s.lng] as [number, number]);

      if (trackedBusPos) {
        routePts.push(trackedBusPos);
      }

      return {
        isFocusMode: true,
        departureMarker,
        arrivalMarker,
        transferPoints: [],
        styledLegs: [],
        focusedVehicles: [],
        cameraBoundsPoints: routePts,
      };
    }

    // Mode B: Unfocused City Radar (no journey or route selected)
    if (!previewJourney || previewJourney.legs.length === 0) {
      return {
        isFocusMode: false,
        departureMarker: null,
        arrivalMarker: null,
        transferPoints: [],
        styledLegs: [],
        focusedVehicles: liveFleetVehicles.slice(0, 65),
        cameraBoundsPoints: [],
      };
    }

    // Mode C: Isolated Planned Journey Focus Mode
    const legs = previewJourney.legs;
    const transitLegs = legs.filter((l) => l.mode !== 'WALK');
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const boardingLeg = transitLegs[0] || firstLeg;

    const departureMarker: JourneyEndpointMarker = {
      lat: boardingLeg.fromLat,
      lon: boardingLeg.fromLon,
      stopName: boardingLeg.fromName,
      timeLabel: formatIsoToIndianTime(boardingLeg.startTimeIso),
      routeLabel: boardingLeg.routeShortName || boardingLeg.mode,
    };

    const arrivalMarker: JourneyEndpointMarker = {
      lat: lastLeg.toLat,
      lon: lastLeg.toLon,
      stopName: lastLeg.toName,
      timeLabel: formatIsoToIndianTime(lastLeg.endTimeIso),
      routeLabel: lastLeg.routeShortName || lastLeg.mode,
    };

    // Build styled polylines per leg (Leg 1 = #2563EB, Walk = #6B7280 dashed, Leg 2 = #7C3AED)
    let transitIndex = 0;
    const styledLegs: StyledJourneyLeg[] = legs.map((leg, idx) => {
      const isWalk = leg.mode === 'WALK';
      const color = isWalk
        ? WALK_LEG_COLOR
        : TRANSIT_LEG_COLORS[transitIndex % TRANSIT_LEG_COLORS.length];
      if (!isWalk) transitIndex += 1;

      const positions: [number, number][] =
        leg.polyline && leg.polyline.length >= 2
          ? leg.polyline
          : [
              [leg.fromLat, leg.fromLon],
              [leg.toLat, leg.toLon],
            ];

      return {
        id: `journey-leg-${idx}-${leg.mode}`,
        leg,
        isWalk,
        color,
        haloColor: '#FFFFFF',
        weight: isWalk ? 3 : 5,
        dashArray: isWalk ? '4, 8' : undefined,
        positions,
      };
    });

    // Detect transfer / interchange points between consecutive transit legs
    const transferPoints: JourneyTransferPoint[] = [];
    for (let i = 0; i < transitLegs.length - 1; i++) {
      const legA = transitLegs[i];
      const legB = transitLegs[i + 1];
      const endMs = new Date(legA.endTimeIso).getTime();
      const startMs = new Date(legB.startTimeIso).getTime();
      const waitMinutes =
        Number.isFinite(endMs) && Number.isFinite(startMs)
          ? Math.max(1, Math.round((startMs - endMs) / 60000))
          : Math.max(1, Math.round(previewJourney.transferWaitSeconds / 60));

      const distMoved = Math.hypot(
        legA.toLat - legB.fromLat,
        legA.toLon - legB.fromLon
      );
      // Check if an explicit WALK leg already connects them; if not and stops differ, draw connector
      const hasExplicitWalk = legs.some(
        (l) =>
          l.mode === 'WALK' &&
          Math.hypot(l.fromLat - legA.toLat, l.fromLon - legA.toLon) < 0.002
      );

      transferPoints.push({
        id: `transfer-${i}-${legA.toName}`,
        lat: legA.toLat,
        lon: legA.toLon,
        stopName: legA.toName,
        fromRoute: legA.routeShortName || legA.mode,
        toRoute: legB.routeShortName || legB.mode,
        waitMinutes,
        walkConnectorPolyline:
          !hasExplicitWalk && distMoved > 0.0003
            ? [
                [legA.toLat, legA.toLon],
                [legB.fromLat, legB.fromLon],
              ]
            : undefined,
      });
    }

    // Isolate active vehicles matching activeTripIds / activeRouteIds
    const activeTripIds = new Set(
      transitLegs.map((l) => l.tripId).filter((id): id is string => Boolean(id))
    );
    const activeRouteIds = new Set(
      transitLegs
        .map((l) => l.routeShortName?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))
    );

    const focusedVehicles = liveFleetVehicles.filter((v) => {
      if (v.tripId && activeTripIds.has(v.tripId)) return true;
      if (activeTripIds.has(v.id)) return true;
      if (activeRouteIds.has(v.routeShortName.trim().toLowerCase())) return true;
      return false;
    });

    // Aggregate camera bounds: origin, destination, leg polylines, and active tracked bus(es)
    const cameraBoundsPoints: [number, number][] = [
      [departureMarker.lat, departureMarker.lon],
      [arrivalMarker.lat, arrivalMarker.lon],
    ];
    styledLegs.forEach((sl) =>
      sl.positions.forEach((pt) => cameraBoundsPoints.push(pt))
    );
    focusedVehicles.forEach((v) => cameraBoundsPoints.push([v.lat, v.lon]));

    return {
      isFocusMode,
      departureMarker,
      arrivalMarker,
      transferPoints,
      styledLegs,
      focusedVehicles,
      cameraBoundsPoints,
    };
  }, [liveFleetVehicles, previewJourney, trackedBusPos, trackedRoute]);
}
