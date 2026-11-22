import Route from '../models/Route.js';
import TrafficSnapshot, { TIME_SLOTS } from '../models/TrafficSnapshot.js';

/**
 * Parses a startTime (Date, ISO string, or "HH:mm" string) into a valid Date object.
 * "HH:mm" strings are interpreted in local time on the current date.
 *
 * @param {Date|string|number} startTime
 * @returns {Date}
 */
export function parseStartTime(startTime) {
  if (startTime instanceof Date) {
    if (Number.isNaN(startTime.getTime())) {
      throw new Error('Invalid startTime Date');
    }
    return new Date(startTime.getTime());
  }

  if (typeof startTime === 'string') {
    const hhmmMatch = startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmMatch) {
      const hours = Number(hhmmMatch[1]);
      const minutes = Number(hhmmMatch[2]);
      const seconds = Number(hhmmMatch[3] ?? 0);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        throw new Error(`Invalid time string: "${startTime}"`);
      }
      const date = new Date();
      date.setHours(hours, minutes, seconds, 0);
      return date;
    }

    const parsed = new Date(startTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid startTime string: "${startTime}"`);
    }
    return parsed;
  }

  if (typeof startTime === 'number') {
    const parsed = new Date(startTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid startTime timestamp: ${startTime}`);
    }
    return parsed;
  }

  throw new Error('startTime is required and must be a Date, ISO string, timestamp, or "HH:mm" string');
}

/**
 * Determines the traffic timeSlot from a given startTime.
 * - PEAK_MORNING: 08:00 - 11:00 (hours 8, 9, 10)
 * - PEAK_EVENING: 17:00 - 21:00 (hours 17, 18, 19, 20)
 * - OFF_PEAK: all other hours
 *
 * @param {Date|string|number} startTime
 * @returns {'PEAK_MORNING'|'PEAK_EVENING'|'OFF_PEAK'}
 */
export function resolveTimeSlot(startTime) {
  const date = parseStartTime(startTime);
  const hour = date.getHours();

  if (hour >= 8 && hour < 11) {
    return TIME_SLOTS.PEAK_MORNING;
  }
  if (hour >= 17 && hour < 21) {
    return TIME_SLOTS.PEAK_EVENING;
  }
  return TIME_SLOTS.OFF_PEAK;
}

/**
 * Normalizes a stop entry and enforces Directed Acyclic Graph (DAG) invariants:
 * - Nodes are sorted in strictly ascending order of `sequence`.
 * - Duplicate stopIds and non-ascending sequences are eliminated to prevent loops.
 *
 * @param {Array<Object>} rawStops
 * @returns {Array<Object>}
 */
export function buildDAGStops(rawStops) {
  if (!Array.isArray(rawStops) || rawStops.length === 0) {
    return [];
  }

  const normalized = rawStops
    .map((entry) => {
      const stopDoc =
        entry.stopId && typeof entry.stopId === 'object' && entry.stopId.stopId
          ? entry.stopId
          : null;

      const canonicalStopId = stopDoc
        ? stopDoc.stopId
        : typeof entry.stopId === 'string'
          ? entry.stopId
          : String(entry.stopId);

      return {
        stopId: canonicalStopId,
        name: entry.name ?? stopDoc?.name ?? canonicalStopId,
        coordinates: entry.location?.coordinates ?? stopDoc?.location?.coordinates ?? null,
        sequence: Number(entry.sequence),
        distanceFromPrevStopMeters: Number(entry.distanceFromPrevStopMeters ?? 0),
        baseTravelTimeSeconds: Number(entry.baseTravelTimeSeconds ?? 0),
      };
    })
    .filter((stop) => Number.isFinite(stop.sequence) && stop.sequence >= 1);

  normalized.sort((a, b) => a.sequence - b.sequence);

  const dagStops = [];
  const visitedStopIds = new Set();
  let lastSequence = 0;

  for (const stop of normalized) {
    if (stop.sequence <= lastSequence) {
      continue;
    }
    if (visitedStopIds.has(stop.stopId)) {
      continue;
    }
    visitedStopIds.add(stop.stopId);
    lastSequence = stop.sequence;
    dagStops.push(stop);
  }

  return dagStops;
}

/**
 * Fetches a route with its stops sorted by sequence ascending using MongoDB aggregation.
 *
 * @param {string} routeId
 * @param {typeof Route} RouteModel
 * @returns {Promise<Object|null>}
 */
export async function fetchOrderedRoute(routeId, RouteModel = Route) {
  const results = await RouteModel.aggregate([
    { $match: { routeId } },
    { $unwind: '$stops' },
    { $sort: { 'stops.sequence': 1 } },
    {
      $lookup: {
        from: 'busstops',
        localField: 'stops.stopId',
        foreignField: '_id',
        as: 'stopDetails',
      },
    },
    {
      $unwind: {
        path: '$stopDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: '$_id',
        routeId: { $first: '$routeId' },
        routeName: { $first: '$routeName' },
        polylinePath: { $first: '$polylinePath' },
        stops: {
          $push: {
            stopId: { $ifNull: ['$stopDetails.stopId', '$stops.stopId'] },
            name: '$stopDetails.name',
            location: '$stopDetails.location',
            sequence: '$stops.sequence',
            distanceFromPrevStopMeters: '$stops.distanceFromPrevStopMeters',
            baseTravelTimeSeconds: '$stops.baseTravelTimeSeconds',
          },
        },
      },
    },
  ]);

  return results && results.length > 0 ? results[0] : null;
}

/**
 * Calculates dynamic travel duration using:
 * Dynamic Duration = Base Travel Time * Traffic Multiplier
 *
 * @param {number} baseTravelTimeSeconds
 * @param {number} multiplier
 * @returns {number}
 */
export function calculateDynamicDurationSeconds(baseTravelTimeSeconds, multiplier) {
  return Math.round(baseTravelTimeSeconds * multiplier);
}

/**
 * Calculates dynamic ETA for a route (or a sub-segment between fromStopId and toStopId)
 * at a given startTime, scaling baseline travel durations by the active TrafficSnapshot multiplier.
 *
 * @param {string} routeId
 * @param {Date|string|number} startTime
 * @param {Object} [options]
 * @param {string} [options.fromStopId]
 * @param {string} [options.toStopId]
 * @param {Object} [options.models] - Optional model overrides for testing
 * @returns {Promise<Object>}
 */
export async function calculateDynamicETA(routeId, startTime, options = {}) {
  if (!routeId || typeof routeId !== 'string') {
    throw new Error('routeId must be a non-empty string');
  }

  const startDate = parseStartTime(startTime);
  const timeSlot = resolveTimeSlot(startDate);

  const RouteModel = options.models?.Route ?? Route;
  const TrafficSnapshotModel = options.models?.TrafficSnapshot ?? TrafficSnapshot;

  const route = await fetchOrderedRoute(routeId, RouteModel);
  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  const dagStops = buildDAGStops(route.stops);
  if (dagStops.length === 0) {
    throw new Error(`Route ${routeId} has no valid stops`);
  }

  let startIndex = 0;
  let endIndex = dagStops.length - 1;

  if (options.fromStopId) {
    startIndex = dagStops.findIndex((s) => s.stopId === options.fromStopId);
    if (startIndex === -1) {
      throw new Error(`Origin stop ${options.fromStopId} not found on route ${routeId}`);
    }
  }

  if (options.toStopId) {
    endIndex = dagStops.findIndex((s) => s.stopId === options.toStopId);
    if (endIndex === -1) {
      throw new Error(`Destination stop ${options.toStopId} not found on route ${routeId}`);
    }
  }

  if (startIndex > endIndex) {
    throw new Error(
      `Invalid DAG traversal: origin stop (${dagStops[startIndex].stopId}, seq ${dagStops[startIndex].sequence}) comes after destination stop (${dagStops[endIndex].stopId}, seq ${dagStops[endIndex].sequence})`
    );
  }

  const snapshot = await TrafficSnapshotModel.findOne({
    routeId: route._id,
    timeSlot,
  });

  const trafficMultiplier =
    snapshot && Number.isFinite(snapshot.multiplier) ? snapshot.multiplier : 1.0;

  const traversedStops = dagStops.slice(startIndex, endIndex + 1);

  let cumulativeDistanceMeters = 0;
  let baseDurationSeconds = 0;
  let cumulativeDynamicSeconds = 0;

  const stopETAs = traversedStops.map((stop, idx) => {
    const legDistance = idx === 0 ? 0 : stop.distanceFromPrevStopMeters;
    const legBaseSeconds = idx === 0 ? 0 : stop.baseTravelTimeSeconds;
    const exactLegDynamicSeconds = idx === 0 ? 0 : legBaseSeconds * trafficMultiplier;

    cumulativeDistanceMeters += legDistance;
    baseDurationSeconds += legBaseSeconds;
    cumulativeDynamicSeconds += exactLegDynamicSeconds;

    const roundedCumulativeSeconds = Math.round(cumulativeDynamicSeconds);
    const etaDate = new Date(startDate.getTime() + roundedCumulativeSeconds * 1000);

    return {
      stopId: stop.stopId,
      name: stop.name,
      sequence: stop.sequence,
      coordinates: stop.coordinates,
      distanceFromPrevStopMeters: legDistance,
      cumulativeDistanceMeters,
      baseTravelTimeSeconds: legBaseSeconds,
      dynamicTravelTimeSeconds: Math.round(exactLegDynamicSeconds),
      cumulativeTimeSeconds: roundedCumulativeSeconds,
      cumulativeMinutes: Number((cumulativeDynamicSeconds / 60).toFixed(2)),
      eta: etaDate.toISOString(),
    };
  });

  const totalDurationSeconds = Math.round(cumulativeDynamicSeconds);
  const estimatedArrivalTime =
    stopETAs.length > 0 ? stopETAs[stopETAs.length - 1].eta : startDate.toISOString();

  return {
    routeId: route.routeId,
    routeName: route.routeName,
    timeSlot,
    trafficMultiplier,
    startTime: startDate.toISOString(),
    estimatedArrivalTime,
    totalDistanceMeters: cumulativeDistanceMeters,
    totalDistanceKm: Number((cumulativeDistanceMeters / 1000).toFixed(2)),
    baseDurationSeconds,
    totalDurationSeconds,
    totalDurationMinutes: Number((cumulativeDynamicSeconds / 60).toFixed(2)),
    stops: stopETAs,
    polylinePath: route.polylinePath ?? '',
  };
}

export default {
  parseStartTime,
  resolveTimeSlot,
  buildDAGStops,
  fetchOrderedRoute,
  calculateDynamicDurationSeconds,
  calculateDynamicETA,
};
