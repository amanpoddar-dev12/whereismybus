export type CityPresetId =
  | 'live_gps'
  | 'bengaluru'
  | 'hyderabad'
  | 'chennai'
  | 'kochi'
  | 'mysuru'
  | 'vijayawada'
  | 'delhi'
  | 'mumbai';

export type CrowdLevel = 'low' | 'medium' | 'high';

export type ActiveTab = 'home' | 'search' | 'saved' | 'tickets';

export type QuickFilterId = 'nearest_hub' | 'women_free' | 'ac_electric' | 'low_crowd';

export type VoiceLangCode = 'en' | 'hi' | 'kn' | 'te';

export type RecommendationPreference =
  | 'smart_best'
  | 'fastest'
  | 'direct_only'
  | 'lowest_fare'
  | 'least_walk';

export type RouteSortBy = 'recommended' | 'soonest' | 'lowest_fare' | 'least_crowd';

export type DepartureTimeMode = 'now' | 'depart_at' | 'arrive_by';

export interface CityPreset {
  id: CityPresetId;
  name: string;
  localName: string;
  stateName: string;
  primaryOperator: string;
  center: [number, number];
  defaultZoom: number;
  womenSchemeTitle: string;
  womenFreeDefault: boolean;
  emergencyHelpline: string;
  rtcHelpline: string;
}

export interface RealTransitStop {
  stopId: string;
  name: string;
  stopCode?: string;
  description?: string;
  lat: number;
  lon: number;
  modes: string[];
  agencyPrefix: string;
  source: 'GTFS' | 'OSM';
  distanceFromUserMeters?: number;
  isHub?: boolean;
}

export interface RouteStop {
  id: string;
  name: string;
  stopCode?: string;
  landmark: string;
  lat: number;
  lng: number;
  distanceFromStartKm: number;
  scheduledArrivalIso?: string;
  scheduledDepartureIso?: string;
  liveArrivalIso?: string;
  liveDepartureIso?: string;
  scheduledOffsetMin: number;
  platform: string;
}

export interface UpcomingBusInstance {
  id: string; // real GTFS tripId or corridor trip id
  tripId: string;
  regNumber: string; // vehicle fleet ID or GTFS tripShortName
  etaMinutes: number;
  arrivalIso: string;
  scheduledArrivalIso: string;
  delayMinutes: number;
  isRealTimeFeed: boolean;
  isTomorrow?: boolean;
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  speedKmh: number;
  routeProgress: number;
  crowdsourcedCount: number;
}

export interface BusRoute {
  id: string; // route key (routeId or routeShortName + direction)
  routeNumber: string;
  operator: string;
  agencyUrl?: string;
  serviceType: string;
  isElectric: boolean;
  isAC: boolean;
  womenFreeEligible: boolean;
  womenSchemeName: string;
  name: string;
  headsign: string;
  origin: string;
  destination: string;
  boardingStopName: string;
  boardingStopId: string;
  boardingStopLat?: number;
  boardingStopLon?: number;
  walkingMetersToBoarding?: number;
  walkingMinutesToBoarding?: number;
  headwayMinutes?: number;
  recommendationScore?: number;
  recommendationBadge?: string;
  matchedDestStopName?: string;
  travelTimeToDestMin?: number;
  isCatchable?: boolean;
  baseFareInr: number;
  maxFareInr: number;
  dataSourceLabel: string; // e.g. "Official GTFS (BMTC)" or "OSM + OSRM Street Network"
  polyline?: [number, number][];
  stops: RouteStop[];
  fullTripLoaded?: boolean;
  buses: UpcomingBusInstance[]; // 1 to 3+ upcoming real departures
}

export interface LiveMapVehicle {
  id: string;
  tripId: string;
  routeShortName: string;
  mode: string;
  fromName: string;
  fromLat?: number;
  fromLon?: number;
  toName: string;
  toLat?: number;
  toLon?: number;
  departureIso: string;
  arrivalIso: string;
  realTime: boolean;
  polyline: [number, number][];
  lat: number;
  lon: number;
  bearingDeg: number;
}

export interface PlannedJourneyLeg {
  mode: string;
  routeShortName?: string;
  agencyName?: string;
  operator?: string;
  serviceType?: string;
  isAC?: boolean;
  isElectric?: boolean;
  womenFreeEligible?: boolean;
  fareInr?: number;
  headsign?: string;
  tripId?: string;
  realTime?: boolean;
  delayMinutes?: number;
  fromName: string;
  fromStopCode?: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toStopCode?: string;
  toLat: number;
  toLon: number;
  startTimeIso: string;
  endTimeIso: string;
  scheduledStartTimeIso?: string;
  scheduledEndTimeIso?: string;
  durationSec: number;
  distanceMeters: number;
  stopCount: number;
  intermediateStopNames?: string[];
  polyline: [number, number][];
}

export type ScheduleTimeBand =
  | 'nearest'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night';

export interface PlannedJourney {
  id: string;
  durationSec: number;
  startTimeIso: string;
  endTimeIso: string;
  transfers: number;
  estimatedFareInr: number;
  womenFreeFareInr: number;
  waitMinutesBeforeStart: number;
  totalDoorToDoorMinutes: number;
  transitDurationSec: number;
  walkingDurationSec: number;
  totalWalkingMeters: number;
  transferWaitSeconds: number;
  hasRealTime: boolean;
  isNextMorning?: boolean;
  isTomorrowDeparture?: boolean;
  scheduleBand?: ScheduleTimeBand;
  scheduleBandLabel?: string;
  isApproximateCorridor?: boolean;
  recommendationScore: number;
  badges: string[];
  summaryLabel: string;
  legs: PlannedJourneyLeg[];
}

export type SuggestionCategory =
  | 'gtfs_stop'
  | 'terminal'
  | 'osm_stop'
  | 'route'
  | 'landmark'
  | 'recent'
  | 'gps';

export interface RecentSearchItem {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  isTransitStop: boolean;
  stopId?: string;
  stopCode?: string;
  category: SuggestionCategory;
  timestamp: number;
}

export interface ProximityAlarm {
  id: string;
  routeId: string;
  routeNumber: string;
  operator: string;
  tripId: string;
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLon: number;
  radiusMeters: 500 | 1000 | 2000;
  active: boolean;
  triggered: boolean;
  createdAt: string;
}

export interface UpiTicketPass {
  id: string;
  operator: string;
  routeNumber: string;
  serviceType: string;
  originStop: string;
  destinationStop: string;
  adultCount: number;
  womenFreeCount: number;
  totalFareInr: number;
  upiApp: 'GPay' | 'PhonePe' | 'Paytm' | 'BHIM UPI';
  utrNumber: string;
  issuedAt: number;
  expiresAt: number;
  qrSeed: string;
}

export interface UserGeoState {
  status: 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable' | 'manual';
  lat: number | null;
  lon: number | null;
  accuracyMeters: number | null;
  addressLabel: string;
  cityLabel: string;
  errorMessage?: string;
  lastUpdated: number | null;
}

// ============================================================================
// Reference Domain Models ("Where is my BUS" Specification)
// ============================================================================

export type BusServiceCategory =
  | 'Ordinary'
  | 'Metro Express'
  | 'Express'
  | 'AC'
  | 'Electric';

export interface BusStop {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  scheduledArrival: string; // e.g., "02:35 PM" or "14:35"
  estimatedArrival: string; // e.g., "02:40 PM" or "14:40"
  status: 'passed' | 'current' | 'upcoming';
  delayMinutes: number;
  distanceFromStartKm: number;
  scheduledOffsetMin: number;
  platform: string;
  landmark?: string;
  stopCode?: string;
  etaMinutes: number | null;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  bearing: number; // 0-360 degrees
  speedKmh: number;
  updatedAt: string; // ISO 8601
}

export interface BusTrip {
  tripId: string;
  routeId: string;
  routeNumber: string;
  vehicleNumber: string;
  departureTime: string;
  arrivalTime: string;
  isRealTime: boolean;
  delayMinutes: number;
  crowdLevel: CrowdLevel;
  crowdPercent: number;
  speedKmh: number;
}

export interface LiveBusTracking {
  routeId: string;
  routeNumber: string;
  busCategory: BusServiceCategory;
  operator: string;
  origin: string;
  destination: string;
  vehicleNumber: string;
  currentLatitude: number;
  currentLongitude: number;
  bearing: number; // 0-360 degrees
  speedKmh: number;
  currentStopId: string;
  currentStopName: string;
  nextStopId: string;
  nextStopName: string;
  etaNextStopMinutes: number;
  overallStatus: 'ON_TIME' | 'DELAYED' | 'EARLY' | 'COMPLETED';
  delayMinutes: number;
  stops: BusStop[];
  lastUpdated: string; // ISO 8601
}

export interface SavedFavoriteRoute {
  routeId: string;
  routeNumber: string;
  origin: string;
  destination: string;
  operator: string;
  busCategory: BusServiceCategory;
  customLabel?: string; // e.g., "Morning Office Commute"
  savedAt: number; // Unix timestamp
  routeSnapshot: BusRoute;
}

