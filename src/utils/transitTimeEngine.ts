import { ScheduleTimeBand } from '../types/transit';
import { haversineMeters } from './transitHelpers';

/**
 * Canonical Indian Standard Time (IST / Asia/Kolkata) constants.
 * India does not observe Daylight Saving Time; IST is permanently UTC+05:30.
 */
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330; // +05:30 = 330 minutes
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60_000; // 19,800,000 ms
export const SECONDS_PER_DAY = 86_400;
export const MS_PER_DAY = 86_400_000;

/**
 * Maximum stationary transfer wait allowed on intra-city / metro corridors (< 60 km)
 * before an itinerary is classified as a pathological overnight layover.
 */
export const MAX_URBAN_TRANSFER_WAIT_SEC = 90 * 60; // 90 minutes
export const MAX_INTERCITY_TRANSFER_WAIT_SEC = 180 * 60; // 3 hours

/**
 * Maximum pre-departure wait when querying "Leave Now" / immediate window
 * before a trip is treated as an uncatchable next-day / off-window service.
 */
export const MAX_IMMEDIATE_DEPARTURE_WAIT_SEC = 180 * 60; // 3 hours

export interface IstCalendarParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hours: number; // 0-23
  minutes: number; // 0-59
  seconds: number; // 0-59
  dateString: string; // YYYY-MM-DD in IST
}

export interface RawLegTimingInput {
  mode: string;
  startTime: string;
  endTime: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  duration?: number;
  distance?: number;
  from: { lat: number; lon: number; name?: string };
  to: { lat: number; lon: number; name?: string };
}

export interface SanitizedLegTiming {
  startMs: number;
  endMs: number;
  startTimeIso: string;
  endTimeIso: string;
  scheduledStartMs?: number;
  scheduledEndMs?: number;
  durationSec: number;
  delayMinutes: number;
  wasMidnightRepaired: boolean;
}

export interface SanitizedItineraryTiming {
  startMs: number;
  endMs: number;
  startTimeIso: string;
  endTimeIso: string;
  /** Pure travel duration from first-leg departure to final-leg arrival (`arrival - departure`). */
  durationSec: number;
  transitDurationSec: number;
  walkingDurationSec: number;
  /** Stationary waiting time at transfer points (excludes active walking time between platforms/stops). */
  transferWaitSeconds: number;
  /** Pre-departure wait before the journey starts (`max(0, startMs - referenceTimeMs)`). */
  waitMinutesBeforeStart: number;
  /** Effective door-to-door minutes for same-window comparison without next-day 24h inflation. */
  totalDoorToDoorMinutes: number;
  legs: SanitizedLegTiming[];
}

export interface ItineraryValidationResult {
  valid: boolean;
  reason?:
    | 'empty_legs'
    | 'invalid_timestamp'
    | 'negative_leg_duration'
    | 'excessive_leg_duration'
    | 'negative_transfer_time'
    | 'overnight_transfer_layover'
    | 'exceeds_corridor_bounds'
    | 'next_day_departure_offset';
  sanitized?: SanitizedItineraryTiming;
}

const ISO_WITH_TZ_REGEX = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL_ISO_NO_TZ_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const GTFS_EXTENDED_TIME_REGEX = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const SERVICE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Extracts deterministic calendar components in `Asia/Kolkata` (UTC+05:30)
 * independent of the host OS / container timezone.
 */
export function getIstCalendarParts(epochMs: number): IstCalendarParts {
  const shifted = new Date(epochMs + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const seconds = shifted.getUTCSeconds();
  const dateString = `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hours, minutes, seconds, dateString };
}

/**
 * Constructs a UTC epoch timestamp (ms) from calendar components expressed in `Asia/Kolkata` (IST).
 * Supports `hours >= 24` cleanly via `Date.UTC` rollover (e.g., `hours = 24, minutes = 15` -> next calendar day `00:15 IST`).
 */
export function buildIstEpochMs(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): number {
  return (
    Date.UTC(year, month - 1, day, hours, minutes, seconds, ms) - IST_OFFSET_MS
  );
}

/**
 * Formats a UTC epoch ms timestamp as an explicit IST (`+05:30`) ISO-8601 string.
 */
export function toIstIsoString(epochMs: number): string {
  const p = getIstCalendarParts(epochMs);
  return `${p.dateString}T${String(p.hours).padStart(2, '0')}:${String(
    p.minutes
  ).padStart(2, '0')}:${String(p.seconds).padStart(2, '0')}+05:30`;
}

/**
 * Parses a GTFS `stop_times.txt` clock string (`HH:MM:SS` or `HH:MM`), including
 * extended post-midnight hours `>= 24:00:00` (e.g., `24:15:00`, `26:30:00`),
 * anchored to the given IST service date (`YYYY-MM-DD`).
 *
 * Per GTFS specification, `24:15:00` on service date `2026-11-17` means
 * `2026-11-18T00:15:00+05:30` (never wrapped back to `2026-11-17T00:15:00+05:30`).
 */
export function parseGtfsExtendedTimeToEpochMs(
  serviceDateIst: string,
  gtfsTime: string
): number {
  const dateMatch = SERVICE_DATE_REGEX.exec(serviceDateIst.trim());
  const timeMatch = GTFS_EXTENDED_TIME_REGEX.exec(gtfsTime.trim());
  if (!dateMatch || !timeMatch) return NaN;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;

  if (
    hours < 0 ||
    hours > 47 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return NaN;
  }

  return buildIstEpochMs(year, month, day, hours, minutes, seconds);
}

/**
 * Normalizes any transit timestamp representation into canonical UTC epoch milliseconds:
 * - Epoch ms (`number`) or `Date`
 * - ISO-8601 with explicit timezone (`Z` or `±HH:MM`, e.g., MOTIS/Transitous UTC `Z` or `+05:30`)
 * - Unqualified local ISO strings (`YYYY-MM-DDTHH:mm:ss` -> explicitly anchored to `Asia/Kolkata` `+05:30`,
 *   preventing 5h 30m UTC vs IST skew on UTC servers)
 * - GTFS `HH:MM:SS` / `24+:MM:SS` strings when `fallbackServiceDateIst` is provided
 */
export function parseTransitTimestampMs(
  input: string | number | Date | undefined | null,
  fallbackServiceDateIst?: string
): number {
  if (input === undefined || input === null) return NaN;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : NaN;
  }
  if (input instanceof Date) {
    return input.getTime();
  }

  const trimmed = input.trim();
  if (!trimmed) return NaN;

  // 1. ISO-8601 with explicit timezone designator (`Z` or `±HH:MM`)
  if (ISO_WITH_TZ_REGEX.test(trimmed)) {
    return Date.parse(trimmed);
  }

  // 2. Unqualified ISO-8601 date-time (`YYYY-MM-DDTHH:mm:ss`) -> anchor explicitly to IST (+05:30)
  const localMatch = LOCAL_ISO_NO_TZ_REGEX.exec(trimmed);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hours = Number(localMatch[4]);
    const minutes = Number(localMatch[5]);
    const seconds = localMatch[6] ? Number(localMatch[6]) : 0;
    const ms = localMatch[7] ? Number(localMatch[7].padEnd(3, '0')) : 0;
    return buildIstEpochMs(year, month, day, hours, minutes, seconds, ms);
  }

  // 3. Pure GTFS clock string (`HH:MM:SS` including `>= 24:00:00`) with service date
  if (fallbackServiceDateIst && GTFS_EXTENDED_TIME_REGEX.test(trimmed)) {
    return parseGtfsExtendedTimeToEpochMs(fallbackServiceDateIst, trimmed);
  }

  return Date.parse(trimmed);
}

/**
 * Formats an ISO string or epoch timestamp in Indian Standard Time (`Asia/Kolkata`)
 * regardless of the runtime's local timezone.
 */
export function formatIstClockTime(
  input?: string | number | Date | null
): string {
  if (input === undefined || input === null || input === '') return '';
  const ms = parseTransitTimestampMs(input);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Checks whether `refEpochMs` falls within the Indian late-night transit off-peak window
 * (`22:00` to `05:15 IST`), evaluated strictly in `Asia/Kolkata`.
 */
export function isIstLateNightWindow(refEpochMs: number): boolean {
  const { hours, minutes } = getIstCalendarParts(refEpochMs);
  return hours >= 22 || hours < 5 || (hours === 5 && minutes <= 15);
}

/**
 * Computes the next upcoming morning transit start timestamp (e.g. `06:15:00 IST`)
 * strictly in `Asia/Kolkata` regardless of server/browser timezone.
 */
export function getNextIstMorningEpochMs(
  refEpochMs: number,
  morningHour = 6,
  morningMinute = 15
): number {
  const parts = getIstCalendarParts(refEpochMs);
  let candidate = buildIstEpochMs(
    parts.year,
    parts.month,
    parts.day,
    morningHour,
    morningMinute,
    0
  );
  if (candidate <= refEpochMs) {
    candidate = buildIstEpochMs(
      parts.year,
      parts.month,
      parts.day + 1,
      morningHour,
      morningMinute,
      0
    );
  }
  return candidate;
}

export interface UpcomingScheduleWindow {
  band: Exclude<ScheduleTimeBand, 'nearest'>;
  label: string;
  targetEpochMs: number;
  isTomorrow: boolean;
}

/**
 * Generates upcoming IST schedule time-slot windows across the 24-hour transit cycle
 * (`morning`, `afternoon`, `evening`, `night`) relative to `refEpochMs` so route queries
 * recommend buses across all time slots — not only the immediate departure.
 */
export function buildUpcomingIstScheduleWindows(
  refEpochMs: number
): UpcomingScheduleWindow[] {
  const refParts = getIstCalendarParts(refEpochMs);
  const anchors: Array<{
    band: Exclude<ScheduleTimeBand, 'nearest'>;
    baseLabel: string;
    hour: number;
    minute: number;
  }> = [
    {
      band: 'morning',
      baseLabel: 'Morning',
      // Early morning 06:30 if user searches during late night (00:00-05:30 IST), else 08:30 AM peak
      hour: refParts.hours < 6 ? 6 : 8,
      minute: 30,
    },
    {
      band: 'afternoon',
      baseLabel: 'Afternoon',
      hour: 13,
      minute: 30,
    },
    {
      band: 'evening',
      baseLabel: 'Evening',
      hour: 18,
      minute: 0,
    },
    {
      band: 'night',
      baseLabel: 'Night',
      hour: 21,
      minute: 45,
    },
  ];

  const windows: UpcomingScheduleWindow[] = [];
  for (const a of anchors) {
    let targetMs = buildIstEpochMs(
      refParts.year,
      refParts.month,
      refParts.day,
      a.hour,
      a.minute,
      0
    );
    // If this band anchor has already passed or is within 50 min of `refEpochMs` (covered by `nearest`),
    // roll it to tomorrow's IST slot so the user still gets every time-of-day recommendation.
    if (targetMs <= refEpochMs + 50 * 60_000) {
      targetMs += MS_PER_DAY;
    }

    if (targetMs - refEpochMs <= 24 * 3600_000) {
      const targetParts = getIstCalendarParts(targetMs);
      const isTomorrow = targetParts.dateString !== refParts.dateString;
      windows.push({
        band: a.band,
        label: isTomorrow ? `Tomorrow ${a.baseLabel}` : a.baseLabel,
        targetEpochMs: targetMs,
        isTomorrow,
      });
    }
  }

  windows.sort((x, y) => x.targetEpochMs - y.targetEpochMs);
  return windows;
}

/**
 * Classifies a journey's departure timestamp into an intuitive IST time-of-day band
 * (`nearest`, `morning`, `afternoon`, `evening`, `night`) relative to `searchRefEpochMs`.
 */
export function classifyDepartureScheduleBand(
  departureEpochMs: number,
  searchRefEpochMs: number,
  explicitBand?: ScheduleTimeBand
): {
  band: ScheduleTimeBand;
  label: string;
  isTomorrow: boolean;
} {
  const depParts = getIstCalendarParts(departureEpochMs);
  const refParts = getIstCalendarParts(searchRefEpochMs);
  const isTomorrow = depParts.dateString !== refParts.dateString;
  const waitMin = Math.round((departureEpochMs - searchRefEpochMs) / 60_000);

  if (
    (explicitBand === 'nearest' && waitMin >= -5 && waitMin <= 120) ||
    (!explicitBand && waitMin >= -5 && waitMin <= 75)
  ) {
    return {
      band: 'nearest',
      label: 'Nearest',
      isTomorrow,
    };
  }

  let band: ScheduleTimeBand;
  let baseLabel: string;
  if (explicitBand && explicitBand !== 'nearest') {
    band = explicitBand;
    baseLabel =
      band === 'morning'
        ? 'Morning'
        : band === 'afternoon'
        ? 'Afternoon'
        : band === 'evening'
        ? 'Evening'
        : 'Night';
  } else if (depParts.hours >= 5 && depParts.hours < 12) {
    band = 'morning';
    baseLabel = 'Morning';
  } else if (depParts.hours >= 12 && depParts.hours < 17) {
    band = 'afternoon';
    baseLabel = 'Afternoon';
  } else if (depParts.hours >= 17 && depParts.hours < 21) {
    band = 'evening';
    baseLabel = 'Evening';
  } else {
    band = 'night';
    baseLabel = 'Night';
  }

  return {
    band,
    label: isTomorrow ? `Tomorrow ${baseLabel}` : baseLabel,
    isTomorrow,
  };
}

/**
 * Anchors a user-selected `HH:MM` clock string to an IST epoch timestamp relative to `nowEpochMs`.
 * Rolls forward by +1 calendar day only if the selected IST clock time is more than 2 hours in the past.
 */
export function anchorIstClockInputToEpochMs(
  hhmm: string,
  nowEpochMs: number = Date.now()
): number {
  const match = GTFS_EXTENDED_TIME_REGEX.exec(hhmm.trim());
  if (!match) return nowEpochMs;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const parts = getIstCalendarParts(nowEpochMs);
  let targetMs = buildIstEpochMs(
    parts.year,
    parts.month,
    parts.day,
    hours,
    minutes,
    0
  );
  if (targetMs < nowEpochMs - 2 * 3600_000) {
    targetMs += MS_PER_DAY;
  }
  return targetMs;
}

/**
 * Anchors a sequence of stop timestamps along a single vehicle trip so that
 * post-midnight stops (`23:52` -> `00:08`) progress monotonically forward in time
 * instead of wrapping backward by 24 hours.
 */
export function anchorMonotonicStopTimestampsMs(
  rawInputs: Array<string | number | undefined | null>,
  fallbackServiceDateIst?: string
): number[] {
  let dayRolloverOffsetMs = 0;
  let prevValidMs: number | null = null;

  return rawInputs.map((raw) => {
    const parsed = parseTransitTimestampMs(raw, fallbackServiceDateIst);
    if (Number.isNaN(parsed)) return NaN;

    let adjusted = parsed + dayRolloverOffsetMs;
    if (prevValidMs !== null && adjusted < prevValidMs - 5 * 60_000) {
      // Crossed midnight without incrementing calendar day (e.g., 23:54 -> 00:06 on same date)
      const rolled = adjusted + MS_PER_DAY;
      if (rolled >= prevValidMs && rolled - prevValidMs <= 6 * 3600_000) {
        dayRolloverOffsetMs += MS_PER_DAY;
        adjusted = rolled;
      }
    }

    if (prevValidMs === null || adjusted >= prevValidMs) {
      prevValidMs = adjusted;
    }
    return adjusted;
  });
}

/**
 * Computes the physical upper-bound transit travel duration (in seconds)
 * for an origin–destination corridor of `corridorStraightMeters`.
 *
 * Uses a conservative congested floor speed (~8 km/h over `1.45x` road circuity)
 * plus a 75-minute walk/transfer buffer:
 * - For Gowlidoddi -> Secunderabad Junction (~18.4 km straight / ~26.7 km road):
 *   ceiling is ~4h 35m (16,515s), cleanly admitting normal 1h 15m - 1h 45m trips
 *   while rejecting 23h 26m (84,360s) overnight-layover or 24h-wrap anomalies.
 */
export function computeMaxPlausibleJourneyDurationSec(
  corridorStraightMeters: number
): number {
  const estimatedRoadKm = Math.max(2, (corridorStraightMeters * 1.45) / 1000);
  const minEffectiveSpeedKmh = estimatedRoadKm > 60 ? 18 : 8;
  const bufferSec = estimatedRoadKm > 60 ? 7200 : 4500; // 75m urban, 120m intercity
  return Math.max(
    5400, // minimum 1h 30m ceiling even for very short multi-leg urban hops
    Math.round((estimatedRoadKm / minEffectiveSpeedKmh) * 3600) + bufferSec
  );
}

/**
 * Computes exact duration `duration = (arrival_time - departure_time)` in seconds:
 * - NEVER uses positive 24h modulo (`((diff % 86400) + 86400) % 86400`), so a `-34 min`
 *   timestamp inversion can NEVER become `23h 26m` (`84,360s`).
 * - Safely repairs genuine un-anchored midnight rollovers (`23:50` -> `00:24` stamped with
 *   the departure's calendar date) ONLY when departure is evening/night in IST (`>= 18:00`),
 *   arrival is early morning (`< 08:00`), and `arrival + 24h - departure` is within `maxMidnightRepairSec`.
 */
export function computeStrictDurationSeconds(
  departureInput: string | number | Date,
  arrivalInput: string | number | Date,
  options?: {
    serviceDateIst?: string;
    allowMidnightRolloverRepair?: boolean;
    maxMidnightRepairSec?: number;
  }
): {
  durationSec: number;
  departureMs: number;
  arrivalMs: number;
  wasMidnightRepaired: boolean;
} | null {
  const departureMs = parseTransitTimestampMs(
    departureInput,
    options?.serviceDateIst
  );
  let arrivalMs = parseTransitTimestampMs(
    arrivalInput,
    options?.serviceDateIst
  );

  if (Number.isNaN(departureMs) || Number.isNaN(arrivalMs)) {
    return null;
  }

  let rawDiffSec = Math.round((arrivalMs - departureMs) / 1000);
  let wasMidnightRepaired = false;

  if (rawDiffSec < 0) {
    const allowRepair = options?.allowMidnightRolloverRepair ?? true;
    const maxRepairSec = options?.maxMidnightRepairSec ?? 6 * 3600; // max 6h single-leg midnight span
    if (allowRepair) {
      const depParts = getIstCalendarParts(departureMs);
      const arrParts = getIstCalendarParts(arrivalMs);
      const rolledArrivalMs = arrivalMs + MS_PER_DAY;
      const rolledDiffSec = Math.round((rolledArrivalMs - departureMs) / 1000);

      if (
        depParts.hours >= 18 &&
        arrParts.hours < 8 &&
        rolledDiffSec > 0 &&
        rolledDiffSec <= maxRepairSec
      ) {
        arrivalMs = rolledArrivalMs;
        rawDiffSec = rolledDiffSec;
        wasMidnightRepaired = true;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  return {
    durationSec: rawDiffSec,
    departureMs,
    arrivalMs,
    wasMidnightRepaired,
  };
}

/**
 * Validates, repairs genuine midnight crossings, enforces `duration = arrival - departure`,
 * computes positive stationary transfer wait times, and rejects pathological itineraries
 * (such as 22-hour overnight transfer layovers, 24h modulo wraps like `-34m -> 23h 26m`,
 * or next-day schedule offsets masquerading as immediate routes).
 */
export function sanitizeAndValidateItinerary(params: {
  legs: RawLegTimingInput[];
  corridorStraightMeters: number;
  referenceTimeMs: number;
  isNextMorningFallback?: boolean;
  hasExplicitUserTargetTime?: boolean;
}): ItineraryValidationResult {
  const {
    legs,
    corridorStraightMeters,
    referenceTimeMs,
    isNextMorningFallback = false,
    hasExplicitUserTargetTime = false,
  } = params;

  if (!Array.isArray(legs) || legs.length === 0) {
    return { valid: false, reason: 'empty_legs' };
  }

  const maxJourneyDurationSec = computeMaxPlausibleJourneyDurationSec(
    corridorStraightMeters
  );
  const maxTransferWaitSec =
    corridorStraightMeters > 60_000
      ? MAX_INTERCITY_TRANSFER_WAIT_SEC
      : MAX_URBAN_TRANSFER_WAIT_SEC;

  const sanitizedLegs: SanitizedLegTiming[] = [];
  let cumulativeShiftMs = 0;

  for (let i = 0; i < legs.length; i++) {
    const rawLeg = legs[i];
    const rawStartMs = parseTransitTimestampMs(rawLeg.startTime);
    const rawEndMs = parseTransitTimestampMs(rawLeg.endTime);

    if (Number.isNaN(rawStartMs) || Number.isNaN(rawEndMs)) {
      return { valid: false, reason: 'invalid_timestamp' };
    }

    let legStartMs = rawStartMs + cumulativeShiftMs;
    let legEndMs = rawEndMs + cumulativeShiftMs;

    // If previous leg crossed midnight and was repaired forward by +24h, check if this leg also lacked date rollover
    if (i > 0) {
      const prevEndMs = sanitizedLegs[i - 1].endMs;
      if (legStartMs < prevEndMs - 12 * 3600_000) {
        const prevParts = getIstCalendarParts(prevEndMs);
        const curParts = getIstCalendarParts(legStartMs);
        if (
          legStartMs + MS_PER_DAY >= prevEndMs - 60_000 &&
          curParts.hours < 8 &&
          prevParts.hours < 8
        ) {
          cumulativeShiftMs += MS_PER_DAY;
          legStartMs += MS_PER_DAY;
          legEndMs += MS_PER_DAY;
        }
      }
    }

    const strictLeg = computeStrictDurationSeconds(legStartMs, legEndMs, {
      allowMidnightRolloverRepair: true,
      maxMidnightRepairSec: 6 * 3600,
    });

    if (!strictLeg) {
      return { valid: false, reason: 'negative_leg_duration' };
    }

    legStartMs = strictLeg.departureMs;
    legEndMs = strictLeg.arrivalMs;
    let legDurationSec = strictLeg.durationSec;
    let wasMidnightRepaired = strictLeg.wasMidnightRepaired;

    if (wasMidnightRepaired) {
      cumulativeShiftMs += MS_PER_DAY;
    }

    // Detect if a single leg had a spurious +24h (86,400s) date-offset wrap applied upstream
    // e.g., a 35-min bus leg whose arrival date was erroneously bumped +1 extra day -> 24h 35m or 23h 26m
    const legStraightMeters = haversineMeters(
      rawLeg.from.lat,
      rawLeg.from.lon,
      rawLeg.to.lat,
      rawLeg.to.lon
    );
    const legDistMeters =
      rawLeg.distance && rawLeg.distance > 0
        ? rawLeg.distance
        : legStraightMeters * 1.28;
    const maxSingleLegSec = Math.max(
      3600,
      computeMaxPlausibleJourneyDurationSec(legDistMeters)
    );

    if (legDurationSec > maxSingleLegSec) {
      // Check if upstream applied a 24h modulo complement `86400 - delta` (e.g. -34m -> 84,360s = 23h 26m):
      // That indicates a corrupt inverted leg timestamp — MUST reject, never trust!
      return { valid: false, reason: 'excessive_leg_duration' };
    }

    // Clamp zero-second rounding on tiny walk connectors to >= 30s if distance > 20m
    if (legDurationSec === 0 && legDistMeters > 20) {
      legDurationSec = Math.max(30, Math.round(legDistMeters / 1.25));
      legEndMs = legStartMs + legDurationSec * 1000;
    }

    const schedStartMs = rawLeg.scheduledStartTime
      ? parseTransitTimestampMs(rawLeg.scheduledStartTime)
      : undefined;
    const schedEndMs = rawLeg.scheduledEndTime
      ? parseTransitTimestampMs(rawLeg.scheduledEndTime)
      : undefined;

    const delayMinutes =
      schedStartMs !== undefined && !Number.isNaN(schedStartMs)
        ? Math.max(0, Math.round((rawStartMs - schedStartMs) / 60_000))
        : 0;

    sanitizedLegs.push({
      startMs: legStartMs,
      endMs: legEndMs,
      startTimeIso: new Date(legStartMs).toISOString(),
      endTimeIso: new Date(legEndMs).toISOString(),
      scheduledStartMs:
        schedStartMs !== undefined && !Number.isNaN(schedStartMs)
          ? schedStartMs
          : undefined,
      scheduledEndMs:
        schedEndMs !== undefined && !Number.isNaN(schedEndMs)
          ? schedEndMs
          : undefined,
      durationSec: legDurationSec,
      delayMinutes,
      wasMidnightRepaired,
    });
  }

  // Validate chronological continuity & stationary transfer wait times between consecutive legs
  let stationaryGapSec = 0;
  for (let i = 0; i < sanitizedLegs.length - 1; i++) {
    const prevLeg = sanitizedLegs[i];
    const nextLeg = sanitizedLegs[i + 1];
    const gapSec = Math.round((nextLeg.startMs - prevLeg.endMs) / 1000);

    // Allow up to 90s feed timestamp rounding jitter; reject genuine negative chronological overlaps
    if (gapSec < -90) {
      return { valid: false, reason: 'negative_transfer_time' };
    }

    const positiveGapSec = Math.max(0, gapSec);
    if (positiveGapSec > maxTransferWaitSec) {
      return { valid: false, reason: 'overnight_transfer_layover' };
    }
    stationaryGapSec += positiveGapSec;
  }

  // Also check total gap between consecutive non-WALK transit legs (subtracting active walk connection time)
  const transitIndices = legs
    .map((l, idx) => (l.mode !== 'WALK' ? idx : -1))
    .filter((idx) => idx >= 0);

  let transferWaitSeconds = 0;
  for (let t = 0; t < transitIndices.length - 1; t++) {
    const prevTIdx = transitIndices[t];
    const nextTIdx = transitIndices[t + 1];
    const rawSpanSec = Math.round(
      (sanitizedLegs[nextTIdx].startMs - sanitizedLegs[prevTIdx].endMs) / 1000
    );
    if (rawSpanSec < -90) {
      return { valid: false, reason: 'negative_transfer_time' };
    }
    let intermediateWalkSec = 0;
    for (let k = prevTIdx + 1; k < nextTIdx; k++) {
      intermediateWalkSec += sanitizedLegs[k].durationSec;
    }
    const netWaitSec = Math.max(0, rawSpanSec - intermediateWalkSec);
    if (netWaitSec > maxTransferWaitSec) {
      return { valid: false, reason: 'overnight_transfer_layover' };
    }
    transferWaitSeconds += netWaitSec;
  }

  // Include any stationary buffer before a transit leg after an initial access walk if > 0
  transferWaitSeconds = Math.max(transferWaitSeconds, stationaryGapSec);
  if (transferWaitSeconds > maxTransferWaitSec) {
    return { valid: false, reason: 'overnight_transfer_layover' };
  }

  const itineraryStartMs = sanitizedLegs[0].startMs;
  const itineraryEndMs = sanitizedLegs[sanitizedLegs.length - 1].endMs;

  // Strict duration formula: duration = (arrival_time - departure_time)
  const totalDurationSec = Math.round((itineraryEndMs - itineraryStartMs) / 1000);
  if (totalDurationSec <= 0) {
    return { valid: false, reason: 'negative_leg_duration' };
  }

  if (totalDurationSec > maxJourneyDurationSec) {
    return { valid: false, reason: 'exceeds_corridor_bounds' };
  }

  // Guard against next-day service selection when searching for immediate departures ("Leave Now"):
  // If an itinerary does not depart for > 3 hours (e.g. tomorrow's bus 22 hours away),
  // reject it from immediate results so Tier 2 (snapped trunk stops) or Tier 3 (clean morning schedule) can run.
  const preDepartureWaitSec = Math.max(
    0,
    Math.round((itineraryStartMs - referenceTimeMs) / 1000)
  );
  if (
    !isNextMorningFallback &&
    !hasExplicitUserTargetTime &&
    preDepartureWaitSec > MAX_IMMEDIATE_DEPARTURE_WAIT_SEC
  ) {
    return { valid: false, reason: 'next_day_departure_offset' };
  }

  let transitDurationSec = 0;
  let walkingDurationSec = 0;
  legs.forEach((l, idx) => {
    if (l.mode === 'WALK') {
      walkingDurationSec += sanitizedLegs[idx].durationSec;
    } else {
      transitDurationSec += sanitizedLegs[idx].durationSec;
    }
  });

  const waitMinutesBeforeStart = Math.round(preDepartureWaitSec / 60);
  const travelDurationMin = Math.max(1, Math.round(totalDurationSec / 60));

  // For next-morning scheduled previews (or explicit future departure searches),
  // never fold multi-hour overnight sleep until morning into `totalDoorToDoorMinutes`.
  const effectiveWaitForDoorToDoorMin = isNextMorningFallback
    ? Math.min(waitMinutesBeforeStart, 30)
    : waitMinutesBeforeStart;
  const totalDoorToDoorMinutes = travelDurationMin + effectiveWaitForDoorToDoorMin;

  return {
    valid: true,
    sanitized: {
      startMs: itineraryStartMs,
      endMs: itineraryEndMs,
      startTimeIso: new Date(itineraryStartMs).toISOString(),
      endTimeIso: new Date(itineraryEndMs).toISOString(),
      durationSec: totalDurationSec,
      transitDurationSec,
      walkingDurationSec,
      transferWaitSeconds,
      waitMinutesBeforeStart,
      totalDoorToDoorMinutes,
      legs: sanitizedLegs,
    },
  };
}
