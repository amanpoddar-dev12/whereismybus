import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronUp,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  QrCode,
  Radio,
  Search,
  X,
  Zap,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import {
  fetchFullGtfsTripDetails,
  searchRealTransitPlaces,
} from '../../services/liveTransitApi';
import {
  calculateRouteFare,
  estimateWalkingMinutes,
  formatIsoToIndianTime,
  formatMeters,
  haversineMeters,
} from '../../utils/transitHelpers';
import {
  isStationHub,
  scoreStationMatch,
  searchLocalStopsSmart,
  splitHighlightSegments,
} from '../../utils/stationSearchEngine';
import { BusRoute, RealTransitStop } from '../../types/transit';
import { Badge, cn, SegmentedTabs } from '../ui/primitives';

type StationFilterMode = 'all' | 'gtfs' | 'hubs' | 'walkable';
type StationSortMode = 'nearest' | 'hubs_first' | 'az';

export const RoutesTimetableTab: React.FC = () => {
  const {
    city,
    userGeo,
    allAreaStops,
    activeStation,
    selectActiveStation,
    setStationAsOrigin,
    setStationAsDestination,
    routes,
    openLiveTracking,
    openTicketModal,
    setActiveTab,
  } = useTransit();

  const [subView, setSubView] = useState<'stations' | 'routes'>('stations');
  const [query, setQuery] = useState<string>('');
  const [stationFilter, setStationFilter] = useState<StationFilterMode>('all');
  const [stationSort, setStationSort] = useState<StationSortMode>('nearest');
  const [remoteStops, setRemoteStops] = useState<RealTransitStop[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState<boolean>(false);
  const [visibleStopLimit, setVisibleStopLimit] = useState<number>(60);

  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [hydratedStopsCache, setHydratedStopsCache] = useState<
    Record<string, BusRoute['stops']>
  >({});
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null);

  const refLat = userGeo.lat ?? activeStation?.lat ?? city.center[0];
  const refLon = userGeo.lon ?? activeStation?.lon ?? city.center[1];

  // Fetch remote city-wide GTFS + OSM stops when user types >= 2 characters
  useEffect(() => {
    const q = query.trim();
    if (subView !== 'stations' || q.length < 2) {
      setRemoteStops([]);
      setIsSearchingRemote(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingRemote(true);
      try {
        const res = await searchRealTransitPlaces(
          q,
          refLat,
          refLon,
          controller.signal
        );
        if (!controller.signal.aborted) {
          const mapped: RealTransitStop[] = res
            .filter((r) => r.isTransitStop)
            .map((r) => {
              const dist = Math.round(
                haversineMeters(refLat, refLon, r.lat, r.lon)
              );
              return {
                stopId: r.stopId || r.id,
                name: r.name,
                stopCode: r.stopCode,
                description: r.subtitle,
                lat: r.lat,
                lon: r.lon,
                modes: ['BUS'],
                agencyPrefix: r.stopId ? 'GTFS Stop' : 'Bus Stop',
                source: r.stopId ? 'GTFS' : 'OSM',
                distanceFromUserMeters: dist,
                isHub: isStationHub(r.name, r.subtitle),
              };
            });
          setRemoteStops(mapped);
        }
      } catch {
        if (!controller.signal.aborted) setRemoteStops([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingRemote(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, refLat, refLon, subView]);

  const filteredStations = useMemo(() => {
    const q = query.trim();
    let list: RealTransitStop[] = q
      ? searchLocalStopsSmart(allAreaStops, q, 400)
      : [...allAreaStops];

    if (q && remoteStops.length > 0) {
      for (const rem of remoteStops) {
        const exists = list.some(
          (loc) =>
            loc.stopId === rem.stopId ||
            (loc.name.toLowerCase() === rem.name.toLowerCase() &&
              haversineMeters(loc.lat, loc.lon, rem.lat, rem.lon) < 220)
        );
        if (!exists) {
          list.push(rem);
        }
      }
    }

    if (stationFilter === 'gtfs') {
      list = list.filter((s) => s.source === 'GTFS');
    } else if (stationFilter === 'hubs') {
      list = list.filter(
        (s) => s.isHub ?? isStationHub(s.name, s.agencyPrefix, s.description)
      );
    } else if (stationFilter === 'walkable') {
      list = list.filter((s) => (s.distanceFromUserMeters ?? 99999) <= 600);
    }

    if (!q || stationSort === 'az') {
      list.sort((a, b) => {
        if (stationSort === 'az') {
          return a.name.localeCompare(b.name);
        }
        if (stationSort === 'hubs_first') {
          const hA = a.isHub ? 1 : 0;
          const hB = b.isHub ? 1 : 0;
          if (hB !== hA) return hB - hA;
        }
        return (
          (a.distanceFromUserMeters ?? 999999) -
          (b.distanceFromUserMeters ?? 999999)
        );
      });
    }

    return list;
  }, [allAreaStops, query, remoteStops, stationFilter, stationSort]);

  const filteredRoutes = useMemo(() => {
    const q = query.trim();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.routeNumber.toLowerCase().includes(q.toLowerCase()) ||
        scoreStationMatch(q, r.name) > 0 ||
        scoreStationMatch(q, r.destination) > 0 ||
        r.stops.some((s) => scoreStationMatch(q, s.name, s.stopCode) > 0)
    );
  }, [query, routes]);

  const handleExpandRoute = async (route: BusRoute) => {
    if (expandedRouteId === route.id) {
      setExpandedRouteId(null);
      return;
    }
    setExpandedRouteId(route.id);
    if (!route.fullTripLoaded && !hydratedStopsCache[route.id] && route.buses[0]) {
      setLoadingRouteId(route.id);
      try {
        const res = await fetchFullGtfsTripDetails(route, route.buses[0].tripId);
        if (res && res.stops.length >= 2) {
          setHydratedStopsCache((prev) => ({ ...prev, [route.id]: res.stops }));
        }
      } catch {
      } finally {
        setLoadingRouteId(null);
      }
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 space-y-5">
      {/* Classic White Directory Header Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950">
              Stations & timetables
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 tabular-nums">
              {city.name} · {allAreaStops.length.toLocaleString()} indexed stops and live GTFS schedules
            </p>
          </div>

          <SegmentedTabs
            ariaLabel="Directory view"
            options={[
              {
                id: 'stations',
                label: 'Stations',
                count: filteredStations.length.toLocaleString(),
              },
              {
                id: 'routes',
                label: 'Timetables',
                count: filteredRoutes.length,
              },
            ]}
            value={subView}
            onChange={setSubView}
            size="sm"
          />
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              subView === 'stations'
                ? 'Search station name, alias (KBS, CSB, E-City), or stop #code…'
                : 'Filter active timetables by route number, stop, or destination…'
            }
            className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 pl-10 pr-9 text-sm font-medium text-zinc-950 placeholder:font-normal placeholder:text-zinc-400 transition-colors focus:border-zinc-900 focus:bg-white focus:outline-none"
          />
          {isSearchingRemote ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
          ) : (
            query && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* VIEW 1: STATIONS DIRECTORY */}
      {subView === 'stations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedTabs
              ariaLabel="Filter stations"
              variant="pills"
              size="xs"
              options={[
                { id: 'all', label: 'All stops' },
                { id: 'gtfs', label: 'Official GTFS' },
                { id: 'hubs', label: 'Hubs & terminals' },
                { id: 'walkable', label: 'Within 600m' },
              ]}
              value={stationFilter}
              onChange={setStationFilter}
            />

            <select
              aria-label="Sort stations"
              value={stationSort}
              onChange={(e) => setStationSort(e.target.value as StationSortMode)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 focus:border-zinc-900 focus:outline-none"
            >
              <option value="nearest" className="bg-white text-zinc-900">
                Sort: Nearest
              </option>
              <option value="hubs_first" className="bg-white text-zinc-900">
                Sort: Hubs first
              </option>
              <option value="az" className="bg-white text-zinc-900">
                Sort: A – Z
              </option>
            </select>
          </div>

          {filteredStations.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center shadow-subtle">
              <Building2 className="mx-auto h-7 w-7 text-zinc-400" />
              <p className="mt-2.5 text-sm font-semibold text-zinc-900">
                No stations matched “{query}”
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Try clearing category filters or searching a broader neighborhood name.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredStations.slice(0, visibleStopLimit).map((st) => {
                const isCurrent = activeStation?.stopId === st.stopId;
                const walkMin = st.distanceFromUserMeters
                  ? estimateWalkingMinutes(st.distanceFromUserMeters * 1.2)
                  : null;
                const segments = splitHighlightSegments(st.name, query);

                return (
                  <div
                    key={st.stopId}
                    className={cn(
                      'flex flex-col justify-between gap-3 rounded-xl border bg-white p-4 shadow-subtle transition-colors',
                      isCurrent
                        ? 'border-zinc-900 ring-1 ring-zinc-900/5'
                        : 'border-zinc-200 hover:border-zinc-300'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                        <Badge variant={st.isHub ? 'primary' : 'subtle'}>
                          {st.isHub ? `${st.agencyPrefix} Hub` : st.agencyPrefix}
                        </Badge>
                        {st.stopCode && (
                          <span className="font-mono text-[11px] font-medium text-zinc-500">
                            #{st.stopCode}
                          </span>
                        )}
                        {st.distanceFromUserMeters !== undefined && (
                          <span className="inline-flex items-center gap-1 text-xs text-zinc-500 ml-auto">
                            <Footprints className="h-3 w-3 text-zinc-400" />
                            {formatMeters(st.distanceFromUserMeters)}
                            {walkMin && walkMin <= 25 ? ` (${walkMin}m)` : ''}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 text-sm font-semibold text-zinc-950 truncate">
                        {segments.map((seg, idx) =>
                          seg.matched ? (
                            <mark
                              key={idx}
                              className="rounded-sm bg-zinc-200/90 px-0.5 font-semibold text-zinc-950"
                            >
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={idx}>{seg.text}</span>
                          )
                        )}
                      </h3>
                      <p className="text-xs text-zinc-500 truncate mt-0.5 tabular-nums">
                        {st.description ||
                          `${st.lat.toFixed(4)}°N, ${st.lon.toFixed(4)}°E`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => {
                          selectActiveStation(st);
                          setActiveTab('search');
                        }}
                        className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                      >
                        <MapPin className="h-3 w-3" />
                        <span>Departures</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStationAsOrigin(st)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Origin</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStationAsDestination(st)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                      >
                        <Navigation className="h-3 w-3 text-zinc-400" />
                        <span>To here</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredStations.length > visibleStopLimit && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleStopLimit((prev) => prev + 100)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-900 shadow-subtle transition-colors hover:bg-zinc-50 tabular-nums"
              >
                Show more stations ({visibleStopLimit} of{' '}
                {filteredStations.length.toLocaleString()})
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ROUTE TIMETABLES */}
      {subView === 'routes' && (
        <div className="space-y-3">
          {filteredRoutes.map((route) => {
            const isExpanded = expandedRouteId === route.id;
            const stopsList = hydratedStopsCache[route.id] || route.stops;
            const totalKm =
              stopsList[stopsList.length - 1]?.distanceFromStartKm || 0;

            return (
              <div
                key={route.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-subtle"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => handleExpandRoute(route)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-zinc-50/70"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex min-w-[60px] shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-900 px-2.5 py-2 text-white tabular-nums">
                      <span className="text-sm font-semibold leading-none">
                        {route.routeNumber}
                      </span>
                      <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                        {route.operator}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="subtle">
                          {route.isElectric && (
                            <Zap className="h-3 w-3 text-emerald-600" />
                          )}
                          {route.serviceType}
                        </Badge>
                        {route.womenFreeEligible && (
                          <Badge variant="subtle">Women ₹0</Badge>
                        )}
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-zinc-950 truncate">
                        {route.origin} → {route.destination}
                      </h3>
                      <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
                        {totalKm.toFixed(1)} km · ₹{route.baseFareInr}–₹{route.maxFareInr}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                    {route.buses[0] && (
                      <span className="hidden sm:inline text-xs font-medium text-emerald-700">
                        Next {formatIsoToIndianTime(route.buses[0].arrivalIso)}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50/50 p-4 space-y-3.5">
                    {loadingRouteId === route.id && (
                      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Loading intermediate GTFS stops…</span>
                      </div>
                    )}

                    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                      <div className="grid grid-cols-12 border-b border-zinc-100 bg-zinc-50 px-3.5 py-2 text-[11px] font-medium text-zinc-500">
                        <div className="col-span-6">Stop</div>
                        <div className="col-span-2 text-right">Distance</div>
                        <div className="col-span-2 text-right">Schedule</div>
                        <div className="col-span-2 text-right">Fare</div>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 tabular-nums">
                        {stopsList.map((stop, idx) => {
                          const stageFare =
                            idx === 0
                              ? route.baseFareInr
                              : calculateRouteFare(
                                  { ...route, stops: stopsList },
                                  stopsList[0].name,
                                  stop.name
                                );
                          return (
                            <div
                              key={`${stop.id}-${idx}`}
                              className="grid grid-cols-12 items-center px-3.5 py-2 text-xs"
                            >
                              <div className="col-span-6 min-w-0 pr-2">
                                <p className="font-medium text-zinc-900 truncate">
                                  {idx + 1}. {stop.name}
                                </p>
                                <p className="text-[11px] text-zinc-400 truncate">
                                  {stop.platform}
                                </p>
                              </div>
                              <div className="col-span-2 text-right text-zinc-500">
                                {stop.distanceFromStartKm.toFixed(1)} km
                              </div>
                              <div className="col-span-2 text-right font-mono text-[11px] font-medium text-zinc-700">
                                {formatIsoToIndianTime(
                                  stop.scheduledArrivalIso || stop.liveArrivalIso
                                ) || `+${stop.scheduledOffsetMin}m`}
                              </div>
                              <div className="col-span-2 text-right font-medium text-zinc-900">
                                {idx === 0 ? '—' : `₹${stageFare}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openTicketModal(route)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
                      >
                        <QrCode className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Buy QR pass</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openLiveTracking(route.id, 0)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                      >
                        <Radio className="h-3.5 w-3.5" />
                        <span>Live tracking</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
