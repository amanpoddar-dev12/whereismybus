import {
  BusRoute,
  PlannedJourney,
  PlannedJourneyLeg,
  QuickFilterId,
  RecommendationPreference,
  RouteSortBy,
} from '../types/transit';
import {
  calculateRouteFare,
  estimateWalkingMinutes,
  haversineMeters,
} from './transitHelpers';
import {
  classifyDepartureScheduleBand,
  computeMaxPlausibleJourneyDurationSec,
  computeStrictDurationSeconds,
  MAX_IMMEDIATE_DEPARTURE_WAIT_SEC,
  MAX_INTERCITY_TRANSFER_WAIT_SEC,
  MAX_URBAN_TRANSFER_WAIT_SEC,
  parseTransitTimestampMs,
} from './transitTimeEngine';
import { normalizeSearchText, scoreStationMatch } from './stationSearchEngine';

/**
 * Ranks, deduplicates, scores, and badges multi-modal `PlannedJourney` itineraries
 * across BOTH immediate nearest-time departures and full-day IST schedule bands
 * (`Nearest`, `Morning`, `Afternoon`, `Evening`, `Night`).
 */
export function rankAndRecommendJourneys(
  rawJourneys: PlannedJourney[],
  referenceTimeMs: number,
  preference: RecommendationPreference = 'smart_best'
): PlannedJourney[] {
  if (rawJourneys.length === 0) return [];

  // 1. Validate & recompute strict `duration = arrival - departure` metrics relative to referenceTimeMs
  const enriched: PlannedJourney[] = [];
  for (const plan of rawJourneys) {
    const strictSpan = computeStrictDurationSeconds(
      plan.startTimeIso,
      plan.endTimeIso,
      {
        allowMidnightRolloverRepair: true,
        maxMidnightRepairSec: 6 * 3600,
      }
    );
    if (!strictSpan || strictSpan.durationSec <= 0) {
      continue;
    }

    // Check physical GIS corridor & transfer wait bounds
    if (plan.legs.length > 0) {
      const firstLeg = plan.legs[0];
      const lastLeg = plan.legs[plan.legs.length - 1];
      const corridorMeters = haversineMeters(
        firstLeg.fromLat,
        firstLeg.fromLon,
        lastLeg.toLat,
        lastLeg.toLon
      );
      const maxDurationSec = computeMaxPlausibleJourneyDurationSec(corridorMeters);
      const maxTransferSec =
        corridorMeters > 60_000
          ? MAX_INTERCITY_TRANSFER_WAIT_SEC
          : MAX_URBAN_TRANSFER_WAIT_SEC;

      if (
        strictSpan.durationSec > maxDurationSec ||
        plan.transferWaitSeconds < 0 ||
        plan.transferWaitSeconds > maxTransferSec
      ) {
        continue;
      }
    }

    const trueDurationSec = strictSpan.durationSec;
    const travelDurationMin = Math.max(1, Math.round(trueDurationSec / 60));

    const waitMin = Math.max(
      0,
      Math.round((strictSpan.departureMs - referenceTimeMs) / 60_000)
    );

    const bandMeta = classifyDepartureScheduleBand(
      strictSpan.departureMs,
      referenceTimeMs,
      plan.scheduleBand
    );

    const isFutureTimeBand =
      bandMeta.band !== 'nearest' ||
      Boolean(plan.isNextMorning) ||
      waitMin > Math.round(MAX_IMMEDIATE_DEPARTURE_WAIT_SEC / 60);

    // Never fold an afternoon/evening/next-day schedule offset into journey travel duration
    const effectiveWaitMin = isFutureTimeBand ? 0 : waitMin;
    const doorToDoorMin = travelDurationMin + effectiveWaitMin;

    enriched.push({
      ...plan,
      durationSec: trueDurationSec,
      startTimeIso: new Date(strictSpan.departureMs).toISOString(),
      endTimeIso: new Date(strictSpan.arrivalMs).toISOString(),
      isNextMorning:
        Boolean(plan.isNextMorning) ||
        (bandMeta.band === 'morning' && bandMeta.isTomorrow),
      isTomorrowDeparture: bandMeta.isTomorrow,
      scheduleBand: bandMeta.band,
      scheduleBandLabel: plan.scheduleBandLabel || bandMeta.label,
      waitMinutesBeforeStart: waitMin,
      totalDoorToDoorMinutes: doorToDoorMin,
    });
  }

  if (enriched.length === 0) return [];

  // 2. Deduplicate near-identical departures (same route chain within 12 min of each other),
  // while preserving distinct departures across Morning / Afternoon / Evening / Night bands!
  const uniquePlans: PlannedJourney[] = [];
  for (const p of enriched) {
    const sig = p.legs
      .filter((l) => l.mode !== 'WALK')
      .map((l) => `${l.operator || ''}:${l.routeShortName || l.mode}`)
      .join('->');
    const pStartMs = parseTransitTimestampMs(p.startTimeIso);

    const dupIdx = uniquePlans.findIndex((u) => {
      const uSig = u.legs
        .filter((l) => l.mode !== 'WALK')
        .map((l) => `${l.operator || ''}:${l.routeShortName || l.mode}`)
        .join('->');
      if (uSig !== sig) return false;
      const uStartMs = parseTransitTimestampMs(u.startTimeIso);
      return Math.abs(uStartMs - pStartMs) < 12 * 60_000;
    });

    if (dupIdx === -1) {
      uniquePlans.push(p);
    } else if (p.durationSec < uniquePlans[dupIdx].durationSec) {
      uniquePlans[dupIdx] = p;
    }
  }

  if (uniquePlans.length === 0) return [];

  // 3. Find best-in-class benchmarks across all preserved plans
  const minDurationSec = Math.min(...uniquePlans.map((p) => p.durationSec));
  const minFare = Math.min(...uniquePlans.map((p) => p.estimatedFareInr));
  const maxFare = Math.max(...uniquePlans.map((p) => p.estimatedFareInr));
  const minWalk = Math.min(...uniquePlans.map((p) => p.totalWalkingMeters));

  // 4. Compute intrinsic commuter utility cost (evaluates route quality fairly in every time slot)
  const scored = uniquePlans.map((p) => {
    const travelMin = p.durationSec / 60;
    const walkMin = p.walkingDurationSec / 60;
    const transferWaitMin = p.transferWaitSeconds / 60;
    const immediateWaitPenalty =
      p.scheduleBand === 'nearest'
        ? Math.min(p.waitMinutesBeforeStart, 45) * 0.35
        : 0;
    const maxLegDelay = Math.max(
      0,
      ...p.legs.map((l) => l.delayMinutes ?? 0)
    );

    const generalizedCost =
      travelMin +
      immediateWaitPenalty +
      walkMin * 0.9 +
      p.transfers * 9 +
      transferWaitMin * 0.35 +
      Math.max(0, p.estimatedFareInr - minFare) * 0.22 +
      maxLegDelay * 0.5 -
      (p.hasRealTime ? 2.5 : 0);

    return { plan: p, generalizedCost };
  });

  const bestCost = Math.min(...scored.map((s) => s.generalizedCost));

  const finalized: PlannedJourney[] = scored.map(({ plan, generalizedCost }) => {
    const costDelta = Math.max(0, generalizedCost - bestCost);
    const rawScore = Math.round(98 - Math.min(36, costDelta * 1.15));
    const recommendationScore = Math.max(60, Math.min(99, rawScore));

    const badges: string[] = [];
    if (Math.abs(generalizedCost - bestCost) < 0.01) {
      badges.push('Best match');
    }
    if (plan.durationSec <= minDurationSec + 60) {
      if (!badges.includes('Fastest')) badges.push('Fastest');
    }
    if (plan.transfers === 0 && plan.legs.some((l) => l.mode !== 'WALK')) {
      badges.push('Direct');
    }
    if (plan.estimatedFareInr === minFare && maxFare > minFare) {
      badges.push('Lowest fare');
    }
    if (plan.totalWalkingMeters === minWalk && uniquePlans.length > 1) {
      badges.push('Least walk');
    }
    if (plan.womenFreeFareInr === 0 && plan.estimatedFareInr > 0) {
      badges.push('Women ₹0');
    }
    if (plan.hasRealTime) {
      badges.push('Live GPS');
    }

    return {
      ...plan,
      recommendationScore,
      badges: badges.slice(0, 3),
    };
  });

  // 5. Sort: prioritize Nearest departures first by default when comparing equivalent options,
  // while keeping all Morning / Afternoon / Evening / Night recommendations cleanly ordered!
  finalized.sort((a, b) => {
    const aIsNearest = a.scheduleBand === 'nearest' ? 0 : 1;
    const bIsNearest = b.scheduleBand === 'nearest' ? 0 : 1;
    if (aIsNearest !== bIsNearest) {
      return aIsNearest - bIsNearest;
    }

    switch (preference) {
      case 'fastest':
        if (a.durationSec !== b.durationSec) {
          return a.durationSec - b.durationSec;
        }
        return a.totalDoorToDoorMinutes - b.totalDoorToDoorMinutes;

      case 'direct_only':
        if (a.transfers !== b.transfers) {
          return a.transfers - b.transfers;
        }
        return a.durationSec - b.durationSec;

      case 'lowest_fare':
        if (a.estimatedFareInr !== b.estimatedFareInr) {
          return a.estimatedFareInr - b.estimatedFareInr;
        }
        return a.durationSec - b.durationSec;

      case 'least_walk':
        if (a.totalWalkingMeters !== b.totalWalkingMeters) {
          return a.totalWalkingMeters - b.totalWalkingMeters;
        }
        return a.durationSec - b.durationSec;

      case 'smart_best':
      default:
        if (b.recommendationScore !== a.recommendationScore) {
          return b.recommendationScore - a.recommendationScore;
        }
        return a.durationSec - b.durationSec;
    }
  });

  return finalized;
}

/**
 * Synthesizes verified direct `PlannedJourney` options from already-loaded GTFS/OSM `BusRoute`s
 * whenever a route connects Origin -> Destination in forward stop sequence.
 */
export function synthesizeDirectJourneysFromLoadedRoutes(
  routes: BusRoute[],
  fromLat: number,
  fromLon: number,
  fromLabel: string,
  toLat: number,
  toLon: number,
  toLabel: string,
  refTimeMs: number
): PlannedJourney[] {
  const results: PlannedJourney[] = [];

  for (const route of routes) {
    if (route.stops.length < 2 || route.buses.length === 0) continue;

    // Find closest stop to Origin
    let bestOriginIdx = -1;
    let bestOriginDist = 1100; // within 1.1 km walking radius
    for (let i = 0; i < route.stops.length - 1; i++) {
      const s = route.stops[i];
      const d = haversineMeters(fromLat, fromLon, s.lat, s.lng);
      if (d < bestOriginDist) {
        bestOriginDist = d;
        bestOriginIdx = i;
      }
    }
    if (bestOriginIdx === -1) continue;

    // Find closest FORWARD stop to Destination (strictly i > bestOriginIdx!)
    let bestDestIdx = -1;
    let bestDestDist = 1100;
    for (let i = bestOriginIdx + 1; i < route.stops.length; i++) {
      const s = route.stops[i];
      const d = haversineMeters(toLat, toLon, s.lat, s.lng);
      if (d < bestDestDist) {
        bestDestDist = d;
        bestDestIdx = i;
      }
    }
    if (bestDestIdx === -1) continue;

    const boardStop = route.stops[bestOriginIdx];
    const alightStop = route.stops[bestDestIdx];

    const walk1Meters = Math.round(bestOriginDist * 1.22);
    const walk2Meters = Math.round(bestDestDist * 1.22);
    const walk1Sec = walk1Meters > 45 ? Math.max(60, Math.round(walk1Meters / 1.25)) : 0;
    const walk2Sec = walk2Meters > 45 ? Math.max(60, Math.round(walk2Meters / 1.25)) : 0;

    // Pick first catchable bus AND any later time-slot bus on this route
    const walk1Min = Math.round(walk1Sec / 60);
    const immediateBus =
      route.buses.find((b) => b.etaMinutes >= Math.max(0, walk1Min - 1)) ||
      route.buses[0];

    const selectedBuses = [immediateBus];
    const laterBandBus = route.buses.find(
      (b) =>
        b.tripId !== immediateBus.tripId &&
        Math.abs(b.etaMinutes - immediateBus.etaMinutes) >= 60
    );
    if (laterBandBus) {
      selectedBuses.push(laterBandBus);
    }

    // Compute realistic in-bus travel duration between boardStop and alightStop
    const offsetDiffMin =
      alightStop.scheduledOffsetMin - boardStop.scheduledOffsetMin;
    const stopDistKm = Math.max(
      0.8,
      alightStop.distanceFromStartKm - boardStop.distanceFromStartKm ||
        (haversineMeters(boardStop.lat, boardStop.lng, alightStop.lat, alightStop.lng) *
          1.28) /
          1000
    );
    const maxPlausibleBusMin = Math.max(45, Math.round((stopDistKm / 9) * 60));
    const minPlausibleBusMin = Math.max(3, Math.round((stopDistKm / 65) * 60));
    const fareInr = calculateRouteFare(route, boardStop.name, alightStop.name);
    const sliceStops = route.stops.slice(bestOriginIdx, bestDestIdx + 1);

    for (const chosenBus of selectedBuses) {
      const parsedBusArrivalMs = parseTransitTimestampMs(chosenBus.arrivalIso);
      const busDepMs = Math.max(
        refTimeMs + walk1Sec * 1000,
        Number.isNaN(parsedBusArrivalMs)
          ? refTimeMs + walk1Sec * 1000
          : parsedBusArrivalMs
      );

      const inBusMin =
        offsetDiffMin >= minPlausibleBusMin && offsetDiffMin <= maxPlausibleBusMin
          ? offsetDiffMin
          : Math.max(4, Math.round((stopDistKm / Math.max(18, chosenBus.speedKmh)) * 60));
      const inBusSec = inBusMin * 60;

      const busArrMs = busDepMs + inBusSec * 1000;
      const planStartMs = busDepMs - walk1Sec * 1000;
      const planEndMs = busArrMs + walk2Sec * 1000;

      const legs: PlannedJourneyLeg[] = [];

      if (walk1Sec > 0) {
        legs.push({
          mode: 'WALK',
          fromName: fromLabel,
          fromLat,
          fromLon,
          toName: boardStop.name,
          toLat: boardStop.lat,
          toLon: boardStop.lng,
          startTimeIso: new Date(planStartMs).toISOString(),
          endTimeIso: new Date(busDepMs).toISOString(),
          durationSec: walk1Sec,
          distanceMeters: walk1Meters,
          stopCount: 0,
          polyline: [
            [fromLat, fromLon],
            [boardStop.lat, boardStop.lng],
          ],
        });
      }

      legs.push({
        mode: 'BUS',
        routeShortName: route.routeNumber,
        agencyName: route.operator,
        operator: route.operator,
        serviceType: route.serviceType,
        isAC: route.isAC,
        isElectric: route.isElectric,
        womenFreeEligible: route.womenFreeEligible,
        fareInr,
        headsign: route.headsign,
        tripId: chosenBus.tripId,
        realTime: chosenBus.isRealTimeFeed,
        delayMinutes: chosenBus.delayMinutes,
        fromName: boardStop.name,
        fromStopCode: boardStop.stopCode,
        fromLat: boardStop.lat,
        fromLon: boardStop.lng,
        toName: alightStop.name,
        toStopCode: alightStop.stopCode,
        toLat: alightStop.lat,
        toLon: alightStop.lng,
        startTimeIso: new Date(busDepMs).toISOString(),
        endTimeIso: new Date(busArrMs).toISOString(),
        durationSec: inBusSec,
        distanceMeters: Math.round(stopDistKm * 1000),
        stopCount: Math.max(1, bestDestIdx - bestOriginIdx),
        intermediateStopNames: sliceStops.slice(1, -1).map((s) => s.name),
        polyline:
          route.polyline && route.polyline.length >= 2
            ? route.polyline
            : sliceStops.map((s): [number, number] => [s.lat, s.lng]),
      });

      if (walk2Sec > 0) {
        legs.push({
          mode: 'WALK',
          fromName: alightStop.name,
          fromLat: alightStop.lat,
          fromLon: alightStop.lng,
          toName: toLabel,
          toLat,
          toLon,
          startTimeIso: new Date(busArrMs).toISOString(),
          endTimeIso: new Date(planEndMs).toISOString(),
          durationSec: walk2Sec,
          distanceMeters: walk2Meters,
          stopCount: 0,
          polyline: [
            [alightStop.lat, alightStop.lng],
            [toLat, toLon],
          ],
        });
      }

      const totalSec = Math.round((planEndMs - planStartMs) / 1000);
      const waitBeforeStartMin = Math.max(
        0,
        Math.round((planStartMs - refTimeMs) / 60_000)
      );
      const bandMeta = classifyDepartureScheduleBand(planStartMs, refTimeMs);
      const isDeferredFuture =
        bandMeta.band !== 'nearest' ||
        Boolean(chosenBus.isTomorrow) ||
        waitBeforeStartMin > Math.round(MAX_IMMEDIATE_DEPARTURE_WAIT_SEC / 60);
      const travelMin = Math.max(1, Math.round(totalSec / 60));
      results.push({
        id: `direct-synth-${route.id}-${chosenBus.tripId}`,
        durationSec: totalSec,
        startTimeIso: new Date(planStartMs).toISOString(),
        endTimeIso: new Date(planEndMs).toISOString(),
        transfers: 0,
        estimatedFareInr: fareInr,
        womenFreeFareInr: route.womenFreeEligible ? 0 : fareInr,
        waitMinutesBeforeStart: waitBeforeStartMin,
        totalDoorToDoorMinutes: isDeferredFuture
          ? travelMin
          : travelMin + waitBeforeStartMin,
        transitDurationSec: inBusSec,
        walkingDurationSec: walk1Sec + walk2Sec,
        totalWalkingMeters: walk1Meters + walk2Meters,
        transferWaitSeconds: 0,
        hasRealTime: chosenBus.isRealTimeFeed,
        isNextMorning: Boolean(chosenBus.isTomorrow),
        isTomorrowDeparture: bandMeta.isTomorrow,
        scheduleBand: bandMeta.band,
        scheduleBandLabel: bandMeta.label,
        recommendationScore: 92,
        badges: ['Direct'],
        summaryLabel: `${route.operator} ${route.routeNumber} · Direct`,
        legs,
      });
    }
  }

  return results.slice(0, 8);
}

/**
 * Filters, enriches, scores, and sorts `BusRoute` departures on the Live Radar feed
 * with directional stop verification, walking-time catchability, and frequency analysis.
 */
export function scoreAndSortBusRoutes(params: {
  routes: BusRoute[];
  originQuery: string;
  originCoords: { lat: number; lon: number; label: string } | null;
  destinationQuery: string;
  destinationCoords: { lat: number; lon: number; label: string } | null;
  hasPlannedJourneys: boolean;
  activeQuickFilters: QuickFilterId[];
  sortBy: RouteSortBy;
  refLat: number;
  refLon: number;
}): BusRoute[] {
  const {
    routes,
    originQuery,
    originCoords,
    destinationQuery,
    destinationCoords,
    activeQuickFilters,
    sortBy,
    refLat,
    refLon,
  } = params;

  const origQ = originQuery.trim();
  const destQ = destinationQuery.trim();
  const walkRefLat = originCoords?.lat ?? refLat;
  const walkRefLon = originCoords?.lon ?? refLon;

  const matchedRoutes: BusRoute[] = [];

  for (const route of routes) {
    // 1. Quick filters
    if (activeQuickFilters.includes('women_free') && !route.womenFreeEligible) {
      continue;
    }
    if (activeQuickFilters.includes('ac_electric') && !(route.isAC || route.isElectric)) {
      continue;
    }
    if (activeQuickFilters.includes('low_crowd') && route.buses[0]?.crowdLevel === 'high') {
      continue;
    }

    // Determine boarding stop index & coordinates
    const boardIdx = Math.max(
      0,
      route.stops.findIndex((s) => s.id === route.boardingStopId)
    );
    const boardStop = route.stops[boardIdx] || route.stops[0];
    const bLat = route.boardingStopLat ?? boardStop?.lat ?? walkRefLat;
    const bLon = route.boardingStopLon ?? boardStop?.lng ?? walkRefLon;

    // 2. Origin text filter (when user typed free-text origin without picking coords)
    if (origQ && !originCoords) {
      const oMatch =
        normalizeSearchText(route.routeNumber).includes(normalizeSearchText(origQ)) ||
        scoreStationMatch(origQ, route.boardingStopName) > 0 ||
        route.stops.some((s, idx) => idx < route.stops.length - 1 && scoreStationMatch(origQ, s.name, s.stopCode) > 0);
      if (!oMatch) continue;
    }

    // 3. Destination text or coordinate filter (strictly verifying forward direction!)
    let matchedDestStopName: string | undefined;
    let travelTimeToDestMin: number | undefined;
    let destMatchQuality = 0;

    if (destQ || destinationCoords) {
      const qNorm = normalizeSearchText(destQ);
      const isRouteNumQuery =
        qNorm.length >= 1 &&
        (route.routeNumber.toLowerCase() === destQ.toLowerCase() ||
          normalizeSearchText(route.routeNumber).startsWith(qNorm));

      if (isRouteNumQuery) {
        destMatchQuality = 100;
      } else {
        // Check forward stops (index > boardIdx) by coordinate proximity or fuzzy name match
        for (let i = boardIdx + 1; i < route.stops.length; i++) {
          const st = route.stops[i];
          let stScore = 0;
          if (destinationCoords) {
            const dMeters = haversineMeters(
              destinationCoords.lat,
              destinationCoords.lon,
              st.lat,
              st.lng
            );
            if (dMeters <= 750) {
              stScore = Math.max(stScore, 95 - Math.round(dMeters / 30));
            }
          }
          if (destQ) {
            stScore = Math.max(stScore, scoreStationMatch(destQ, st.name, st.stopCode));
          }

          if (stScore > destMatchQuality) {
            destMatchQuality = stScore;
            matchedDestStopName = st.name;
            const offsetDiff = st.scheduledOffsetMin - (boardStop?.scheduledOffsetMin ?? 0);
            const distDiff = Math.max(
              0.8,
              st.distanceFromStartKm - (boardStop?.distanceFromStartKm ?? 0)
            );
            travelTimeToDestMin =
              offsetDiff > 1
                ? offsetDiff
                : Math.max(4, Math.round((distDiff / 24) * 60));
          }
        }

        // Also check headsign / destination terminal if stops aren't fully hydrated yet
        if (destMatchQuality === 0 && destQ) {
          const headScore = Math.max(
            scoreStationMatch(destQ, route.destination),
            scoreStationMatch(destQ, route.headsign)
          );
          if (headScore > 0) {
            destMatchQuality = headScore;
            matchedDestStopName = route.destination;
          }
        }
      }

      if (destMatchQuality === 0) {
        continue;
      }
    }

    // 4. Compute walking distance & catchability
    const straightMeters = haversineMeters(walkRefLat, walkRefLon, bLat, bLon);
    const walkingMeters = Math.round(straightMeters * 1.2);
    const walkingMinutes = estimateWalkingMinutes(walkingMeters);

    const firstBus = route.buses[0];
    const eta = firstBus?.etaMinutes ?? 99;
    const isCatchable = eta >= Math.max(0, walkingMinutes - 1);

    // 5. Compute route frequency / headway if >= 2 departures
    let headwayMinutes: number | undefined;
    if (route.buses.length >= 2) {
      const span =
        route.buses[route.buses.length - 1].etaMinutes - route.buses[0].etaMinutes;
      if (span > 0 && span < 180) {
        headwayMinutes = Math.max(
          3,
          Math.round(span / (route.buses.length - 1))
        );
      }
    }

    // 6. Compute Commuter Recommendation Score (0-99)
    let score = 88;
    // Soonest catchable arrival is prized
    if (isCatchable) {
      score += Math.max(0, 14 - Math.floor(eta / 3));
    } else {
      // Leaving before user can walk there: slight penalty unless next bus is right behind
      score -= 8;
      if (route.buses[1] && route.buses[1].etaMinutes <= walkingMinutes + 10) {
        score += 5;
      }
    }
    if (firstBus?.isTomorrow || eta > 180) {
      score -= 25;
    }
    // Walking proximity bonus
    if (walkingMeters <= 250) score += 6;
    else if (walkingMeters > 900) score -= 6;
    // Real-time feed & low delay bonus
    if (firstBus?.isRealTimeFeed) score += 4;
    if ((firstBus?.delayMinutes ?? 0) > 8) score -= 5;
    // Crowd comfort bonus
    if (firstBus?.crowdLevel === 'low') score += 3;
    else if (firstBus?.crowdLevel === 'high') score -= 4;
    // Destination match bonus
    if (destMatchQuality > 0) {
      score += Math.round(destMatchQuality * 0.12);
    }

    const clampedScore = Math.max(55, Math.min(99, score));

    let recommendationBadge: string | undefined;
    if (matchedDestStopName) {
      recommendationBadge = `Direct to ${matchedDestStopName}`;
    } else if (isCatchable && eta <= 8 && !firstBus?.isTomorrow) {
      recommendationBadge = 'Catchable now';
    } else if (headwayMinutes && headwayMinutes <= 12) {
      recommendationBadge = `Every ~${headwayMinutes} min`;
    } else if (firstBus?.crowdLevel === 'low' && !firstBus?.isTomorrow) {
      recommendationBadge = 'Seats available';
    }

    matchedRoutes.push({
      ...route,
      walkingMetersToBoarding: walkingMeters,
      walkingMinutesToBoarding: walkingMinutes,
      headwayMinutes,
      isCatchable,
      matchedDestStopName,
      travelTimeToDestMin,
      recommendationScore: clampedScore,
      recommendationBadge,
    });
  }

  // 7. Sort according to user's selected `RouteSortBy`
  matchedRoutes.sort((a, b) => {
    const etaA = a.buses[0]?.etaMinutes ?? 9999;
    const etaB = b.buses[0]?.etaMinutes ?? 9999;

    switch (sortBy) {
      case 'soonest':
        return etaA - etaB;

      case 'lowest_fare': {
        const fareA = calculateRouteFare(a, origQ, destQ);
        const fareB = calculateRouteFare(b, origQ, destQ);
        if (fareA !== fareB) return fareA - fareB;
        return etaA - etaB;
      }

      case 'least_crowd': {
        const crowdA = a.buses[0]?.crowdPercent ?? 99;
        const crowdB = b.buses[0]?.crowdPercent ?? 99;
        if (crowdA !== crowdB) return crowdA - crowdB;
        return etaA - etaB;
      }

      case 'recommended':
      default: {
        const scA = a.recommendationScore ?? 0;
        const scB = b.recommendationScore ?? 0;
        if (scB !== scA) return scB - scA;
        return etaA - etaB;
      }
    }
  });

  // Crown the #1 recommended route if not already destination-badged
  if (
    matchedRoutes.length > 1 &&
    sortBy === 'recommended' &&
    !matchedRoutes[0].matchedDestStopName &&
    !matchedRoutes[0].buses[0]?.isTomorrow
  ) {
    matchedRoutes[0] = {
      ...matchedRoutes[0],
      recommendationBadge: 'Recommended',
    };
  }

  return matchedRoutes;
}
