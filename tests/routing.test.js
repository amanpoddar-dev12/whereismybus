import { expect } from 'chai';
import mongoose from 'mongoose';
import BusStop from '../models/BusStop.js';
import Route from '../models/Route.js';
import TrafficSnapshot, { TIME_SLOTS } from '../models/TrafficSnapshot.js';
import {
  calculateDynamicETA,
  buildDAGStops,
  resolveTimeSlot,
} from '../services/routingService.js';

/**
 * Builds an in-memory mock database for BusStop, Route, and TrafficSnapshot
 * that faithfully executes Mongoose-style aggregate() and findOne() calls.
 */
function createMockModels({ includeLoopCorruption = false } = {}) {
  const routeObjectId = new mongoose.Types.ObjectId();

  const stopDocs = [
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_GOWLIDODDI',
      name: 'Gowlidoddi',
      location: { type: 'Point', coordinates: [78.3406, 17.4192] },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_WIPRO_CIRCLE',
      name: 'Wipro Circle',
      location: { type: 'Point', coordinates: [78.3498, 17.4241] },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_GACHIBOWLI_X_ROADS',
      name: 'Gachibowli X Roads',
      location: { type: 'Point', coordinates: [78.3614, 17.4401] },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_RAIDURG',
      name: 'Raidurg',
      location: { type: 'Point', coordinates: [78.3802, 17.4422] },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_BEGUMPET',
      name: 'Begumpet',
      location: { type: 'Point', coordinates: [78.4638, 17.4447] },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      stopId: 'STOP_SECUNDERABAD',
      name: 'Secunderabad',
      location: { type: 'Point', coordinates: [78.5016, 17.4344] },
    },
  ];

  const stopByObjectId = new Map(stopDocs.map((s) => [String(s._id), s]));
  const stopByCode = new Map(stopDocs.map((s) => [s.stopId, s]));

  // Intentionally store stops out of order to verify aggregation sorting
  const rawRouteStops = [
    {
      stopId: stopByCode.get('STOP_SECUNDERABAD')._id,
      sequence: 15,
      distanceFromPrevStopMeters: 5000,
      baseTravelTimeSeconds: 570,
    },
    {
      stopId: stopByCode.get('STOP_GACHIBOWLI_X_ROADS')._id,
      sequence: 3,
      distanceFromPrevStopMeters: 3500,
      baseTravelTimeSeconds: 390,
    },
    {
      stopId: stopByCode.get('STOP_GOWLIDODDI')._id,
      sequence: 1,
      distanceFromPrevStopMeters: 0,
      baseTravelTimeSeconds: 0,
    },
    {
      stopId: stopByCode.get('STOP_BEGUMPET')._id,
      sequence: 10,
      distanceFromPrevStopMeters: 9000,
      baseTravelTimeSeconds: 1020,
    },
    {
      stopId: stopByCode.get('STOP_RAIDURG')._id,
      sequence: 5,
      distanceFromPrevStopMeters: 4000,
      baseTravelTimeSeconds: 450,
    },
    {
      stopId: stopByCode.get('STOP_WIPRO_CIRCLE')._id,
      sequence: 2,
      distanceFromPrevStopMeters: 2500,
      baseTravelTimeSeconds: 270,
    },
  ];

  if (includeLoopCorruption) {
    // Simulate a double-back loop at Gachibowli X Roads (duplicate stopId at higher sequence)
    rawRouteStops.push({
      stopId: stopByCode.get('STOP_GACHIBOWLI_X_ROADS')._id,
      sequence: 11,
      distanceFromPrevStopMeters: 8500,
      baseTravelTimeSeconds: 1800,
    });
  }

  const routes = [
    {
      _id: routeObjectId,
      routeId: 'ROUTE_GOW_SEC',
      routeName: 'Gowlidoddi to Secunderabad',
      stops: rawRouteStops,
      polylinePath: 'mock_encoded_polyline_gow_sec',
    },
  ];

  const trafficSnapshots = [
    { routeId: routeObjectId, timeSlot: TIME_SLOTS.OFF_PEAK, multiplier: 1.0 },
    { routeId: routeObjectId, timeSlot: TIME_SLOTS.PEAK_MORNING, multiplier: 1.6 },
    { routeId: routeObjectId, timeSlot: TIME_SLOTS.PEAK_EVENING, multiplier: 1.95 },
  ];

  const MockRoute = {
    async aggregate(pipeline) {
      const matchStage = pipeline.find((stage) => stage.$match);
      const targetRouteId = matchStage?.$match?.routeId;
      const route = routes.find((r) => r.routeId === targetRouteId);
      if (!route) return [];

      // Simulate $unwind + $sort('stops.sequence': 1) + $lookup('busstops') + $group
      const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
      const joinedStops = sortedStops.map((entry) => {
        const stopDoc = stopByObjectId.get(String(entry.stopId));
        return {
          stopId: stopDoc ? stopDoc.stopId : String(entry.stopId),
          name: stopDoc?.name,
          location: stopDoc?.location,
          sequence: entry.sequence,
          distanceFromPrevStopMeters: entry.distanceFromPrevStopMeters,
          baseTravelTimeSeconds: entry.baseTravelTimeSeconds,
        };
      });

      return [
        {
          _id: route._id,
          routeId: route.routeId,
          routeName: route.routeName,
          polylinePath: route.polylinePath,
          stops: joinedStops,
        },
      ];
    },
  };

  const MockTrafficSnapshot = {
    async findOne({ routeId, timeSlot }) {
      return (
        trafficSnapshots.find(
          (snap) => String(snap.routeId) === String(routeId) && snap.timeSlot === timeSlot
        ) ?? null
      );
    },
  };

  return {
    Route: MockRoute,
    TrafficSnapshot: MockTrafficSnapshot,
  };
}

describe('Routing Engine & Dynamic ETA Scaler (Gowlidoddi -> Secunderabad)', () => {
  const models = createMockModels();

  it('Off-Peak Trip (14:00): Multiplier = 1.0, Total ETA must be exactly ~45 minutes', async () => {
    const result = await calculateDynamicETA('ROUTE_GOW_SEC', '14:00', { models });

    expect(result.routeId).to.equal('ROUTE_GOW_SEC');
    expect(result.timeSlot).to.equal(TIME_SLOTS.OFF_PEAK);
    expect(result.trafficMultiplier).to.equal(1.0);
    expect(result.totalDistanceKm).to.equal(24);
    expect(result.baseDurationSeconds).to.equal(2700);
    expect(result.totalDurationSeconds).to.equal(2700);
    expect(result.totalDurationMinutes).to.equal(45);
    expect(result.stops.map((s) => s.sequence)).to.deep.equal([1, 2, 3, 5, 10, 15]);
  });

  it('Peak Morning Trip (09:00): Multiplier = 1.6, Total ETA must scale to ~72 minutes', async () => {
    const result = await calculateDynamicETA('ROUTE_GOW_SEC', '09:00', { models });

    expect(result.timeSlot).to.equal(TIME_SLOTS.PEAK_MORNING);
    expect(result.trafficMultiplier).to.equal(1.6);
    expect(result.baseDurationSeconds).to.equal(2700);
    expect(result.totalDurationSeconds).to.equal(4320);
    expect(result.totalDurationMinutes).to.equal(72);
    expect(result.stops[0].stopId).to.equal('STOP_GOWLIDODDI');
    expect(result.stops[result.stops.length - 1].stopId).to.equal('STOP_SECUNDERABAD');
  });

  it('Peak Evening Trip (18:30): Multiplier = 1.95, Total ETA must scale to ~88 minutes with strict sequential DAG stops', async () => {
    const result = await calculateDynamicETA('ROUTE_GOW_SEC', '18:30', { models });

    expect(result.timeSlot).to.equal(TIME_SLOTS.PEAK_EVENING);
    expect(result.trafficMultiplier).to.equal(1.95);
    expect(result.baseDurationSeconds).to.equal(2700);
    expect(result.totalDurationSeconds).to.equal(5265);
    expect(Math.round(result.totalDurationMinutes)).to.equal(88);

    // Verify strict sequential order without duplicate stop IDs or circular paths
    const stopIds = result.stops.map((s) => s.stopId);
    const sequences = result.stops.map((s) => s.sequence);

    expect(stopIds).to.deep.equal([
      'STOP_GOWLIDODDI',
      'STOP_WIPRO_CIRCLE',
      'STOP_GACHIBOWLI_X_ROADS',
      'STOP_RAIDURG',
      'STOP_BEGUMPET',
      'STOP_SECUNDERABAD',
    ]);
    expect(new Set(stopIds).size).to.equal(stopIds.length);

    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).to.be.greaterThan(sequences[i - 1]);
    }
  });

  it('Eliminates duplicate stopIds and circular loops via DAG enforcement', async () => {
    const corruptedModels = createMockModels({ includeLoopCorruption: true });
    const result = await calculateDynamicETA('ROUTE_GOW_SEC', '18:30', {
      models: corruptedModels,
    });

    const stopIds = result.stops.map((s) => s.stopId);
    expect(new Set(stopIds).size).to.equal(stopIds.length);
    expect(result.stops.map((s) => s.sequence)).to.deep.equal([1, 2, 3, 5, 10, 15]);
    expect(Math.round(result.totalDurationMinutes)).to.equal(88);
  });

  it('Calculates dynamic ETA between any two intermediate stops A and B', async () => {
    const result = await calculateDynamicETA('ROUTE_GOW_SEC', '09:00', {
      models,
      fromStopId: 'STOP_GACHIBOWLI_X_ROADS',
      toStopId: 'STOP_BEGUMPET',
    });

    // Raidurg (450s) + Begumpet (1020s) = 1470s base * 1.6 = 2352s (39.2 mins)
    expect(result.stops.map((s) => s.stopId)).to.deep.equal([
      'STOP_GACHIBOWLI_X_ROADS',
      'STOP_RAIDURG',
      'STOP_BEGUMPET',
    ]);
    expect(result.baseDurationSeconds).to.equal(1470);
    expect(result.totalDurationSeconds).to.equal(2352);
    expect(result.totalDurationMinutes).to.equal(39.2);
  });

  it('Validates Mongoose schemas and timeSlot resolver', async () => {
    expect(resolveTimeSlot('08:00')).to.equal(TIME_SLOTS.PEAK_MORNING);
    expect(resolveTimeSlot('17:00')).to.equal(TIME_SLOTS.PEAK_EVENING);
    expect(resolveTimeSlot('21:30')).to.equal(TIME_SLOTS.OFF_PEAK);

    const validStop = new BusStop({
      stopId: 'STOP_GOWLIDODDI',
      name: 'Gowlidoddi',
      location: { type: 'Point', coordinates: [78.3406, 17.4192] },
    });
    await validStop.validate();

    const validRoute = new Route({
      routeId: 'ROUTE_GOW_SEC',
      routeName: 'Gowlidoddi to Secunderabad',
      stops: [
        {
          stopId: new mongoose.Types.ObjectId(),
          sequence: 1,
          distanceFromPrevStopMeters: 0,
          baseTravelTimeSeconds: 0,
        },
      ],
    });
    await validRoute.validate();

    const validSnapshot = new TrafficSnapshot({
      routeId: validRoute._id,
      timeSlot: TIME_SLOTS.PEAK_EVENING,
      multiplier: 1.95,
    });
    await validSnapshot.validate();

    const dag = buildDAGStops([
      { stopId: 'B', sequence: 2 },
      { stopId: 'A', sequence: 1 },
      { stopId: 'A', sequence: 3 },
    ]);
    expect(dag.map((s) => s.stopId)).to.deep.equal(['A', 'B']);
  });
});
