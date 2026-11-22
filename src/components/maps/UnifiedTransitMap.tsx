import React, { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Gauge,
  LocateFixed,
  Navigation,
  RefreshCw,
  Route,
  X,
} from 'lucide-react';
import { useTransit } from '../../context/TransitContext';
import {
  buildLiveBusTrackingModel,
  formatIsoToIndianTime,
  formatMeters,
  getBusTelemetry,
  getCrowdBadgeMeta,
} from '../../utils/transitHelpers';
import { cn, StatusDot } from '../ui/primitives';
import {
  createDestinationMarkerIcon,
  createDirectionalLiveBusIcon,
  createFleetVehicleIcon,
  createOriginMarkerIcon,
  createTrackStopIcon,
  createTransferMarkerIcon,
  createUserLocationPin,
} from './transitMapIcons';
import { MapResizeAndViewportSync } from './MapResizeAndViewportSync';
import { useFocusedJourneyMap } from '../../hooks/useFocusedJourneyMap';
import { useSmoothBusMarker } from '../../hooks/useSmoothBusMarker';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export interface UnifiedTransitMapProps {
  className?: string;
}

export const UnifiedTransitMap: React.FC<UnifiedTransitMapProps> = ({
  className,
}) => {
  const {
    city,
    userGeo,
    detectUserLocation,
    setManualLocationPin,
    allAreaStops,
    activeStation,
    selectActiveStation,
    setStationAsDestination,
    liveFleetVehicles,
    openLiveVehicleFromMap,
    loadStopsInMapBounds,
    isLoadingStops,
    previewJourney,
    setPreviewJourneyId,
    routes,
    savedRoutes,
    selectedRouteId,
    selectedBusIndex,
    lastUpdatedTimestamp,
  } = useTransit();

  const [pinMode, setPinMode] = useState<boolean>(false);
  const [followBus, setFollowBus] = useState<boolean>(true);
  const [pendingCenter, setPendingCenter] = useState<[number, number] | null>(
    null
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!selectedRouteId) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, [selectedRouteId, lastUpdatedTimestamp]);

  const trackedRoute = useMemo(
    () =>
      selectedRouteId
        ? routes.find((r) => r.id === selectedRouteId) ||
          savedRoutes.find((r) => r.id === selectedRouteId) ||
          null
        : null,
    [routes, savedRoutes, selectedRouteId]
  );

  const activeBus = trackedRoute
    ? trackedRoute.buses[selectedBusIndex] || trackedRoute.buses[0]
    : null;

  const liveTrackingModel = useMemo(() => {
    if (!trackedRoute || !activeBus) return null;
    return buildLiveBusTrackingModel(
      trackedRoute,
      selectedBusIndex,
      lastUpdatedTimestamp
    );
  }, [activeBus, lastUpdatedTimestamp, selectedBusIndex, trackedRoute]);

  const trackedTelemetry = useMemo(() => {
    if (!trackedRoute || !activeBus) return null;
    return getBusTelemetry(trackedRoute.stops, activeBus.routeProgress);
  }, [activeBus, trackedRoute]);

  const radarCenter: [number, number] = activeStation
    ? [activeStation.lat, activeStation.lon]
    : userGeo.lat !== null && userGeo.lon !== null
    ? [userGeo.lat, userGeo.lon]
    : city.center;

  const initialCenter: [number, number] = trackedTelemetry
    ? [trackedTelemetry.lat, trackedTelemetry.lng]
    : radarCenter;

  const trackedFullPolyline = useMemo<[number, number][] | null>(() => {
    if (!trackedRoute) return null;
    return trackedRoute.polyline && trackedRoute.polyline.length >= 2
      ? trackedRoute.polyline
      : trackedRoute.stops.map((s) => [s.lat, s.lng] as [number, number]);
  }, [trackedRoute]);

  const trackedPassedLine = useMemo<[number, number][] | null>(() => {
    if (!trackedRoute || !trackedTelemetry) return null;
    const passed: [number, number][] = trackedRoute.stops
      .slice(0, trackedTelemetry.lastPassedStopIndex + 1)
      .map((s) => [s.lat, s.lng]);
    passed.push([trackedTelemetry.lat, trackedTelemetry.lng]);
    return passed;
  }, [trackedRoute, trackedTelemetry]);

  const smoothBusPos = useSmoothBusMarker(
    trackedTelemetry?.lat ?? null,
    trackedTelemetry?.lng ?? null,
    liveTrackingModel?.bearing ?? 0,
    trackedFullPolyline
  );

  const trackedBusPos = useMemo<[number, number] | null>(
    () => (smoothBusPos ? [smoothBusPos.lat, smoothBusPos.lon] : null),
    [smoothBusPos]
  );

  const secondsSinceUpdate = useMemo(() => {
    if (!lastUpdatedTimestamp) return 0;
    const updatedMs =
      typeof lastUpdatedTimestamp === 'number'
        ? lastUpdatedTimestamp
        : Date.parse(String(lastUpdatedTimestamp));
    if (!Number.isFinite(updatedMs)) return 0;
    return Math.max(0, Math.round((nowMs - updatedMs) / 1000));
  }, [lastUpdatedTimestamp, nowMs]);

  const { isOffline } = useNetworkStatus();
  const isTelemetryStale = isOffline || secondsSinceUpdate > 60;

  const focusedMap = useFocusedJourneyMap(
    previewJourney,
    trackedRoute,
    trackedBusPos,
    liveFleetVehicles
  );

  const visibleStops = useMemo(
    () => (focusedMap.isFocusMode ? [] : allAreaStops.slice(0, 140)),
    [allAreaStops, focusedMap.isFocusMode]
  );

  const crowdMeta = activeBus
    ? getCrowdBadgeMeta(activeBus.crowdLevel, activeBus.crowdPercent)
    : null;

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-zinc-100 select-none',
        className
      )}
    >
      <MapContainer
        center={initialCenter}
        zoom={city.defaultZoom}
        scrollWheelZoom={false}
        zoomControl={true}
        className="h-full w-full z-0"
      >
        <MapResizeAndViewportSync
          radarCenter={radarCenter}
          previewJourney={previewJourney}
          trackedBusPos={trackedBusPos}
          trackedPolyline={trackedFullPolyline}
          trackedRouteKey={trackedRoute?.id ?? null}
          cameraBoundsPoints={focusedMap.cameraBoundsPoints}
          followTrackedBus={followBus}
          pinMode={pinMode}
          onMapClickPin={(lat, lon) => {
            setPinMode(false);
            setManualLocationPin(lat, lon);
          }}
          onViewportMoved={(lat, lon) => setPendingCenter([lat, lon])}
          onUserPanOrZoom={() => setFollowBus(false)}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={focusedMap.isFocusMode ? 0.84 : 1}
        />

        {/* User Live GPS Marker */}
        {userGeo.lat !== null && userGeo.lon !== null && (
          <Marker
            position={[userGeo.lat, userGeo.lon]}
            icon={createUserLocationPin()}
          >
            <Popup>
              <div className="font-sans text-xs space-y-0.5">
                <p className="font-semibold text-zinc-900">Your location</p>
                <p className="text-zinc-500">{userGeo.addressLabel}</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* MODE A: Active Bus Corridor Tracking */}
        {trackedRoute &&
          liveTrackingModel &&
          trackedTelemetry &&
          trackedFullPolyline && (
            <>
              {/* Outer casing / halo for high contrast */}
              <Polyline
                positions={trackedFullPolyline}
                pathOptions={{ color: '#FFFFFF', weight: 9, opacity: 0.88 }}
              />
              <Polyline
                positions={trackedFullPolyline}
                pathOptions={{ color: '#2563EB', weight: 5, opacity: 0.95 }}
              />

              {trackedPassedLine && trackedPassedLine.length >= 2 && (
                <Polyline
                  positions={trackedPassedLine}
                  pathOptions={{ color: '#94A3B8', weight: 5, opacity: 0.85 }}
                />
              )}

              {liveTrackingModel.stops.map((stop) => (
                <Marker
                  key={`track-stop-${stop.id}-${stop.sequence}`}
                  position={[stop.latitude, stop.longitude]}
                  icon={createTrackStopIcon(stop.status)}
                >
                  <Popup>
                    <div className="font-sans space-y-1 tabular-nums min-w-[165px]">
                      <p className="text-xs font-semibold text-zinc-950">
                        {stop.sequence}. {stop.name}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {stop.platform}
                        {stop.landmark ? ` · ${stop.landmark}` : ''}
                      </p>
                      <p className="text-[11px] font-semibold text-emerald-700">
                        {stop.status === 'passed'
                          ? `Departed (${stop.scheduledArrival})`
                          : stop.etaMinutes !== null && stop.etaMinutes <= 1
                          ? `Arriving now (${stop.estimatedArrival})`
                          : `In ${stop.etaMinutes ?? 2} min (${stop.estimatedArrival})`}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {focusedMap.departureMarker && (
                <Marker
                  position={[
                    focusedMap.departureMarker.lat,
                    focusedMap.departureMarker.lon,
                  ]}
                  icon={createOriginMarkerIcon('Origin')}
                >
                  <Popup>
                    <div className="font-sans text-xs space-y-0.5">
                      <p className="font-semibold text-emerald-700">
                        Boarding: {focusedMap.departureMarker.stopName}
                      </p>
                      <p className="text-zinc-600 tabular-nums">
                        Departs: {focusedMap.departureMarker.timeLabel}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {focusedMap.arrivalMarker && (
                <Marker
                  position={[
                    focusedMap.arrivalMarker.lat,
                    focusedMap.arrivalMarker.lon,
                  ]}
                  icon={createDestinationMarkerIcon('Destination')}
                >
                  <Popup>
                    <div className="font-sans text-xs space-y-0.5">
                      <p className="font-semibold text-rose-700">
                        Destination: {focusedMap.arrivalMarker.stopName}
                      </p>
                      <p className="text-zinc-600 tabular-nums">
                        Est. Arrival: {focusedMap.arrivalMarker.timeLabel}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {smoothBusPos && (
                <Marker
                  position={[smoothBusPos.lat, smoothBusPos.lon]}
                  icon={createDirectionalLiveBusIcon(
                    trackedRoute.routeNumber,
                    smoothBusPos.bearing,
                    {
                      etaMinutes: liveTrackingModel.etaNextStopMinutes,
                      delayMinutes: activeBus?.delayMinutes ?? 0,
                      isStale: isTelemetryStale,
                      operator: trackedRoute.operator,
                    }
                  )}
                >
                  <Popup>
                    <div className="font-sans space-y-1.5 tabular-nums min-w-[205px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
                          {trackedRoute.operator} {trackedRoute.routeNumber}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-semibold',
                            isTelemetryStale
                              ? 'text-zinc-500'
                              : 'text-emerald-700'
                          )}
                        >
                          {liveTrackingModel.speedKmh} km/h
                        </span>
                      </div>
                      <p className="text-xs font-medium text-zinc-900">
                        Next: {liveTrackingModel.nextStopName} (in{' '}
                        {liveTrackingModel.etaNextStopMinutes}m)
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {isTelemetryStale
                          ? 'GPS signal lost - showing estimated position'
                          : `Updated ${secondsSinceUpdate}s ago`}
                      </p>
                      <p className="font-mono text-[10px] text-zinc-500">
                        Vehicle {liveTrackingModel.vehicleNumber} · Heading{' '}
                        {Math.round(smoothBusPos.bearing)}°
                      </p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </>
          )}

        {/* MODE B: Isolated Planned Journey Focus Mode OR City Radar */}
        {!trackedRoute && (
          <>
            {previewJourney &&
              focusedMap.styledLegs.map((sl) => (
                <React.Fragment key={sl.id}>
                  {/* Route casing / halo for high contrast over any map style */}
                  <Polyline
                    positions={sl.positions}
                    pathOptions={{
                      color: sl.haloColor,
                      weight: sl.weight + 4,
                      opacity: sl.isWalk ? 0.65 : 0.9,
                      dashArray: sl.dashArray,
                    }}
                  />
                  <Polyline
                    positions={sl.positions}
                    pathOptions={{
                      color: sl.color,
                      weight: sl.weight,
                      dashArray: sl.dashArray,
                      opacity: 0.95,
                    }}
                  />
                </React.Fragment>
              ))}

            {previewJourney &&
              focusedMap.transferPoints.map((tp) => (
                <React.Fragment key={tp.id}>
                  {tp.walkConnectorPolyline && (
                    <Polyline
                      positions={tp.walkConnectorPolyline}
                      pathOptions={{
                        color: '#6B7280',
                        weight: 3,
                        dashArray: '4, 8',
                        opacity: 0.9,
                      }}
                    />
                  )}
                  <Marker
                    position={[tp.lat, tp.lon]}
                    icon={createTransferMarkerIcon()}
                  >
                    <Tooltip direction="top" offset={[0, -14]}>
                      <span className="font-sans text-[11px] font-medium">
                        Change from Bus {tp.fromRoute} to Bus {tp.toRoute} | Est.
                        wait time: {tp.waitMinutes} mins
                      </span>
                    </Tooltip>
                    <Popup>
                      <div className="min-w-[195px] font-sans space-y-1">
                        <p className="text-xs font-semibold text-amber-700">
                          Transfer at {tp.stopName}
                        </p>
                        <p className="text-[11px] text-zinc-700">
                          Change from Bus{' '}
                          <strong className="font-semibold">
                            {tp.fromRoute}
                          </strong>{' '}
                          to Bus{' '}
                          <strong className="font-semibold">
                            {tp.toRoute}
                          </strong>
                        </p>
                        <p className="text-[11px] font-medium text-zinc-500 tabular-nums">
                          Est. wait time: {tp.waitMinutes} mins
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              ))}

            {previewJourney && focusedMap.departureMarker && (
              <Marker
                position={[
                  focusedMap.departureMarker.lat,
                  focusedMap.departureMarker.lon,
                ]}
                icon={createOriginMarkerIcon(
                  `Boarding: ${focusedMap.departureMarker.stopName}`
                )}
              >
                <Popup>
                  <div className="min-w-[180px] font-sans space-y-1">
                    <p className="text-xs font-semibold text-emerald-700">
                      Boarding: {focusedMap.departureMarker.stopName}
                    </p>
                    <p className="text-[11px] text-zinc-600 tabular-nums">
                      Departure: {focusedMap.departureMarker.timeLabel}
                      {focusedMap.departureMarker.routeLabel
                        ? ` · Bus ${focusedMap.departureMarker.routeLabel}`
                        : ''}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {previewJourney && focusedMap.arrivalMarker && (
              <Marker
                position={[
                  focusedMap.arrivalMarker.lat,
                  focusedMap.arrivalMarker.lon,
                ]}
                icon={createDestinationMarkerIcon(
                  `Destination: ${focusedMap.arrivalMarker.stopName}`
                )}
              >
                <Popup>
                  <div className="min-w-[180px] font-sans space-y-1">
                    <p className="text-xs font-semibold text-rose-700">
                      Destination: {focusedMap.arrivalMarker.stopName}
                    </p>
                    <p className="text-[11px] text-zinc-600 tabular-nums">
                      Est. Arrival: {focusedMap.arrivalMarker.timeLabel}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {visibleStops.map((st) => {
              const isSelected = activeStation?.stopId === st.stopId;
              return (
                <CircleMarker
                  key={st.stopId}
                  center={[st.lat, st.lon]}
                  radius={isSelected ? 7.5 : st.isHub ? 5.5 : 4.2}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 1.8,
                    fillColor: isSelected
                      ? '#059669'
                      : st.isHub
                      ? '#18181B'
                      : '#52525B',
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div className="min-w-[190px] font-sans space-y-2">
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-semibold text-white tabular-nums">
                          {st.agencyPrefix}{' '}
                          {st.stopCode ? `#${st.stopCode}` : ''}
                        </span>
                        {st.distanceFromUserMeters !== undefined && (
                          <span className="font-medium text-zinc-500 tabular-nums">
                            {formatMeters(st.distanceFromUserMeters)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-zinc-950">
                        {st.name}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectActiveStation(st)}
                          className="min-h-[36px] rounded-md border border-zinc-200 bg-zinc-50 py-1.5 px-2 text-[11px] font-medium text-zinc-900 hover:bg-zinc-100"
                        >
                          Departures
                        </button>
                        <button
                          type="button"
                          onClick={() => setStationAsDestination(st)}
                          className="min-h-[36px] rounded-md bg-zinc-900 py-1.5 px-2 text-[11px] font-medium text-white hover:bg-zinc-800"
                        >
                          Route here
                        </button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {focusedMap.focusedVehicles.map((v) => (
              <Marker
                key={v.id}
                position={[v.lat, v.lon]}
                icon={createFleetVehicleIcon(
                  v.routeShortName,
                  v.mode,
                  v.bearingDeg
                )}
              >
                <Popup>
                  <div className="min-w-[185px] font-sans space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                        {v.routeShortName}
                      </span>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        Arr {formatIsoToIndianTime(v.arrivalIso)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-zinc-800">
                      {v.fromName} → {v.toName}
                    </p>
                    <button
                      type="button"
                      onClick={() => openLiveVehicleFromMap(v)}
                      className="w-full flex min-h-[36px] items-center justify-center gap-1 rounded-md bg-zinc-900 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                    >
                      <Navigation className="h-3 w-3" />
                      <span>Live timeline</span>
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
        )}
      </MapContainer>

      {/* Top-Right Map Floating Controls (48px Accessible Touch Targets) */}
      <div className="pointer-events-auto absolute right-3 top-20 md:top-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={detectUserLocation}
          aria-label="Center on my live GPS location"
          title="My live GPS"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white/95 text-zinc-800 shadow-elevated backdrop-blur-sm transition-colors hover:bg-white hover:text-zinc-950"
        >
          <LocateFixed className="h-4 w-4 text-emerald-600" />
        </button>

        {trackedRoute ? (
          <button
            type="button"
            onClick={() => setFollowBus((prev) => !prev)}
            aria-pressed={followBus}
            aria-label={followBus ? 'Following live bus' : 'Re-center on Bus'}
            title={followBus ? 'Following live bus' : 'Re-center on Bus'}
            className={cn(
              'flex h-12 px-3.5 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold shadow-elevated backdrop-blur-sm transition-colors',
              followBus
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-amber-300 bg-white/95 text-zinc-950 hover:bg-white'
            )}
          >
            <Compass
              className={cn(
                'h-4 w-4',
                followBus ? 'text-emerald-400' : 'text-amber-600'
              )}
            />
            <span>{followBus ? 'Follow Bus' : 'Re-center on Bus'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPinMode(!pinMode)}
            aria-pressed={pinMode}
            aria-label="Drop manual pin on map"
            title="Tap map to set manual location pin"
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border shadow-elevated backdrop-blur-sm transition-colors',
              pinMode
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white/95 text-zinc-800 hover:bg-white'
            )}
          >
            <Crosshair className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Live Tracked Bus Telemetry Pill on Map */}
      {trackedRoute && liveTrackingModel && crowdMeta && (
        <div className="pointer-events-none absolute left-3 bottom-24 md:bottom-4 md:top-3 md:bottom-auto z-[400] flex flex-col gap-1.5 max-w-[calc(100%-76px)]">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/92 px-3 py-2 text-xs font-medium text-white shadow-elevated backdrop-blur-sm tabular-nums">
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-semibold text-emerald-400">
              {trackedRoute.routeNumber}
            </span>
            <Gauge className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>{liveTrackingModel.speedKmh} km/h</span>
            <span className="text-zinc-500 hidden sm:inline">·</span>
            <span className="hidden sm:inline truncate">
              Next: {liveTrackingModel.nextStopName} (
              {liveTrackingModel.etaNextStopMinutes}m)
            </span>
          </div>
          {isTelemetryStale && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-zinc-950/95 px-3 py-1.5 text-[11px] font-medium text-amber-300 shadow-elevated">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>GPS signal lost - showing estimated position</span>
            </div>
          )}
        </div>
      )}

      {/* Pin Drop Prompt */}
      {pinMode && (
        <div className="pointer-events-none absolute top-20 md:top-3 left-1/2 -translate-x-1/2 z-[400] rounded-full bg-zinc-950/95 px-4 py-2 text-xs font-medium text-white shadow-elevated">
          Tap any point on the map to set your boarding location
        </div>
      )}

      {/* Search This Area Pill on Map Pan */}
      {pendingCenter && !previewJourney && !trackedRoute && (
        <button
          type="button"
          disabled={isLoadingStops}
          onClick={() => {
            const [lt, ln] = pendingCenter;
            setPendingCenter(null);
            loadStopsInMapBounds(lt, ln);
          }}
          className="absolute top-20 md:top-3 left-1/2 -translate-x-1/2 z-[400] inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-elevated transition-colors hover:bg-zinc-800"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isLoadingStops && 'animate-spin')}
          />
          <span>Search stops here</span>
        </button>
      )}

      {/* Planned Journey Preview Pill */}
      {previewJourney && !trackedRoute && (
        <div className="absolute bottom-24 md:bottom-4 left-3 right-3 sm:left-auto sm:right-4 z-[400] flex items-center justify-between gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/95 px-3.5 py-2.5 text-xs text-white shadow-elevated backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Route className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-medium truncate">
              {previewJourney.summaryLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPreviewJourneyId(null)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UnifiedTransitMap;
