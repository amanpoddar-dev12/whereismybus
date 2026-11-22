import {
  buildFeaturedBusRoutes,
  searchBusRoutesByNumberOrName,
} from '../../data/featuredBusRoutes';
import {
  createSavedFavoriteRecord,
  reorderFavoriteList,
} from '../../hooks/useFavoriteRoutes';
import {
  buildLiveBusTrackingModel,
  inferBusServiceCategory,
} from '../transitHelpers';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runWhereIsMyBusFeatureTests(): { passed: number; suites: string[] } {
  const suites: string[] = [];
  const fixedNow = Date.parse('2026-11-18T09:30:00+05:30');

  // 1. Bus Number Search Engine (216, 222A, 10H, 113M, 49M, AC Vajra)
  {
    for (const query of ['216', '222A', '10H', '113M', '49M']) {
      const results = searchBusRoutesByNumberOrName(query, [], 'hyderabad', fixedNow);
      assert(results.length >= 1, `Expected match for bus number "${query}"`);
      assert(
        results[0].routeNumber.toUpperCase() === query.toUpperCase(),
        `Expected top match for "${query}" to be ${query}, got ${results[0].routeNumber}`
      );
      assert(
        results[0].stops.length >= 6,
        `Expected rich multi-stop timeline for ${query}`
      );
    }

    const vajraResults = searchBusRoutesByNumberOrName(
      'AC Vajra',
      [],
      'bengaluru',
      fixedNow
    );
    assert(vajraResults.length >= 1, 'Expected match for "AC Vajra"');
    assert(
      inferBusServiceCategory(vajraResults[0]) === 'Electric' ||
        inferBusServiceCategory(vajraResults[0]) === 'AC',
      'Expected AC Vajra to be classified as AC or Electric'
    );

    suites.push('Bus Number Search & Service Category Matching (216, 222A, 10H, 113M, 49M, AC Vajra)');
  }

  // 2. Real-Time Bus Detail & Vertical Stop Timeline State Machine
  {
    const featured = buildFeaturedBusRoutes(fixedNow);
    const route216 = featured.find((r) => r.routeNumber === '216')!;
    const liveModel = buildLiveBusTrackingModel(route216, 0, new Date(fixedNow));

    assert(liveModel.routeNumber === '216', 'Route number matches 216');
    assert(
      liveModel.bearing >= 0 && liveModel.bearing <= 360,
      `Valid compass bearing 0-360, got ${liveModel.bearing}`
    );
    assert(
      liveModel.etaNextStopMinutes >= 1 && liveModel.etaNextStopMinutes <= 60,
      `Reasonable next stop ETA, got ${liveModel.etaNextStopMinutes}`
    );
    assert(liveModel.overallStatus === 'ON_TIME', '216 reports ON_TIME');

    const passedStops = liveModel.stops.filter((s) => s.status === 'passed');
    const currentStops = liveModel.stops.filter((s) => s.status === 'current');
    const upcomingStops = liveModel.stops.filter((s) => s.status === 'upcoming');

    assert(passedStops.length >= 1, 'Has passed stops');
    assert(currentStops.length === 1, 'Has exactly 1 pulsing current stop');
    assert(upcomingStops.length >= 1, 'Has upcoming stops');
    assert(
      passedStops.every((s) => s.etaMinutes === null),
      'Passed stops have null countdown ETA'
    );
    assert(
      upcomingStops.every((s) => s.etaMinutes !== null && s.etaMinutes >= 1),
      'Upcoming stops have positive real-time ETA minutes'
    );

    // Delayed route check (49M has 5m delay)
    const route49M = featured.find((r) => r.routeNumber === '49M')!;
    const delayedModel = buildLiveBusTrackingModel(route49M, 0, new Date(fixedNow));
    assert(delayedModel.overallStatus === 'DELAYED', '49M reports DELAYED status');
    assert(delayedModel.delayMinutes === 5, '49M reports 5m delay');

    suites.push('Real-Time Bus Detail View & Stop Timeline State Machine (passed/current/upcoming)');
  }

  // 3. Saved Favorite Routes Serialization & Drag-Reorder Logic
  {
    const featured = buildFeaturedBusRoutes(fixedNow);
    const favA = createSavedFavoriteRecord(featured[0], 'Office Commute', fixedNow);
    const favB = createSavedFavoriteRecord(featured[1], undefined, fixedNow + 1000);
    const favC = createSavedFavoriteRecord(featured[2], 'Airport', fixedNow + 2000);

    assert(favA.customLabel === 'Office Commute', 'Preserves custom favorite label');
    assert(favA.origin === featured[0].origin, 'Stores origin stop');
    assert(favA.destination === featured[0].destination, 'Stores destination stop');

    const reordered = reorderFavoriteList([favA, favB, favC], 0, 2);
    assert(reordered[0].routeId === favB.routeId, 'Item B moved to index 0');
    assert(reordered[1].routeId === favC.routeId, 'Item C moved to index 1');
    assert(reordered[2].routeId === favA.routeId, 'Item A moved to index 2');

    suites.push('Saved Favorite Routes Domain Serialization & Reorder Engine');
  }

  return { passed: suites.length, suites };
}
