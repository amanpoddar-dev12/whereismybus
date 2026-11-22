import {
  parseItinerariesToPlannedJourneys,
  RawPlanItinerary,
} from '../../services/liveTransitApi';
import { BusRoute } from '../../types/transit';
import {
  rankAndRecommendJourneys,
  synthesizeDirectJourneysFromLoadedRoutes,
} from '../routeRecommender';
import { formatDurationMinutes, formatIsoToIndianTime } from '../transitHelpers';
import {
  anchorMonotonicStopTimestampsMs,
  buildUpcomingIstScheduleWindows,
  computeStrictDurationSeconds,
  getIstCalendarParts,
  getNextIstMorningEpochMs,
  isIstLateNightWindow,
  parseGtfsExtendedTimeToEpochMs,
  parseTransitTimestampMs,
  sanitizeAndValidateItinerary,
  toIstIsoString,
} from '../transitTimeEngine';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message} — expected ${JSON.stringify(
        expected
      )}, received ${JSON.stringify(actual)}`
    );
  }
}

// Coordinates for the reported Hyderabad corridor (~18.4 km straight, ~27 km road)
const GOWLIDODDI = {
  name: 'Gowlidoddi',
  lat: 17.4192,
  lon: 78.3293,
};
const RAIDURG_METRO = {
  name: 'Raidurg Metro Station',
  lat: 17.4422,
  lon: 78.3772,
};
const SECUNDERABAD_JN = {
  name: 'Secunderabad Junction',
  lat: 17.4337,
  lon: 78.5016,
};

export interface TestSuiteSummary {
  passed: number;
  suiteNames: string[];
}

export function runTransitDurationUnitTests(): TestSuiteSummary {
  const suiteNames: string[] = [];
  let passed = 0;

  const test = (name: string, fn: () => void) => {
    fn();
    suiteNames.push(name);
    passed += 1;
  };

  // ============================================================================
  // 1. REGRESSION: Gowlidoddi -> Secunderabad Junction (23h 26m Bug Elimination)
  // ============================================================================
  test(
    'Regression: rejects 23h 26m overnight-layover & selects valid 1h 24m Gowlidoddi -> Secunderabad route',
    () => {
      const searchRefMs = parseTransitTimestampMs('2026-11-17T21:30:00+05:30');

      // Pathological upstream itinerary with a ~22h overnight transfer wait totaling 23h 26m (84,360s)
      const buggyOvernightItinerary: RawPlanItinerary = {
        duration: 84_360, // 23h 26m!
        startTime: '2026-11-17T21:40:00+05:30',
        endTime: '2026-11-18T21:06:00+05:30',
        transfers: 1,
        legs: [
          {
            mode: 'BUS',
            routeShortName: '216K',
            agencyName: 'TGSRTC',
            from: GOWLIDODDI,
            to: RAIDURG_METRO,
            startTime: '2026-11-17T21:40:00+05:30',
            endTime: '2026-11-17T22:05:00+05:30',
            duration: 1500,
            distance: 7200,
          },
          {
            mode: 'SUBWAY',
            routeShortName: 'Blue Line',
            agencyName: 'HMRL',
            from: RAIDURG_METRO,
            to: SECUNDERABAD_JN,
            // Overnight 22h 22m wait until next evening trip -> 23h 26m total!
            startTime: '2026-11-18T20:27:00+05:30',
            endTime: '2026-11-18T21:06:00+05:30',
            duration: 2340,
            distance: 19_500,
          },
        ],
      };

      // Valid same-evening Gowlidoddi -> Raidurg -> Secunderabad Junction route (1h 24m = 5,040s)
      const validCommuterItinerary: RawPlanItinerary = {
        duration: 5040, // 1h 24m
        startTime: '2026-11-17T21:38:00+05:30',
        endTime: '2026-11-17T23:02:00+05:30',
        transfers: 1,
        legs: [
          {
            mode: 'WALK',
            from: GOWLIDODDI,
            to: { ...GOWLIDODDI, name: 'Gowlidoddi Bus Stop' },
            startTime: '2026-11-17T21:38:00+05:30',
            endTime: '2026-11-17T21:43:00+05:30',
            duration: 300,
            distance: 350,
          },
          {
            mode: 'BUS',
            routeShortName: '216K',
            agencyName: 'TGSRTC',
            from: { ...GOWLIDODDI, name: 'Gowlidoddi Bus Stop' },
            to: RAIDURG_METRO,
            startTime: '2026-11-17T21:43:00+05:30',
            endTime: '2026-11-17T22:10:00+05:30',
            duration: 1620,
            distance: 7200,
          },
          {
            mode: 'WALK',
            from: RAIDURG_METRO,
            to: RAIDURG_METRO,
            startTime: '2026-11-17T22:10:00+05:30',
            endTime: '2026-11-17T22:15:00+05:30',
            duration: 300,
            distance: 260,
          },
          {
            mode: 'SUBWAY',
            routeShortName: 'Blue Line',
            agencyName: 'HMRL',
            from: RAIDURG_METRO,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-17T22:21:00+05:30', // 6 min platform wait
            endTime: '2026-11-17T22:59:00+05:30',
            duration: 2280,
            distance: 19_500,
          },
          {
            mode: 'WALK',
            from: SECUNDERABAD_JN,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-17T22:59:00+05:30',
            endTime: '2026-11-17T23:02:00+05:30',
            duration: 180,
            distance: 210,
          },
        ],
      };

      const parsed = parseItinerariesToPlannedJourneys(
        [buggyOvernightItinerary, validCommuterItinerary],
        searchRefMs,
        false
      );

      assertEqual(parsed.length, 1, 'Overnight 23h 26m itinerary must be filtered out');

      const ranked = rankAndRecommendJourneys(parsed, searchRefMs, 'fastest');
      assertEqual(ranked.length, 1, 'Exactly one valid journey ranked');
      const fastest = ranked[0];

      assertEqual(fastest.durationSec, 5040, 'Fastest durationSec must be 5040s (1h 24m)');
      assertEqual(
        formatDurationMinutes(Math.round(fastest.durationSec / 60)),
        '1h 24m',
        'Formatted travel duration must be 1h 24m (within 1h 15m - 1h 45m)'
      );
      assertCondition(
        fastest.durationSec >= 75 * 60 && fastest.durationSec <= 105 * 60,
        'Duration falls strictly within expected 1h 15m - 1h 45m range'
      );
    }
  );

  test(
    'Regression: negative -34 min timestamp inversion NEVER wraps via 24h modulo into 23h 26m',
    () => {
      // -34 minutes (-2,040s): under buggy `((diff % 86400) + 86400) % 86400` this produces 84,360s = 23h 26m!
      const strict = computeStrictDurationSeconds(
        '2026-11-18T14:34:00+05:30',
        '2026-11-18T14:00:00+05:30'
      );
      assertEqual(
        strict,
        null,
        'Inverted daytime arrival < departure (-34m) must return null, never 23h 26m'
      );

      // Also test if upstream feed sent a pre-wrapped +23h 26m single leg on Gowlidoddi -> Secunderabad
      const res = sanitizeAndValidateItinerary({
        corridorStraightMeters: 18_400,
        referenceTimeMs: parseTransitTimestampMs('2026-11-18T09:00:00+05:30'),
        legs: [
          {
            mode: 'BUS',
            from: GOWLIDODDI,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-18T09:10:00+05:30',
            endTime: '2026-11-19T08:36:00+05:30', // +23h 26m!
            duration: 84_360,
            distance: 27_000,
          },
        ],
      });
      assertEqual(res.valid, false, '23h 26m single-leg wrap must be rejected');
      assertEqual(res.reason, 'excessive_leg_duration', 'Rejected by corridor leg ceiling');
    }
  );

  // ============================================================================
  // 2. MIDNIGHT WRAP-AROUND & GTFS >= 24:00:00 EXTENDED HOURS
  // ============================================================================
  test(
    'Midnight Rollover: GTFS >24:00:00 extended hours (23:40:00 -> 25:12:00) compute exact 1h 32m',
    () => {
      const depMs = parseGtfsExtendedTimeToEpochMs('2026-11-17', '23:40:00');
      const arrMs = parseGtfsExtendedTimeToEpochMs('2026-11-17', '25:12:00'); // 01:12 AM on Nov 18 IST

      assertEqual(
        toIstIsoString(depMs),
        '2026-11-17T23:40:00+05:30',
        'Departure anchored to service date 23:40 IST'
      );
      assertEqual(
        toIstIsoString(arrMs),
        '2026-11-18T01:12:00+05:30',
        'GTFS 25:12:00 rolls cleanly to next calendar day 01:12 IST'
      );

      const span = computeStrictDurationSeconds(depMs, arrMs);
      assertCondition(span !== null, 'Midnight GTFS span must be valid');
      assertEqual(span!.durationSec, 92 * 60, '23:40 -> 25:12 must equal 92 min (1h 32m)');
    }
  );

  test(
    'Midnight Rollover: un-anchored cross-midnight ISO leg (23:45 -> 01:10 stamped same date) repairs +1d to 1h 25m',
    () => {
      const refMs = parseTransitTimestampMs('2026-11-17T23:40:00+05:30');
      const res = sanitizeAndValidateItinerary({
        corridorStraightMeters: 18_400,
        referenceTimeMs: refMs,
        legs: [
          {
            mode: 'BUS',
            from: GOWLIDODDI,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-17T23:45:00+05:30',
            // Feed mistakenly kept 2026-11-17 instead of incrementing to 2026-11-18 after midnight!
            endTime: '2026-11-17T01:10:00+05:30',
            duration: 5100,
            distance: 26_800,
          },
        ],
      });

      assertEqual(res.valid, true, 'Cross-midnight leg should be repaired cleanly');
      assertEqual(
        res.sanitized!.durationSec,
        85 * 60,
        'Repaired duration must be 85 min (1h 25m), not negative or 22h 35m'
      );
      assertEqual(
        toIstIsoString(res.sanitized!.endMs),
        '2026-11-18T01:10:00+05:30',
        'Repaired arrival anchored to Nov 18 01:10 IST'
      );
    }
  );

  test(
    'Midnight Rollover: sequential GTFS stop timestamps crossing midnight stay strictly monotonic',
    () => {
      const anchored = anchorMonotonicStopTimestampsMs(
        ['23:48:00', '23:56:00', '00:05:00', '00:18:00'],
        '2026-11-17'
      );
      const offsetsMin = anchored.map((ms) =>
        Math.round((ms - anchored[0]) / 60_000)
      );
      assertEqual(offsetsMin[0], 0, 'Stop 0 offset = 0m');
      assertEqual(offsetsMin[1], 8, 'Stop 1 offset = 8m');
      assertEqual(offsetsMin[2], 17, 'Stop 2 post-midnight offset = 17m');
      assertEqual(offsetsMin[3], 30, 'Stop 3 post-midnight offset = 30m');
    }
  );

  // ============================================================================
  // 3. TIMEZONE & EPOCH CONSISTENCY (Asia/Kolkata UTC+05:30 vs UTC Z)
  // ============================================================================
  test(
    'Timezone Consistency: UTC Z, explicit +05:30 IST, local ISO, and GTFS 24+ resolve to identical epoch',
    () => {
      const utcMs = parseTransitTimestampMs('2026-11-17T18:45:00.000Z');
      const istIsoMs = parseTransitTimestampMs('2026-11-18T00:15:00+05:30');
      const unqualifiedIstMs = parseTransitTimestampMs('2026-11-18T00:15:00');
      const gtfsExtendedMs = parseTransitTimestampMs('24:15:00', '2026-11-17');

      assertEqual(utcMs, istIsoMs, 'UTC Z and +05:30 IST match to the millisecond');
      assertEqual(
        unqualifiedIstMs,
        istIsoMs,
        'Unqualified ISO string defaults to IST (+05:30) without 5h30m UTC drift'
      );
      assertEqual(
        gtfsExtendedMs,
        istIsoMs,
        'GTFS 24:15:00 on Nov 17 matches Nov 18 00:15:00+05:30'
      );

      // Verify mixed-timezone legs (UTC Z departure + IST +05:30 arrival) compute exact duration
      const mixedSpan = computeStrictDurationSeconds(
        '2026-11-18T03:30:00Z', // 09:00 IST
        '2026-11-18T10:25:00+05:30' // 10:25 IST
      );
      assertCondition(mixedSpan !== null, 'Mixed UTC/IST timestamps valid');
      assertEqual(
        mixedSpan!.durationSec,
        85 * 60,
        '09:00 IST (03:30Z) -> 10:25 IST must equal 85 min (zero 5h30m skew)'
      );
    }
  );

  test(
    'Timezone Consistency: 00:49 IST (19:19 UTC) is detected as IST late-night & anchors morning to 06:15 IST',
    () => {
      // At 00:49 IST on Nov 18, UTC clock is 19:19 on Nov 17!
      const postMidnightIstMs = parseTransitTimestampMs('2026-11-17T19:19:00Z');
      assertEqual(
        isIstLateNightWindow(postMidnightIstMs),
        true,
        '00:49 IST must be recognized as late-night even when UTC hour is 19'
      );

      const nextMorningMs = getNextIstMorningEpochMs(postMidnightIstMs, 6, 15);
      const morningParts = getIstCalendarParts(nextMorningMs);
      assertEqual(morningParts.dateString, '2026-11-18', 'Same IST morning date Nov 18');
      assertEqual(morningParts.hours, 6, '06:15 IST hour');
      assertEqual(morningParts.minutes, 15, '06:15 IST minute');

      // Formatting always outputs IST regardless of host timezone
      const formatted = formatIsoToIndianTime('2026-11-18T00:45:00Z'); // 06:15 AM IST
      assertCondition(
        formatted.includes('6:15') || formatted.includes('06:15'),
        `Formatted IST time should show 06:15, got "${formatted}"`
      );
    }
  );

  // ============================================================================
  // 4. SCHEDULE DATE OFFSET / NEXT-DAY SERVICE ISOLATION
  // ============================================================================
  test(
    'Schedule Date Offset: tomorrow service (+22h wait) is rejected from Leave Now & never inflates durationSec to 23h 26m',
    () => {
      const nowMs = parseTransitTimestampMs('2026-11-18T10:00:00+05:30');

      // Bus operating tomorrow morning (22h 02m wait + 1h 24m ride = 23h 26m from `nowMs`!)
      const tomorrowOnlyItinerary: RawPlanItinerary = {
        duration: 5040,
        startTime: '2026-11-19T08:02:00+05:30',
        endTime: '2026-11-19T09:26:00+05:30',
        transfers: 0,
        legs: [
          {
            mode: 'BUS',
            routeShortName: '10H',
            agencyName: 'TGSRTC',
            from: GOWLIDODDI,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-19T08:02:00+05:30',
            endTime: '2026-11-19T09:26:00+05:30',
            duration: 5040,
            distance: 27_200,
          },
        ],
      };

      // 1. Immediate "Leave Now" mode rejects tomorrow's bus so Tier 2/3 can find today's connection
      const immediatePlans = parseItinerariesToPlannedJourneys(
        [tomorrowOnlyItinerary],
        nowMs,
        false
      );
      assertEqual(
        immediatePlans.length,
        0,
        'Tomorrow-only trip (+22h wait) must not masquerade as an immediate departure'
      );

      // 2. When explicitly rendered as a next-morning scheduled route (`isNextMorning = true`),
      // its durationSec & totalDoorToDoorMinutes remain 1h 24m (84m), NEVER 23h 26m (1406m)!
      const morningRefMs = parseTransitTimestampMs('2026-11-19T06:15:00+05:30');
      const morningPlans = parseItinerariesToPlannedJourneys(
        [tomorrowOnlyItinerary],
        morningRefMs,
        true
      );
      assertEqual(morningPlans.length, 1, 'Valid when queried for morning window');

      // Even if TransitContext ranks morningPlans against `nowMs` (22h earlier!), duration stays 1h 24m!
      const rankedFromNow = rankAndRecommendJourneys(
        morningPlans,
        nowMs,
        'fastest'
      );
      assertEqual(rankedFromNow.length, 1, 'Morning schedule preserved when sole option');
      assertEqual(
        rankedFromNow[0].durationSec,
        5040,
        'Travel durationSec remains strictly 5040s (1h 24m)'
      );
      assertEqual(
        rankedFromNow[0].totalDoorToDoorMinutes,
        84,
        'Next-morning door-to-door excludes 22h overnight gap (84m, NOT 1406m / 23h 26m)'
      );
    }
  );

  test(
    'Direct Route Synthesizer: bounds corrupt stop offsets & isolates tomorrow bus ETA from ride duration',
    () => {
      const refMs = parseTransitTimestampMs('2026-11-18T00:50:00+05:30');
      const mockRoute: BusRoute = {
        id: 'TGSRTC::10H::Secunderabad',
        routeNumber: '10H',
        operator: 'TGSRTC',
        serviceType: 'Metro Express',
        isElectric: false,
        isAC: false,
        womenFreeEligible: true,
        womenSchemeName: 'Maha Lakshmi Free',
        name: 'Gowlidoddi → Secunderabad Junction',
        headsign: 'Secunderabad',
        origin: 'Gowlidoddi',
        destination: 'Secunderabad Junction',
        boardingStopName: 'Gowlidoddi',
        boardingStopId: 'st-gowlidoddi',
        boardingStopLat: GOWLIDODDI.lat,
        boardingStopLon: GOWLIDODDI.lon,
        baseFareInr: 15,
        maxFareInr: 45,
        dataSourceLabel: 'Official GTFS (TGSRTC)',
        fullTripLoaded: true,
        stops: [
          {
            id: 'st-gowlidoddi',
            name: 'Gowlidoddi',
            landmark: 'Origin',
            lat: GOWLIDODDI.lat,
            lng: GOWLIDODDI.lon,
            distanceFromStartKm: 0,
            scheduledOffsetMin: 0,
            platform: 'S1',
          },
          {
            id: 'st-secunderabad',
            name: 'Secunderabad Junction',
            landmark: 'Terminal',
            lat: SECUNDERABAD_JN.lat,
            lng: SECUNDERABAD_JN.lon,
            distanceFromStartKm: 26.5,
            scheduledOffsetMin: 1406, // Corrupt 23h 26m offset!
            platform: 'S2',
          },
        ],
        buses: [
          {
            id: 'trip-morning-1',
            tripId: 'trip-morning-1',
            regNumber: 'TG-09-Z-1024',
            etaMinutes: 325,
            arrivalIso: '2026-11-18T06:15:00+05:30',
            scheduledArrivalIso: '2026-11-18T06:15:00+05:30',
            delayMinutes: 0,
            isRealTimeFeed: false,
            isTomorrow: true,
            crowdPercent: 30,
            crowdLevel: 'low',
            speedKmh: 22,
            routeProgress: 0,
            crowdsourcedCount: 3,
          },
        ],
      };

      const synth = synthesizeDirectJourneysFromLoadedRoutes(
        [mockRoute],
        GOWLIDODDI.lat,
        GOWLIDODDI.lon,
        'Gowlidoddi',
        SECUNDERABAD_JN.lat,
        SECUNDERABAD_JN.lon,
        'Secunderabad Junction',
        refMs
      );

      assertEqual(synth.length, 1, 'Synthesized direct route created');
      const rideMin = Math.round(synth[0].durationSec / 60);
      assertCondition(
        rideMin >= 65 && rideMin <= 90,
        `Corrupt 1406m stop offset clamped to realistic ~72m speed-based ride, got ${rideMin}m`
      );
      assertEqual(
        synth[0].totalDoorToDoorMinutes,
        rideMin,
        'Tomorrow bus wait is not folded into travel duration'
      );
    }
  );

  // ============================================================================
  // 5. MULTI-LEG ROUTE TRANSFERS & TIME CONSERVATION
  // ============================================================================
  test(
    'Multi-Leg Transfers: computes positive stationary wait (excluding walk connector) & rejects negative overlaps',
    () => {
      const refMs = parseTransitTimestampMs('2026-11-18T08:55:00+05:30');

      // Walk 5m (09:00-09:05) -> Bus 25m (09:07-09:32, 2m board wait) -> Walk 4m (09:32-09:36) -> Metro 38m (09:44-10:22, 8m wait) -> Walk 3m (10:22-10:25)
      // Total = 09:00 -> 10:25 = 85 min (5,100s)
      // Transit = (25 + 38)m = 63m (3,780s), Walk = (5 + 4 + 3)m = 12m (720s), Stationary wait = (2 + 8)m = 10m (600s)
      const validMultiLeg = sanitizeAndValidateItinerary({
        corridorStraightMeters: 18_400,
        referenceTimeMs: refMs,
        legs: [
          {
            mode: 'WALK',
            from: GOWLIDODDI,
            to: GOWLIDODDI,
            startTime: '2026-11-18T09:00:00+05:30',
            endTime: '2026-11-18T09:05:00+05:30',
            distance: 360,
          },
          {
            mode: 'BUS',
            from: GOWLIDODDI,
            to: RAIDURG_METRO,
            startTime: '2026-11-18T09:07:00+05:30',
            endTime: '2026-11-18T09:32:00+05:30',
            distance: 7200,
          },
          {
            mode: 'WALK',
            from: RAIDURG_METRO,
            to: RAIDURG_METRO,
            startTime: '2026-11-18T09:32:00+05:30',
            endTime: '2026-11-18T09:36:00+05:30',
            distance: 280,
          },
          {
            mode: 'SUBWAY',
            from: RAIDURG_METRO,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-18T09:44:00+05:30',
            endTime: '2026-11-18T10:22:00+05:30',
            distance: 19_500,
          },
          {
            mode: 'WALK',
            from: SECUNDERABAD_JN,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-18T10:22:00+05:30',
            endTime: '2026-11-18T10:25:00+05:30',
            distance: 200,
          },
        ],
      });

      assertEqual(validMultiLeg.valid, true, 'Valid 5-leg itinerary accepted');
      const s = validMultiLeg.sanitized!;
      assertEqual(s.durationSec, 85 * 60, 'Total duration = arrival - departure = 85m');
      assertEqual(s.transitDurationSec, 63 * 60, 'In-vehicle transit duration = 63m');
      assertEqual(s.walkingDurationSec, 12 * 60, 'Walking duration = 12m');
      assertEqual(
        s.transferWaitSeconds,
        10 * 60,
        'Stationary wait = 10m (walk connector not double-counted)'
      );
      assertEqual(
        s.transitDurationSec + s.walkingDurationSec + s.transferWaitSeconds,
        s.durationSec,
        'Exact conservation: ride + walk + stationary wait === arrival - departure'
      );

      // Corrupt negative transfer where Leg 2 departs BEFORE Leg 1 arrives
      const negativeTransfer = sanitizeAndValidateItinerary({
        corridorStraightMeters: 18_400,
        referenceTimeMs: refMs,
        legs: [
          {
            mode: 'BUS',
            from: GOWLIDODDI,
            to: RAIDURG_METRO,
            startTime: '2026-11-18T09:10:00+05:30',
            endTime: '2026-11-18T09:45:00+05:30',
            distance: 7200,
          },
          {
            mode: 'SUBWAY',
            from: RAIDURG_METRO,
            to: SECUNDERABAD_JN,
            startTime: '2026-11-18T09:30:00+05:30', // -15m before Leg 1 ends!
            endTime: '2026-11-18T10:08:00+05:30',
            distance: 19_500,
          },
        ],
      });
      assertEqual(
        negativeTransfer.valid,
        false,
        'Negative transfer overlap must be rejected'
      );
      assertEqual(
        negativeTransfer.reason,
        'negative_transfer_time',
        'Reason must be negative_transfer_time'
      );
    }
  );

  // ============================================================================
  // 6. FULL-DAY MULTI-TIME-SLOT RECOMMENDATIONS (Nearest + Morning/Afternoon/Evening/Night)
  // ============================================================================
  test(
    'Multi-Time-Slot Discovery: preserves Nearest AND Morning/Afternoon/Evening/Night bus recommendations',
    () => {
      const searchRefMs = parseTransitTimestampMs('2026-11-18T01:20:00+05:30');
      const windows = buildUpcomingIstScheduleWindows(searchRefMs);

      assertEqual(
        windows.length,
        4,
        'Generates all 4 upcoming IST schedule bands (morning, afternoon, evening, night)'
      );

      const mkItin = (startIso: string, endIso: string): RawPlanItinerary => ({
        duration: 5040,
        startTime: startIso,
        endTime: endIso,
        transfers: 0,
        legs: [
          {
            mode: 'BUS',
            routeShortName: '10H',
            agencyName: 'TGSRTC',
            from: GOWLIDODDI,
            to: SECUNDERABAD_JN,
            startTime: startIso,
            endTime: endIso,
            duration: 5040,
            distance: 27_000,
          },
        ],
      });

      const nearestPlan = parseItinerariesToPlannedJourneys(
        [mkItin('2026-11-18T01:32:00+05:30', '2026-11-18T02:56:00+05:30')],
        searchRefMs,
        false,
        { scheduleBand: 'nearest', searchRefTimeMs: searchRefMs }
      );
      const morningPlan = parseItinerariesToPlannedJourneys(
        [mkItin('2026-11-18T06:40:00+05:30', '2026-11-18T08:04:00+05:30')],
        parseTransitTimestampMs('2026-11-18T06:30:00+05:30'),
        false,
        { scheduleBand: 'morning', searchRefTimeMs: searchRefMs }
      );
      const eveningPlan = parseItinerariesToPlannedJourneys(
        [mkItin('2026-11-18T18:10:00+05:30', '2026-11-18T19:34:00+05:30')],
        parseTransitTimestampMs('2026-11-18T18:00:00+05:30'),
        false,
        { scheduleBand: 'evening', searchRefTimeMs: searchRefMs }
      );

      const combined = rankAndRecommendJourneys(
        [...nearestPlan, ...morningPlan, ...eveningPlan],
        searchRefMs,
        'smart_best'
      );

      assertEqual(
        combined.length,
        3,
        'Preserves Nearest AND Morning AND Evening recommendations together'
      );
      assertEqual(combined[0].scheduleBand, 'nearest', 'Nearest departure ranked first');
      assertCondition(
        combined.some((p) => p.scheduleBand === 'morning'),
        'Morning schedule recommendation included'
      );
      assertCondition(
        combined.some((p) => p.scheduleBand === 'evening'),
        'Evening schedule recommendation included'
      );
      for (const p of combined) {
        assertEqual(
          p.durationSec,
          5040,
          `Every time-slot route preserves exact 1h 24m ride duration (band=${p.scheduleBand})`
        );
      }
    }
  );

  return { passed, suiteNames };
}
