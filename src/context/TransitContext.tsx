import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActiveTab,
  BusRoute,
  CityPreset,
  CityPresetId,
  CrowdLevel,
  DepartureTimeMode,
  LiveMapVehicle,
  PlannedJourney,
  ProximityAlarm,
  QuickFilterId,
  RealTransitStop,
  RecentSearchItem,
  RecommendationPreference,
  RouteSortBy,
  SavedFavoriteRoute,
  SuggestionCategory,
  UpiTicketPass,
  UserGeoState,
} from '../types/transit';
import { CITY_PRESETS } from '../config/transitConfig';
import { buildFeaturedBusRoutes } from '../data/featuredBusRoutes';
import { useFavoriteRoutes } from '../hooks/useFavoriteRoutes';
import { usePersistedState } from '../hooks/usePersistedState';
import { ToastNotice, useToastQueue } from '../hooks/useToastQueue';
import {
  cacheViewedRoute,
  getActiveTickets,
  saveActiveTicket,
} from '../services/db';
import {
  fetchAllStopsAroundLocation,
  fetchFullGtfsTripDetails,
  fetchLiveMovingFleetInBounds,
  fetchLiveRoutesForStops,
  planRealTransitJourney,
  reverseGeocodeLocation,
  SearchPlaceSuggestion,
} from '../services/liveTransitApi';
import {
  computeLiveProgressFromSchedule,
  getBusTelemetry,
  haversineMeters,
  playAlarmChime,
} from '../utils/transitHelpers';
import {
  rankAndRecommendJourneys,
  scoreAndSortBusRoutes,
  synthesizeDirectJourneysFromLoadedRoutes,
} from '../utils/routeRecommender';

export type { ToastNotice };

interface TransitContextValue {
  cityPresetId: CityPresetId;
  city: CityPreset;
  selectCityPreset: (id: CityPresetId) => void;

  // Real Browser Geolocation & Nearest Bus Station
  userGeo: UserGeoState;
  detectUserLocation: () => void;
  setManualLocationPin: (lat: number, lon: number, label?: string) => void;

  // All Real Bus Stations & Stops in Area
  allAreaStops: RealTransitStop[];
  nearestStop: RealTransitStop | null;
  activeStation: RealTransitStop | null;
  selectActiveStation: (stop: RealTransitStop) => void;
  setStationAsOrigin: (stop: RealTransitStop) => void;
  setStationAsDestination: (stop: RealTransitStop) => void;
  loadStopsInMapBounds: (centerLat: number, centerLon: number, spanDeg?: number) => Promise<void>;

  isLoadingStops: boolean;
  isLoadingRoutes: boolean;
  isLoadingTripDetail: boolean;
  apiError: string | null;
  refreshLiveTransitData: () => void;

  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Dedicated Search Tab Query State
  searchFilterQuery: string;
  setSearchFilterQuery: (val: string) => void;

  // Search, Recent History & Departure Timing
  originQuery: string;
  setOriginQuery: (val: string) => void;
  destinationQuery: string;
  setDestinationQuery: (val: string) => void;
  originCoords: { lat: number; lon: number; label: string } | null;
  setOriginCoords: (val: { lat: number; lon: number; label: string } | null) => void;
  destinationCoords: { lat: number; lon: number; label: string } | null;
  setDestinationCoords: (val: { lat: number; lon: number; label: string } | null) => void;
  applyOriginSuggestion: (
    s: SearchPlaceSuggestion & { category?: SuggestionCategory; stopCode?: string }
  ) => void;
  applyDestinationSuggestion: (
    s: SearchPlaceSuggestion & { category?: SuggestionCategory; stopCode?: string }
  ) => void;
  swapOriginDestination: () => void;
  clearSearch: () => void;

  recentSearches: RecentSearchItem[];
  recordRecentSearch: (item: Omit<RecentSearchItem, 'timestamp'>) => void;
  clearRecentSearches: () => void;

  // Departure Time & Recommendation Engine Controls
  departureTimeMode: DepartureTimeMode;
  customDepartureIso: string | null;
  setDepartureSchedule: (mode: DepartureTimeMode, iso: string | null) => void;
  applyQuickTimeOffset: (minutesFromNow: number) => void;

  recommendationPreference: RecommendationPreference;
  setRecommendationPreference: (pref: RecommendationPreference) => void;
  routeSortBy: RouteSortBy;
  setRouteSortBy: (sort: RouteSortBy) => void;

  plannedJourneys: PlannedJourney[];
  isPlanningJourney: boolean;
  previewJourneyId: string | null;
  setPreviewJourneyId: (id: string | null) => void;
  previewJourney: PlannedJourney | null;
  openPlannedLegTracking: (
    tripId: string,
    routeShortName?: string,
    agencyName?: string
  ) => Promise<void>;

  activeQuickFilters: QuickFilterId[];
  toggleQuickFilter: (filterId: QuickFilterId) => void;

  routes: BusRoute[];
  filteredRoutes: BusRoute[];
  liveFleetVehicles: LiveMapVehicle[];

  // Live Tracking View & Contextual On-Demand Map
  selectedRouteId: string | null;
  selectedBusIndex: number;
  liveMapRequested: boolean;
  setLiveMapRequested: (open: boolean) => void;
  openLiveTracking: (routeId: string, busIndex?: number, showMap?: boolean) => void;
  trackBusRoute: (route: BusRoute, busIndex?: number, showMap?: boolean) => void;
  openLiveVehicleFromMap: (vehicle: LiveMapVehicle) => Promise<void>;
  closeLiveTracking: () => void;
  setSelectedBusIndex: (idx: number) => void;

  lowDataMode: boolean;
  setLowDataMode: (val: boolean) => void;
  lastUpdatedTimestamp: Date;
  isSimPaused: boolean;
  setIsSimPaused: (val: boolean) => void;

  // Crowdsourced GPS & Karma
  karmaPoints: number;
  onBoardBusIds: string[];
  votedBusCrowd: Record<string, CrowdLevel>;
  toggleOnBoardBus: (routeId: string, busId: string) => void;
  submitCrowdVote: (routeId: string, busId: string, level: CrowdLevel) => void;

  // Proximity Alarms ("Wake Me Up")
  alarms: ProximityAlarm[];
  ringingAlarm: ProximityAlarm | null;
  dismissRingingAlarm: () => void;
  addOrUpdateAlarm: (params: {
    routeId: string;
    tripId: string;
    stopId: string;
    radiusMeters: 500 | 1000 | 2000;
  }) => void;
  toggleAlarmActive: (alarmId: string) => void;
  removeAlarm: (alarmId: string) => void;
  simulateAlarmRingNow: (alarmId: string) => void;

  // UPI QR Express Tickets
  tickets: UpiTicketPass[];
  purchaseUpiTicket: (params: {
    route: BusRoute;
    originStop: string;
    destinationStop: string;
    adultCount: number;
    womenFreeCount: number;
    totalFareInr: number;
    upiApp: 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM UPI';
  }) => UpiTicketPass;

  // Saved Favorite Routes (persisted in localStorage via useFavoriteRoutes)
  favoriteRoutes: SavedFavoriteRoute[];
  savedRoutes: BusRoute[];
  isRouteSaved: (routeId: string) => boolean;
  toggleSavedRoute: (route: BusRoute, customLabel?: string) => void;
  removeFavoriteRoute: (routeId: string) => void;
  reorderFavoriteRoutes: (fromIndex: number, toIndex: number) => void;
  moveFavoriteRoute: (routeId: string, direction: 'up' | 'down') => void;
  updateFavoriteLabel: (routeId: string, label: string) => void;

  // Modals
  voiceModalOpen: boolean;
  setVoiceModalOpen: (open: boolean) => void;
  ticketModalRoute: BusRoute | null;
  openTicketModal: (route: BusRoute) => void;
  closeTicketModal: () => void;
  alarmModalContext: { route: BusRoute; busIndex: number; defaultStopId?: string } | null;
  openAlarmModal: (route: BusRoute, busIndex?: number, defaultStopId?: string) => void;
  closeAlarmModal: () => void;
  sosModalContext: { route: BusRoute; busIndex: number } | null;
  openSosModal: (route: BusRoute, busIndex?: number) => void;
  closeSosModal: () => void;

  toasts: ToastNotice[];
  pushToast: (notice: Omit<ToastNotice, 'id'>) => void;
}

const STORAGE_KEYS = {
  TICKETS: 'wimb_prod_tickets_v2',
  ALARMS: 'wimb_prod_alarms_v2',
  KARMA: 'wimb_prod_karma_v2',
  RECENT_SEARCHES: 'wimb_prod_recent_searches_v1',
};

const TransitContext = createContext<TransitContextValue | undefined>(undefined);

export const TransitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cityPresetId, setCityPresetId] = useState<CityPresetId>('bengaluru');
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [searchFilterQuery, setSearchFilterQuery] = useState<string>('');

  const [userGeo, setUserGeo] = useState<UserGeoState>({
    status: 'idle',
    lat: null,
    lon: null,
    accuracyMeters: null,
    addressLabel: 'Detecting your nearest bus station...',
    cityLabel: '',
    lastUpdated: null,
  });

  const [searchCenter, setSearchCenter] = useState<[number, number]>(
    CITY_PRESETS.bengaluru.center
  );

  const [allAreaStops, setAllAreaStops] = useState<RealTransitStop[]>([]);
  const [activeStation, setActiveStation] = useState<RealTransitStop | null>(null);
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [liveFleetVehicles, setLiveFleetVehicles] = useState<LiveMapVehicle[]>([]);

  const [isLoadingStops, setIsLoadingStops] = useState<boolean>(true);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(true);
  const [isLoadingTripDetail, setIsLoadingTripDetail] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Origin & Destination Search + Real GTFS Journey Planner
  const [originQuery, setOriginQuery] = useState<string>('');
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [originCoords, setOriginCoords] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{
    lat: number;
    lon: number;
    label: string;
  } | null>(null);

  // Departure Time & Recommendation Preferences
  const [departureTimeMode, setDepartureTimeMode] = useState<DepartureTimeMode>('now');
  const [customDepartureIso, setCustomDepartureIso] = useState<string | null>(null);
  const [recommendationPreference, setRecommendationPreference] =
    useState<RecommendationPreference>('smart_best');
  const [routeSortBy, setRouteSortBy] = useState<RouteSortBy>('recommended');

  const [rawPlannedJourneys, setRawPlannedJourneys] = useState<PlannedJourney[]>([]);
  const [isPlanningJourney, setIsPlanningJourney] = useState<boolean>(false);
  const [previewJourneyId, setPreviewJourneyId] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = usePersistedState<RecentSearchItem[]>(
    STORAGE_KEYS.RECENT_SEARCHES,
    []
  );

  const [activeQuickFilters, setActiveQuickFilters] = useState<QuickFilterId[]>([]);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedBusIndex, setSelectedBusIndex] = useState<number>(0);
  const [liveMapRequested, setLiveMapRequested] = useState<boolean>(false);

  const [lowDataMode, setLowDataMode] = useState<boolean>(false);
  const [lastUpdatedTimestamp, setLastUpdatedTimestamp] = useState<Date>(() => new Date());
  const [isSimPaused, setIsSimPaused] = useState<boolean>(false);

  // Persisted User Convenience State
  const [karmaPoints, setKarmaPoints] = usePersistedState<number>(
    STORAGE_KEYS.KARMA,
    100
  );
  const [onBoardBusIds, setOnBoardBusIds] = useState<string[]>([]);
  const [votedBusCrowd, setVotedBusCrowd] = useState<Record<string, CrowdLevel>>({});

  const [alarms, setAlarms] = usePersistedState<ProximityAlarm[]>(
    STORAGE_KEYS.ALARMS,
    []
  );
  const [ringingAlarm, setRingingAlarm] = useState<ProximityAlarm | null>(null);

  const [tickets, setTickets] = usePersistedState<UpiTicketPass[]>(
    STORAGE_KEYS.TICKETS,
    []
  );

  const {
    favorites: favoriteRoutes,
    savedRoutes,
    isFavorite: isRouteSaved,
    toggleFavorite,
    removeFavorite: removeFavoriteRoute,
    reorderFavorites: reorderFavoriteRoutes,
    moveFavorite: moveFavoriteRoute,
    updateCustomLabel: updateFavoriteLabel,
  } = useFavoriteRoutes();

  // Modals
  const [voiceModalOpen, setVoiceModalOpen] = useState<boolean>(false);
  const [ticketModalRoute, setTicketModalRoute] = useState<BusRoute | null>(null);
  const [alarmModalContext, setAlarmModalContext] = useState<{
    route: BusRoute;
    busIndex: number;
    defaultStopId?: string;
  } | null>(null);
  const [sosModalContext, setSosModalContext] = useState<{
    route: BusRoute;
    busIndex: number;
  } | null>(null);

  const { toasts, pushToast } = useToastQueue();
  const abortRef = useRef<AbortController | null>(null);
  const hydratedIdsRef = useRef<Set<string>>(new Set());

  const recordRecentSearch = useCallback(
    (item: Omit<RecentSearchItem, 'timestamp'>) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter(
          (x) =>
            x.id !== item.id &&
            x.name.toLowerCase() !== item.name.toLowerCase()
        );
        return [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, 8);
      });
    },
    []
  );

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  const city: CityPreset = useMemo(() => {
    if (cityPresetId === 'live_gps' && userGeo.lat !== null && userGeo.lon !== null) {
      return {
        ...CITY_PRESETS.live_gps,
        name: userGeo.cityLabel || 'My Live Area',
        localName: userGeo.addressLabel,
        center: [userGeo.lat, userGeo.lon],
      };
    }
    return CITY_PRESETS[cityPresetId];
  }, [cityPresetId, userGeo]);

  const effectiveTargetIso = useMemo(() => {
    if (departureTimeMode === 'now' || !customDepartureIso) return undefined;
    return customDepartureIso;
  }, [customDepartureIso, departureTimeMode]);

  /**
   * Silently hydrates intermediate GTFS stops for the top active routes so intermediate stop search
   * and directional recommendations are accurate before clicking!
   */
  const backgroundHydrateTopRoutes = useCallback((routeList: BusRoute[]) => {
    const candidates = routeList
      .filter(
        (r) =>
          !r.fullTripLoaded &&
          r.buses[0] &&
          !r.buses[0].tripId.startsWith('OSM::') &&
          !hydratedIdsRef.current.has(r.id)
      )
      .slice(0, 6);

    if (candidates.length === 0) return;

    candidates.forEach((r) => hydratedIdsRef.current.add(r.id));

    Promise.allSettled(
      candidates.map(async (r) => {
        const full = await fetchFullGtfsTripDetails(r, r.buses[0].tripId);
        if (full && full.stops.length >= 2) {
          setRoutes((prev) =>
            prev.map((curr) =>
              curr.id !== r.id
                ? curr
                : {
                    ...curr,
                    stops: full.stops,
                    polyline: full.polyline,
                    fullTripLoaded: true,
                    buses: curr.buses.map((b, bIdx) =>
                      bIdx === 0 ? { ...b, routeProgress: full.liveProgress } : b
                    ),
                  }
            )
          );
        }
      })
    ).catch(() => {});
  }, []);

  /**
   * Core Live Area Loader: Fetches ALL real GTFS + OSM bus stations around [lat, lon],
   * locks onto the nearest station (or custom anchor), fetches all live departing routes,
   * and loads the live moving fleet!
   */
  const loadTransitForCoordinates = useCallback(
    async (
      lat: number,
      lon: number,
      userRefLat?: number | null,
      userRefLon?: number | null,
      explicitAnchorStop?: RealTransitStop | null,
      targetIso?: string
    ) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoadingStops(true);
      setIsLoadingRoutes(true);
      setApiError(null);

      try {
        const [stopsList, fleetList] = await Promise.all([
          fetchAllStopsAroundLocation(
            lat,
            lon,
            userRefLat ?? lat,
            userRefLon ?? lon,
            0.065,
            controller.signal
          ),
          fetchLiveMovingFleetInBounds(lat, lon, 0.055, controller.signal).catch(() => []),
        ]);

        if (controller.signal.aborted) return;

        setAllAreaStops(stopsList);
        setLiveFleetVehicles(fleetList);
        setIsLoadingStops(false);

        const chosenStation =
          explicitAnchorStop ||
          stopsList.find((s) => s.source === 'GTFS' && s.modes.includes('BUS')) ||
          stopsList[0] ||
          null;
        setActiveStation(chosenStation);

        const liveRoutes = await fetchLiveRoutesForStops(
          stopsList,
          chosenStation,
          controller.signal,
          targetIso
        );

        if (controller.signal.aborted) return;
        hydratedIdsRef.current.clear();
        const featuredCityRoutes = buildFeaturedBusRoutes().filter(
          (f) => f.cityId === cityPresetId || haversineMeters(lat, lon, f.stops[0].lat, f.stops[0].lng) < 40_000
        );
        const mergedRoutes = [
          ...liveRoutes,
          ...featuredCityRoutes.filter(
            (f) =>
              !liveRoutes.some(
                (lr) => lr.routeNumber.toUpperCase() === f.routeNumber.toUpperCase()
              )
          ),
        ];
        setRoutes(mergedRoutes);
        setIsLoadingRoutes(false);
        setLastUpdatedTimestamp(new Date());

        backgroundHydrateTopRoutes(liveRoutes);
      } catch (err) {
        if (controller.signal.aborted) return;
        const fallbackFeatured = buildFeaturedBusRoutes().filter(
          (f) => haversineMeters(lat, lon, f.stops[0].lat, f.stops[0].lng) < 55_000
        );
        if (fallbackFeatured.length > 0) {
          setRoutes(fallbackFeatured);
        }
        setIsLoadingStops(false);
        setIsLoadingRoutes(false);
        setApiError(
          err instanceof Error
            ? err.message
            : 'Unable to reach live transit API. Showing cached corridors.'
        );
      }
    },
    [backgroundHydrateTopRoutes, cityPresetId]
  );

  const setDepartureSchedule = useCallback(
    (mode: DepartureTimeMode, iso: string | null) => {
      setDepartureTimeMode(mode);
      setCustomDepartureIso(iso);
      const effectiveIso = mode === 'now' || !iso ? undefined : iso;
      if (allAreaStops.length > 0) {
        setIsLoadingRoutes(true);
        fetchLiveRoutesForStops(allAreaStops, activeStation, undefined, effectiveIso)
          .then((updated) => {
            hydratedIdsRef.current.clear();
            setRoutes(updated);
            backgroundHydrateTopRoutes(updated);
          })
          .catch(() => {})
          .finally(() => setIsLoadingRoutes(false));
      }
    },
    [activeStation, allAreaStops, backgroundHydrateTopRoutes]
  );

  const applyQuickTimeOffset = useCallback(
    (minutesFromNow: number) => {
      if (minutesFromNow <= 0) {
        setDepartureSchedule('now', null);
        return;
      }
      const future = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
      setDepartureSchedule('depart_at', future);
    },
    [setDepartureSchedule]
  );

  /**
   * Browser Geolocation: Detects user's real live coordinates and finds their exact nearest bus station!
   */
  const detectUserLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setUserGeo((prev) => ({
        ...prev,
        status: 'unavailable',
        errorMessage: 'Browser Geolocation API is not supported on this device.',
      }));
      pushToast({
        title: 'Geolocation Unavailable',
        subtitle: 'Select a city or tap any point on the map instead.',
        tone: 'amber',
      });
      return;
    }

    setUserGeo((prev) => ({
      ...prev,
      status: 'locating',
      errorMessage: undefined,
    }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);

        const geoLabels = await reverseGeocodeLocation(lat, lon);
        setUserGeo({
          status: 'granted',
          lat,
          lon,
          accuracyMeters: acc,
          addressLabel: geoLabels.addressLabel,
          cityLabel: geoLabels.cityLabel,
          lastUpdated: Date.now(),
        });

        setCityPresetId('live_gps');
        setSearchCenter([lat, lon]);
        await loadTransitForCoordinates(lat, lon, lat, lon, null, effectiveTargetIso);

        pushToast({
          title: `Live GPS Locked (±${acc}m)`,
          subtitle: `Loaded nearest bus stations near ${geoLabels.addressLabel}`,
          tone: 'emerald',
        });
      },
      (err) => {
        setUserGeo((prev) => ({
          ...prev,
          status: 'denied',
          errorMessage:
            err.code === 1
              ? 'Location permission denied. Allow location access in browser address bar or tap map to set pin.'
              : 'Could not acquire GPS fix. Showing selected city hub.',
        }));
        pushToast({
          title: 'GPS Permission Needed for Nearest Stop',
          subtitle: 'Allow browser location or pick any station from the map',
          tone: 'amber',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [effectiveTargetIso, loadTransitForCoordinates, pushToast]);

  // Initial startup: Load default city immediately AND silently attempt browser geolocation!
  useEffect(() => {
    loadTransitForCoordinates(
      CITY_PRESETS.bengaluru.center[0],
      CITY_PRESETS.bengaluru.center[1]
    );

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const acc = Math.round(pos.coords.accuracy);
          const geoLabels = await reverseGeocodeLocation(lat, lon);
          setUserGeo({
            status: 'granted',
            lat,
            lon,
            accuracyMeters: acc,
            addressLabel: geoLabels.addressLabel,
            cityLabel: geoLabels.cityLabel,
            lastUpdated: Date.now(),
          });
          setCityPresetId('live_gps');
          setSearchCenter([lat, lon]);
          await loadTransitForCoordinates(lat, lon, lat, lon);
        },
        () => {
          setUserGeo((prev) => ({ ...prev, status: 'idle' }));
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live watchPosition to keep distance-to-nearest-stop & GPS proximity alarms accurate when moving
  useEffect(() => {
    if (userGeo.status !== 'granted' || !('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserGeo((prev) => ({
          ...prev,
          lat,
          lon,
          accuracyMeters: Math.round(pos.coords.accuracy),
          lastUpdated: Date.now(),
        }));
        setAllAreaStops((prev) =>
          prev
            .map((s) => ({
              ...s,
              distanceFromUserMeters: Math.round(haversineMeters(lat, lon, s.lat, s.lon)),
            }))
            .sort(
              (a, b) =>
                (a.distanceFromUserMeters ?? 999999) -
                (b.distanceFromUserMeters ?? 999999)
            )
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [userGeo.status]);

  const setManualLocationPin = useCallback(
    async (lat: number, lon: number, label?: string) => {
      const geoLabels = label
        ? { addressLabel: label, cityLabel: label.split(',')[0] }
        : await reverseGeocodeLocation(lat, lon);

      setUserGeo({
        status: 'manual',
        lat,
        lon,
        accuracyMeters: 15,
        addressLabel: geoLabels.addressLabel,
        cityLabel: geoLabels.cityLabel,
        lastUpdated: Date.now(),
      });
      setCityPresetId('live_gps');
      setSearchCenter([lat, lon]);
      await loadTransitForCoordinates(lat, lon, lat, lon, null, effectiveTargetIso);
      pushToast({
        title: `Pin Set: ${geoLabels.addressLabel}`,
        subtitle: 'Loaded nearest bus stations & live routes here',
        tone: 'emerald',
      });
    },
    [effectiveTargetIso, loadTransitForCoordinates, pushToast]
  );

  const selectCityPreset = useCallback(
    (id: CityPresetId) => {
      if (id === 'live_gps') {
        detectUserLocation();
        return;
      }
      const preset = CITY_PRESETS[id];
      setCityPresetId(id);
      setSearchCenter(preset.center);
      setSelectedRouteId(null);
      setOriginQuery('');
      setDestinationQuery('');
      setOriginCoords(null);
      setDestinationCoords(null);
      setRawPlannedJourneys([]);
      setPreviewJourneyId(null);
      loadTransitForCoordinates(
        preset.center[0],
        preset.center[1],
        userGeo.lat,
        userGeo.lon,
        null,
        effectiveTargetIso
      );
      pushToast({
        title: `Loading Live ${preset.name} (${preset.primaryOperator}) Feed`,
        subtitle: 'Fetching real bus stations, departures & fleet...',
        tone: 'indigo',
      });
    },
    [
      detectUserLocation,
      effectiveTargetIso,
      loadTransitForCoordinates,
      pushToast,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const selectActiveStation = useCallback(
    async (stop: RealTransitStop) => {
      setActiveStation(stop);
      setOriginQuery(stop.name);
      setOriginCoords({ lat: stop.lat, lon: stop.lon, label: stop.name });
      recordRecentSearch({
        id: stop.stopId,
        name: stop.name,
        subtitle: `${stop.agencyPrefix}${stop.stopCode ? ` #${stop.stopCode}` : ''}`,
        lat: stop.lat,
        lon: stop.lon,
        isTransitStop: true,
        stopId: stop.stopId,
        stopCode: stop.stopCode,
        category: stop.isHub ? 'terminal' : stop.source === 'GTFS' ? 'gtfs_stop' : 'osm_stop',
      });
      setIsLoadingRoutes(true);
      try {
        let stopsContext = allAreaStops;
        if (haversineMeters(searchCenter[0], searchCenter[1], stop.lat, stop.lon) > 3500) {
          setSearchCenter([stop.lat, stop.lon]);
          stopsContext = await fetchAllStopsAroundLocation(
            stop.lat,
            stop.lon,
            userGeo.lat ?? stop.lat,
            userGeo.lon ?? stop.lon
          );
          setAllAreaStops(stopsContext);
        }
        const updatedRoutes = await fetchLiveRoutesForStops(
          stopsContext,
          stop,
          undefined,
          effectiveTargetIso
        );
        hydratedIdsRef.current.clear();
        setRoutes(updatedRoutes);
        backgroundHydrateTopRoutes(updatedRoutes);
        pushToast({
          title: `Station Selected: ${stop.name}`,
          subtitle: `${updatedRoutes.length} live routes departing from/near here`,
          tone: 'emerald',
        });
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    [
      allAreaStops,
      backgroundHydrateTopRoutes,
      effectiveTargetIso,
      pushToast,
      recordRecentSearch,
      searchCenter,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const setStationAsOrigin = useCallback(
    (stop: RealTransitStop) => {
      selectActiveStation(stop);
      setSearchFilterQuery(stop.name);
      setActiveTab('search');
    },
    [selectActiveStation]
  );

  const setStationAsDestination = useCallback(
    (stop: RealTransitStop) => {
      // Auto-fill origin with activeStation / nearestStop if origin is currently blank!
      if (!originCoords) {
        const fallbackOrigin = activeStation || allAreaStops[0];
        if (fallbackOrigin && fallbackOrigin.stopId !== stop.stopId) {
          setOriginQuery(fallbackOrigin.name);
          setOriginCoords({
            lat: fallbackOrigin.lat,
            lon: fallbackOrigin.lon,
            label: fallbackOrigin.name,
          });
        } else if (userGeo.lat !== null && userGeo.lon !== null) {
          setOriginQuery(userGeo.addressLabel || 'My Location');
          setOriginCoords({
            lat: userGeo.lat,
            lon: userGeo.lon,
            label: userGeo.addressLabel || 'My Location',
          });
        }
      }
      setDestinationQuery(stop.name);
      setDestinationCoords({ lat: stop.lat, lon: stop.lon, label: stop.name });
      recordRecentSearch({
        id: stop.stopId,
        name: stop.name,
        subtitle: `${stop.agencyPrefix}${stop.stopCode ? ` #${stop.stopCode}` : ''}`,
        lat: stop.lat,
        lon: stop.lon,
        isTransitStop: true,
        stopId: stop.stopId,
        stopCode: stop.stopCode,
        category: stop.isHub ? 'terminal' : 'gtfs_stop',
      });
      setActiveTab('search');
      pushToast({
        title: `Planning Route to ${stop.name}`,
        subtitle: 'Computing best live bus & transfer options...',
        tone: 'indigo',
      });
    },
    [
      activeStation,
      allAreaStops,
      originCoords,
      pushToast,
      recordRecentSearch,
      userGeo.addressLabel,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const loadStopsInMapBounds = useCallback(
    async (centerLat: number, centerLon: number) => {
      setSearchCenter([centerLat, centerLon]);
      await loadTransitForCoordinates(
        centerLat,
        centerLon,
        userGeo.lat ?? centerLat,
        userGeo.lon ?? centerLon,
        null,
        effectiveTargetIso
      );
    },
    [effectiveTargetIso, loadTransitForCoordinates, userGeo.lat, userGeo.lon]
  );

  const refreshLiveTransitData = useCallback(() => {
    loadTransitForCoordinates(
      searchCenter[0],
      searchCenter[1],
      userGeo.lat,
      userGeo.lon,
      activeStation,
      effectiveTargetIso
    );
  }, [
    activeStation,
    effectiveTargetIso,
    loadTransitForCoordinates,
    searchCenter,
    userGeo.lat,
    userGeo.lon,
  ]);

  // Run Door-to-Door GTFS Journey Planner whenever both Origin & Destination coordinates (or departure time) change!
  useEffect(() => {
    if (!originCoords || !destinationCoords) {
      setRawPlannedJourneys([]);
      setPreviewJourneyId(null);
      return;
    }

    const controller = new AbortController();
    setIsPlanningJourney(true);

    planRealTransitJourney(
      originCoords.lat,
      originCoords.lon,
      destinationCoords.lat,
      destinationCoords.lon,
      {
        targetTimeIso: effectiveTargetIso,
        arriveBy: departureTimeMode === 'arrive_by',
        fromLabel: originCoords.label,
        toLabel: destinationCoords.label,
        nearbyStops: allAreaStops,
        signal: controller.signal,
      }
    )
      .then((plans) => {
        if (!controller.signal.aborted) {
          setRawPlannedJourneys(plans);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRawPlannedJourneys([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPlanningJourney(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    originCoords,
    destinationCoords,
    effectiveTargetIso,
    departureTimeMode,
    allAreaStops,
  ]);

  // Merge API journeys + verified direct loaded routes, then score & rank via `rankAndRecommendJourneys`!
  const plannedJourneys = useMemo(() => {
    if (!originCoords || !destinationCoords) return [];

    const refMs = effectiveTargetIso
      ? new Date(effectiveTargetIso).getTime()
      : Date.now();

    const directFromLoaded = synthesizeDirectJourneysFromLoadedRoutes(
      routes,
      originCoords.lat,
      originCoords.lon,
      originCoords.label,
      destinationCoords.lat,
      destinationCoords.lon,
      destinationCoords.label,
      refMs
    );

    const combined = [...rawPlannedJourneys, ...directFromLoaded];
    return rankAndRecommendJourneys(combined, refMs, recommendationPreference);
  }, [
    destinationCoords,
    effectiveTargetIso,
    originCoords,
    rawPlannedJourneys,
    recommendationPreference,
    routes,
  ]);

  const previewJourney = useMemo(
    () => plannedJourneys.find((p) => p.id === previewJourneyId) || null,
    [plannedJourneys, previewJourneyId]
  );

  const applyOriginSuggestion = useCallback(
    (s: SearchPlaceSuggestion & { category?: SuggestionCategory; stopCode?: string }) => {
      setOriginQuery(s.name);
      setOriginCoords({ lat: s.lat, lon: s.lon, label: s.name });
      recordRecentSearch({
        id: s.id,
        name: s.name,
        subtitle: s.subtitle,
        lat: s.lat,
        lon: s.lon,
        isTransitStop: s.isTransitStop,
        stopId: s.stopId,
        stopCode: s.stopCode,
        category: s.category || (s.isTransitStop ? 'gtfs_stop' : 'landmark'),
      });
      if (haversineMeters(searchCenter[0], searchCenter[1], s.lat, s.lon) > 2500) {
        setSearchCenter([s.lat, s.lon]);
        loadTransitForCoordinates(
          s.lat,
          s.lon,
          userGeo.lat,
          userGeo.lon,
          null,
          effectiveTargetIso
        );
      }
    },
    [
      effectiveTargetIso,
      loadTransitForCoordinates,
      recordRecentSearch,
      searchCenter,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const applyDestinationSuggestion = useCallback(
    (s: SearchPlaceSuggestion & { category?: SuggestionCategory; stopCode?: string }) => {
      // If Origin wasn't explicitly set yet, automatically anchor Origin to activeStation / userGPS so door-to-door planner activates immediately!
      if (!originCoords) {
        const autoOrigin = activeStation || allAreaStops[0];
        if (autoOrigin && haversineMeters(autoOrigin.lat, autoOrigin.lon, s.lat, s.lon) > 250) {
          setOriginQuery(autoOrigin.name);
          setOriginCoords({
            lat: autoOrigin.lat,
            lon: autoOrigin.lon,
            label: autoOrigin.name,
          });
        } else if (userGeo.lat !== null && userGeo.lon !== null) {
          setOriginQuery(userGeo.addressLabel || 'My Location');
          setOriginCoords({
            lat: userGeo.lat,
            lon: userGeo.lon,
            label: userGeo.addressLabel || 'My Location',
          });
        }
      }

      setDestinationQuery(s.name);
      setDestinationCoords({ lat: s.lat, lon: s.lon, label: s.name });
      recordRecentSearch({
        id: s.id,
        name: s.name,
        subtitle: s.subtitle,
        lat: s.lat,
        lon: s.lon,
        isTransitStop: s.isTransitStop,
        stopId: s.stopId,
        stopCode: s.stopCode,
        category: s.category || (s.isTransitStop ? 'gtfs_stop' : 'landmark'),
      });
    },
    [
      activeStation,
      allAreaStops,
      originCoords,
      recordRecentSearch,
      userGeo.addressLabel,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const swapOriginDestination = useCallback(() => {
    setOriginQuery(destinationQuery);
    setDestinationQuery(originQuery);
    setOriginCoords(destinationCoords);
    setDestinationCoords(originCoords);
    setPreviewJourneyId(null);
  }, [destinationCoords, destinationQuery, originCoords, originQuery]);

  const clearSearch = useCallback(() => {
    setOriginQuery('');
    setDestinationQuery('');
    setOriginCoords(null);
    setDestinationCoords(null);
    setRawPlannedJourneys([]);
    setPreviewJourneyId(null);
    setActiveQuickFilters((prev) => prev.filter((f) => f !== 'nearest_hub'));
  }, []);

  const nearestStop = useMemo(() => allAreaStops[0] || null, [allAreaStops]);

  const toggleQuickFilter = useCallback(
    (filterId: QuickFilterId) => {
      if (filterId === 'nearest_hub') {
        if (nearestStop) {
          selectActiveStation(nearestStop);
        } else {
          detectUserLocation();
        }
        return;
      }
      setActiveQuickFilters((prev) =>
        prev.includes(filterId) ? prev.filter((f) => f !== filterId) : [...prev, filterId]
      );
    },
    [detectUserLocation, nearestStop, selectActiveStation]
  );

  // Real-time 3-second GPS interpolation & accurate GTFS schedule clock sync
  useEffect(() => {
    if (isSimPaused) return;

    const timer = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();
      const refMs = effectiveTargetIso
        ? new Date(effectiveTargetIso).getTime()
        : nowMs;
      setLastUpdatedTimestamp(now);

      setLiveFleetVehicles((prevFleet) =>
        prevFleet.map((v) => {
          const depMs = new Date(v.departureIso).getTime();
          const arrMs = new Date(v.arrivalIso).getTime();
          const span = Math.max(15_000, arrMs - depMs);
          const frac = Math.max(0, Math.min(1, (nowMs - depMs) / span));
          if (v.polyline.length >= 2) {
            const exact = frac * (v.polyline.length - 1);
            const i0 = Math.floor(exact);
            const i1 = Math.min(v.polyline.length - 1, i0 + 1);
            const sub = exact - i0;
            return {
              ...v,
              lat: v.polyline[i0][0] + (v.polyline[i1][0] - v.polyline[i0][0]) * sub,
              lon: v.polyline[i0][1] + (v.polyline[i1][1] - v.polyline[i0][1]) * sub,
            };
          }
          return v;
        })
      );

      setRoutes((prevRoutes) =>
        prevRoutes.map((route) => {
          const maxStopIdx = Math.max(1, route.stops.length - 1);
          const updatedBuses = route.buses
            .filter((bus, idx) => {
              // Automatically retire departed buses >75s past when later departures exist on the card
              if (departureTimeMode !== 'now') return true;
              const arrMs = new Date(bus.arrivalIso).getTime();
              if (Number.isNaN(arrMs)) return true;
              if (arrMs < nowMs - 75_000 && route.buses.length > 1 && idx === 0) {
                return false;
              }
              return true;
            })
            .map((bus) => {
              const schedProg = route.fullTripLoaded
                ? computeLiveProgressFromSchedule(route.stops, nowMs)
                : null;

              let nextProg = bus.routeProgress + 0.04;
              if (
                schedProg !== null &&
                schedProg > 0.06 &&
                schedProg < maxStopIdx - 0.05
              ) {
                nextProg = schedProg;
              } else if (nextProg >= maxStopIdx - 0.05) {
                nextProg = 0.08;
              }

              const arrMs = new Date(bus.arrivalIso).getTime();
              const liveEta = Number.isNaN(arrMs)
                ? bus.etaMinutes
                : Math.max(0, Math.round((arrMs - refMs) / 60_000));

              return {
                ...bus,
                routeProgress: Number(nextProg.toFixed(3)),
                etaMinutes: liveEta,
              };
            });

          return { ...route, buses: updatedBuses };
        })
      );
    }, 3000);

    return () => clearInterval(timer);
  }, [departureTimeMode, effectiveTargetIso, isSimPaused]);

  // Refresh live fleet from Transitous every 45 seconds
  useEffect(() => {
    if (isSimPaused) return;
    const fleetRefresh = setInterval(() => {
      fetchLiveMovingFleetInBounds(searchCenter[0], searchCenter[1], 0.055)
        .then((list) => {
          if (list.length > 0) setLiveFleetVehicles(list);
        })
        .catch(() => {});
    }, 45_000);
    return () => clearInterval(fleetRefresh);
  }, [isSimPaused, searchCenter]);

  // Check GPS Proximity Alarms against BOTH real user device GPS AND tracked bus telemetry!
  useEffect(() => {
    alarms.forEach((alarm) => {
      if (!alarm.active || alarm.triggered) return;

      if (userGeo.lat !== null && userGeo.lon !== null && userGeo.status === 'granted') {
        const userDistM = haversineMeters(
          userGeo.lat,
          userGeo.lon,
          alarm.stopLat,
          alarm.stopLon
        );
        if (userDistM <= alarm.radiusMeters) {
          setAlarms((prev) =>
            prev.map((a) => (a.id === alarm.id ? { ...a, triggered: true, active: false } : a))
          );
          setRingingAlarm(alarm);
          playAlarmChime();
          return;
        }
      }

      const route = routes.find((r) => r.id === alarm.routeId);
      if (!route) return;
      const bus = route.buses.find((b) => b.tripId === alarm.tripId) || route.buses[0];
      if (!bus) return;
      const tel = getBusTelemetry(route.stops, bus.routeProgress);
      const busDistM = haversineMeters(tel.lat, tel.lng, alarm.stopLat, alarm.stopLon);

      if (busDistM <= alarm.radiusMeters) {
        setAlarms((prev) =>
          prev.map((a) => (a.id === alarm.id ? { ...a, triggered: true, active: false } : a))
        );
        setRingingAlarm(alarm);
        playAlarmChime();
      }
    });
  }, [alarms, routes, userGeo.lat, userGeo.lon, userGeo.status]);

  // Smart Scored, Direction-Verified & Sorted Station Routes!
  const filteredRoutes = useMemo(() => {
    const refLat = userGeo.lat ?? activeStation?.lat ?? city.center[0];
    const refLon = userGeo.lon ?? activeStation?.lon ?? city.center[1];

    return scoreAndSortBusRoutes({
      routes,
      originQuery,
      originCoords,
      destinationQuery,
      destinationCoords,
      hasPlannedJourneys: plannedJourneys.length > 0,
      activeQuickFilters,
      sortBy: routeSortBy,
      refLat,
      refLon,
    });
  }, [
    activeQuickFilters,
    activeStation?.lat,
    activeStation?.lon,
    city.center,
    destinationCoords,
    destinationQuery,
    originCoords,
    originQuery,
    plannedJourneys.length,
    routeSortBy,
    routes,
    userGeo.lat,
    userGeo.lon,
  ]);

  const openLiveTracking = useCallback(
    async (routeId: string, busIndex = 0, showMap = false) => {
      setSelectedRouteId(routeId);
      setSelectedBusIndex(busIndex);
      setLiveMapRequested(showMap);

      const featuredFallback = buildFeaturedBusRoutes().find((r) => r.id === routeId);
      const targetRoute =
        routes.find((r) => r.id === routeId) ||
        savedRoutes.find((r) => r.id === routeId) ||
        featuredFallback;
      if (!targetRoute) return;
      void cacheViewedRoute(targetRoute);

      if (!routes.some((r) => r.id === routeId)) {
        setRoutes((prev) => [targetRoute, ...prev]);
      }

      if (targetRoute.fullTripLoaded && targetRoute.id.startsWith('WIMB::')) {
        return;
      }

      const targetBus = targetRoute.buses[busIndex] || targetRoute.buses[0];
      if (!targetBus) return;

      setIsLoadingTripDetail(true);
      try {
        const full = await fetchFullGtfsTripDetails(targetRoute, targetBus.tripId);
        if (full && full.stops.length >= 2) {
          setRoutes((prev) =>
            prev.map((r) =>
              r.id !== routeId
                ? r
                : {
                    ...r,
                    stops: full.stops,
                    polyline: full.polyline,
                    fullTripLoaded: true,
                    buses: r.buses.map((b, idx) =>
                      idx === busIndex
                        ? { ...b, routeProgress: full.liveProgress }
                        : b
                    ),
                  }
            )
          );
        }
      } catch {
      } finally {
        setIsLoadingTripDetail(false);
      }
    },
    [routes, savedRoutes]
  );

  const trackBusRoute = useCallback(
    (route: BusRoute, busIndex = 0, showMap = false) => {
      setRoutes((prev) => {
        const exists = prev.some((r) => r.id === route.id);
        return exists
          ? prev.map((r) => (r.id === route.id ? route : r))
          : [route, ...prev];
      });
      setSelectedRouteId(route.id);
      setSelectedBusIndex(busIndex);
      setLiveMapRequested(showMap);

      if (!route.fullTripLoaded && !route.id.startsWith('WIMB::') && route.buses[busIndex]) {
        setIsLoadingTripDetail(true);
        fetchFullGtfsTripDetails(route, route.buses[busIndex].tripId)
          .then((full) => {
            if (full && full.stops.length >= 2) {
              setRoutes((prev) =>
                prev.map((r) =>
                  r.id !== route.id
                    ? r
                    : {
                        ...r,
                        stops: full.stops,
                        polyline: full.polyline,
                        fullTripLoaded: true,
                        buses: r.buses.map((b, idx) =>
                          idx === busIndex ? { ...b, routeProgress: full.liveProgress } : b
                        ),
                      }
                )
              );
            }
          })
          .catch(() => {})
          .finally(() => setIsLoadingTripDetail(false));
      }
    },
    []
  );

  const openLiveVehicleFromMap = useCallback(
    async (vehicle: LiveMapVehicle) => {
      const existing = routes.find((r) =>
        r.buses.some((b) => b.tripId === vehicle.tripId)
      );
      if (existing) {
        const idx = existing.buses.findIndex((b) => b.tripId === vehicle.tripId);
        await openLiveTracking(existing.id, Math.max(0, idx));
        return;
      }

      const tempId = `LIVE::${vehicle.tripId}`;
      const operator = vehicle.tripId.includes('BMTC')
        ? 'BMTC'
        : vehicle.tripId.includes('TGSRTC')
        ? 'TGSRTC'
        : vehicle.tripId.includes('KSRTC')
        ? 'KSRTC'
        : 'GTFS Live';

      const newRoute: BusRoute = {
        id: tempId,
        routeNumber: vehicle.routeShortName,
        operator,
        serviceType: vehicle.routeShortName.startsWith('KIA') ? 'Airport AC' : 'City Transit',
        isElectric: false,
        isAC: vehicle.routeShortName.startsWith('KIA') || vehicle.routeShortName.startsWith('V-'),
        womenFreeEligible: !vehicle.routeShortName.startsWith('KIA'),
        womenSchemeName: 'Official GTFS Active Trip',
        name: `${vehicle.fromName} → ${vehicle.toName}`,
        headsign: vehicle.toName,
        origin: vehicle.fromName,
        destination: vehicle.toName,
        boardingStopName: vehicle.fromName,
        boardingStopId: vehicle.tripId,
        baseFareInr: 10,
        maxFareInr: 35,
        dataSourceLabel: `Official GTFS Live Fleet (${operator})`,
        polyline: vehicle.polyline,
        stops: [
          {
            id: `${tempId}-0`,
            name: vehicle.fromName,
            landmark: 'Current Segment Start',
            lat: vehicle.polyline[0]?.[0] ?? vehicle.lat,
            lng: vehicle.polyline[0]?.[1] ?? vehicle.lon,
            distanceFromStartKm: 0,
            scheduledOffsetMin: 0,
            platform: 'Stop',
          },
          {
            id: `${tempId}-1`,
            name: vehicle.toName,
            landmark: 'Next Segment Stop',
            lat: vehicle.polyline[vehicle.polyline.length - 1]?.[0] ?? vehicle.lat,
            lng: vehicle.polyline[vehicle.polyline.length - 1]?.[1] ?? vehicle.lon,
            distanceFromStartKm: 2.5,
            scheduledOffsetMin: 7,
            platform: 'Stop',
          },
        ],
        fullTripLoaded: false,
        buses: [
          {
            id: vehicle.tripId,
            tripId: vehicle.tripId,
            regNumber: `${operator}-LIVE`,
            etaMinutes: Math.max(
              1,
              Math.round((new Date(vehicle.arrivalIso).getTime() - Date.now()) / 60_000)
            ),
            arrivalIso: vehicle.arrivalIso,
            scheduledArrivalIso: vehicle.arrivalIso,
            delayMinutes: 0,
            isRealTimeFeed: vehicle.realTime,
            crowdPercent: 42,
            crowdLevel: 'medium',
            speedKmh: 28,
            routeProgress: 0.45,
            crowdsourcedCount: 9,
          },
        ],
      };

      setRoutes((prev) => [newRoute, ...prev]);
      setSelectedRouteId(tempId);
      setSelectedBusIndex(0);
      setIsLoadingTripDetail(true);
      try {
        const full = await fetchFullGtfsTripDetails(newRoute, vehicle.tripId);
        if (full && full.stops.length >= 2) {
          setRoutes((prev) =>
            prev.map((r) =>
              r.id !== tempId
                ? r
                : {
                    ...r,
                    origin: full.stops[0].name,
                    destination: full.stops[full.stops.length - 1].name,
                    name: `${full.stops[0].name} → ${full.stops[full.stops.length - 1].name}`,
                    stops: full.stops,
                    polyline: full.polyline,
                    fullTripLoaded: true,
                    buses: r.buses.map((b) => ({
                      ...b,
                      routeProgress: full.liveProgress,
                    })),
                  }
            )
          );
        }
      } finally {
        setIsLoadingTripDetail(false);
      }
    },
    [openLiveTracking, routes]
  );

  const openPlannedLegTracking = useCallback(
    async (tripId: string, routeShortName = 'BUS', agencyName = 'RTC') => {
      await openLiveVehicleFromMap({
        id: tripId,
        tripId,
        routeShortName,
        mode: 'BUS',
        fromName: originQuery || 'Origin',
        toName: destinationQuery || 'Destination',
        departureIso: new Date().toISOString(),
        arrivalIso: new Date(Date.now() + 20 * 60_000).toISOString(),
        realTime: false,
        polyline: [],
        lat: searchCenter[0],
        lon: searchCenter[1],
        bearingDeg: 0,
      });
      pushToast({
        title: `Tracking ${agencyName} ${routeShortName}`,
        subtitle: 'Loaded full stop-by-stop GTFS schedule',
        tone: 'emerald',
      });
    },
    [destinationQuery, openLiveVehicleFromMap, originQuery, pushToast, searchCenter]
  );

  const closeLiveTracking = useCallback(() => {
    setSelectedRouteId(null);
    setLiveMapRequested(false);
  }, []);

  const toggleOnBoardBus = useCallback(
    (routeId: string, busId: string) => {
      const alreadyOn = onBoardBusIds.includes(busId);
      if (alreadyOn) {
        setOnBoardBusIds((prev) => prev.filter((id) => id !== busId));
        pushToast({
          title: 'Stopped Sharing Live GPS',
          subtitle: 'Thank you for helping fellow commuters!',
          tone: 'indigo',
        });
      } else {
        setOnBoardBusIds((prev) => [...prev, busId]);
        setKarmaPoints((p) => p + 15);
        setRoutes((prev) =>
          prev.map((r) =>
            r.id !== routeId
              ? r
              : {
                  ...r,
                  buses: r.buses.map((b) =>
                    b.id === busId
                      ? { ...b, crowdsourcedCount: b.crowdsourcedCount + 1 }
                      : b
                  ),
                }
          )
        );
        pushToast({
          title: '+15 Commuter Karma Points!',
          subtitle: 'Live passenger GPS active for this trip',
          tone: 'emerald',
        });
      }
    },
    [onBoardBusIds, pushToast]
  );

  const submitCrowdVote = useCallback(
    (routeId: string, busId: string, level: CrowdLevel) => {
      const alreadyVoted = votedBusCrowd[busId];
      setVotedBusCrowd((prev) => ({ ...prev, [busId]: level }));
      const newPercent = level === 'low' ? 32 : level === 'medium' ? 68 : 96;

      setRoutes((prev) =>
        prev.map((r) =>
          r.id !== routeId
            ? r
            : {
                ...r,
                buses: r.buses.map((b) =>
                  b.id === busId
                    ? {
                        ...b,
                        crowdLevel: level,
                        crowdPercent: newPercent,
                        crowdsourcedCount: alreadyVoted
                          ? b.crowdsourcedCount
                          : b.crowdsourcedCount + 1,
                      }
                    : b
                ),
              }
        )
      );

      if (!alreadyVoted) {
        setKarmaPoints((p) => p + 10);
        pushToast({
          title: '+10 Karma • Live Crowd Updated!',
          subtitle: 'Fellow commuters can now see your occupancy report',
          tone: 'emerald',
        });
      }
    },
    [pushToast, votedBusCrowd]
  );

  const addOrUpdateAlarm = useCallback(
    ({
      routeId,
      tripId,
      stopId,
      radiusMeters,
    }: {
      routeId: string;
      tripId: string;
      stopId: string;
      radiusMeters: 500 | 1000 | 2000;
    }) => {
      const route = routes.find((r) => r.id === routeId);
      if (!route) return;
      const stop = route.stops.find((s) => s.id === stopId);
      if (!stop) return;

      const newAlarm: ProximityAlarm = {
        id: `alm-${Date.now()}`,
        routeId: route.id,
        routeNumber: route.routeNumber,
        operator: route.operator,
        tripId,
        stopId: stop.id,
        stopName: stop.name,
        stopLat: stop.lat,
        stopLon: stop.lng,
        radiusMeters,
        active: true,
        triggered: false,
        createdAt: new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setAlarms((prev) => [
        newAlarm,
        ...prev.filter((a) => !(a.routeId === routeId && a.stopId === stopId)),
      ]);
      pushToast({
        title: `GPS Alarm Set: ${stop.name}`,
        subtitle: `Triggers ${
          radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters}m`
        } before arrival`,
        tone: 'emerald',
      });
    },
    [pushToast, routes]
  );

  const toggleAlarmActive = useCallback((alarmId: string) => {
    setAlarms((prev) =>
      prev.map((a) =>
        a.id === alarmId ? { ...a, active: !a.active, triggered: false } : a
      )
    );
  }, []);

  const removeAlarm = useCallback((alarmId: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== alarmId));
  }, []);

  const simulateAlarmRingNow = useCallback(
    (alarmId: string) => {
      const target = alarms.find((a) => a.id === alarmId);
      if (!target) return;
      setRingingAlarm(target);
      playAlarmChime();
    },
    [alarms]
  );

  const dismissRingingAlarm = useCallback(() => {
    setRingingAlarm(null);
  }, []);

  const purchaseUpiTicket = useCallback(
    ({
      route,
      originStop,
      destinationStop,
      adultCount,
      womenFreeCount,
      totalFareInr,
      upiApp,
    }: {
      route: BusRoute;
      originStop: string;
      destinationStop: string;
      adultCount: number;
      womenFreeCount: number;
      totalFareInr: number;
      upiApp: 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM UPI';
    }): UpiTicketPass => {
      const now = Date.now();
      const rand4 = Math.floor(1000 + Math.random() * 9000);
      const utr = `${Math.floor(100000000000 + Math.random() * 899999999999)}`;
      const pass: UpiTicketPass = {
        id: `TKT-${route.operator}-${rand4}`,
        operator: route.operator,
        routeNumber: route.routeNumber,
        serviceType: route.serviceType,
        originStop,
        destinationStop,
        adultCount,
        womenFreeCount,
        totalFareInr,
        upiApp,
        utrNumber: utr,
        issuedAt: now,
        expiresAt: now + 120 * 60_000,
        qrSeed: `WIMB-${route.operator}-${route.routeNumber}-${rand4}-${utr}`,
      };
      setTickets((prev) => [pass, ...prev]);
      void saveActiveTicket(pass);
      setKarmaPoints((p) => p + 5);
      pushToast({
        title: `QR Express Ticket Issued (${pass.id})`,
        subtitle: `Paid ₹${totalFareInr} via ${upiApp}`,
        tone: 'emerald',
      });
      return pass;
    },
    [pushToast]
  );

  const toggleSavedRoute = useCallback(
    (route: BusRoute, customLabel?: string) => {
      const added = toggleFavorite(route, customLabel);
      pushToast({
        title: added ? `Saved Bus ${route.routeNumber}` : `Removed Bus ${route.routeNumber}`,
        subtitle: added
          ? `${route.origin} → ${route.destination}`
          : 'Removed from Saved Favorite Routes',
        tone: added ? 'emerald' : 'indigo',
      });
    },
    [pushToast, toggleFavorite]
  );

  const openTicketModal = useCallback((route: BusRoute) => {
    setTicketModalRoute(route);
    if (!route.fullTripLoaded && route.buses[0]) {
      fetchFullGtfsTripDetails(route, route.buses[0].tripId)
        .then((full) => {
          if (full && full.stops.length >= 2) {
            const hydrated = {
              ...route,
              stops: full.stops,
              polyline: full.polyline,
              fullTripLoaded: true,
            };
            setTicketModalRoute((curr) => (curr?.id === route.id ? hydrated : curr));
            setRoutes((prev) => prev.map((r) => (r.id === route.id ? hydrated : r)));
          }
        })
        .catch(() => {});
    }
  }, []);

  const closeTicketModal = useCallback(() => setTicketModalRoute(null), []);

  const openAlarmModal = useCallback(
    (route: BusRoute, busIndex = 0, defaultStopId?: string) => {
      setAlarmModalContext({ route, busIndex, defaultStopId });
      if (!route.fullTripLoaded && route.buses[busIndex]) {
        fetchFullGtfsTripDetails(route, route.buses[busIndex].tripId)
          .then((full) => {
            if (full && full.stops.length >= 2) {
              const hydrated = {
                ...route,
                stops: full.stops,
                polyline: full.polyline,
                fullTripLoaded: true,
              };
              setAlarmModalContext((curr) =>
                curr?.route.id === route.id ? { ...curr, route: hydrated } : curr
              );
              setRoutes((prev) => prev.map((r) => (r.id === route.id ? hydrated : r)));
            }
          })
          .catch(() => {});
      }
    },
    []
  );

  const closeAlarmModal = useCallback(() => setAlarmModalContext(null), []);

  const openSosModal = useCallback((route: BusRoute, busIndex = 0) => {
    setSosModalContext({ route, busIndex });
  }, []);

  const closeSosModal = useCallback(() => setSosModalContext(null), []);

  const value: TransitContextValue = {
    cityPresetId,
    city,
    selectCityPreset,
    userGeo,
    detectUserLocation,
    setManualLocationPin,
    allAreaStops,
    nearestStop,
    activeStation,
    selectActiveStation,
    setStationAsOrigin,
    setStationAsDestination,
    loadStopsInMapBounds,
    isLoadingStops,
    isLoadingRoutes,
    isLoadingTripDetail,
    apiError,
    refreshLiveTransitData,
    activeTab,
    setActiveTab,
    searchFilterQuery,
    setSearchFilterQuery,
    originQuery,
    setOriginQuery,
    destinationQuery,
    setDestinationQuery,
    originCoords,
    setOriginCoords,
    destinationCoords,
    setDestinationCoords,
    applyOriginSuggestion,
    applyDestinationSuggestion,
    swapOriginDestination,
    clearSearch,
    recentSearches,
    recordRecentSearch,
    clearRecentSearches,
    departureTimeMode,
    customDepartureIso,
    setDepartureSchedule,
    applyQuickTimeOffset,
    recommendationPreference,
    setRecommendationPreference,
    routeSortBy,
    setRouteSortBy,
    plannedJourneys,
    isPlanningJourney,
    previewJourneyId,
    setPreviewJourneyId,
    previewJourney,
    openPlannedLegTracking,
    activeQuickFilters,
    toggleQuickFilter,
    routes,
    filteredRoutes,
    liveFleetVehicles,
    selectedRouteId,
    selectedBusIndex,
    liveMapRequested,
    setLiveMapRequested,
    openLiveTracking,
    trackBusRoute,
    openLiveVehicleFromMap,
    closeLiveTracking,
    setSelectedBusIndex,
    lowDataMode,
    setLowDataMode,
    lastUpdatedTimestamp,
    isSimPaused,
    setIsSimPaused,
    karmaPoints,
    onBoardBusIds,
    votedBusCrowd,
    toggleOnBoardBus,
    submitCrowdVote,
    alarms,
    ringingAlarm,
    dismissRingingAlarm,
    addOrUpdateAlarm,
    toggleAlarmActive,
    removeAlarm,
    simulateAlarmRingNow,
    tickets,
    purchaseUpiTicket,
    favoriteRoutes,
    savedRoutes,
    isRouteSaved,
    toggleSavedRoute,
    removeFavoriteRoute,
    reorderFavoriteRoutes,
    moveFavoriteRoute,
    updateFavoriteLabel,
    voiceModalOpen,
    setVoiceModalOpen,
    ticketModalRoute,
    openTicketModal,
    closeTicketModal,
    alarmModalContext,
    openAlarmModal,
    closeAlarmModal,
    sosModalContext,
    openSosModal,
    closeSosModal,
    toasts,
    pushToast,
  };

  return <TransitContext.Provider value={value}>{children}</TransitContext.Provider>;
};

export function useTransit() {
  const ctx = useContext(TransitContext);
  if (!ctx) {
    throw new Error('useTransit must be used within a TransitProvider');
  }
  return ctx;
}
