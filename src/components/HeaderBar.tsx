import React from 'react';
import {
  BellRing,
  ChevronDown,
  Loader2,
  LocateFixed,
  MapPin,
  QrCode,
  Volume2,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { CITY_PRESETS } from '../config/transitConfig';
import { ActiveTab, CityPresetId } from '../types/transit';
import { formatMeters, getBusTelemetry, haversineMeters } from '../utils/transitHelpers';
import { ThemeSwitcher } from './ThemeSwitcher';
import { cn, SegmentedTabs, StatusDot } from './ui/primitives';

/**
 * Compact, modern geometric vector brand mark (Logo-Only Branding).
 * Full application title "Where is my BUS" is preserved in `aria-label`, `<title>`, OpenGraph, and Manifest.
 */
const BrandVectorLogo: React.FC = () => (
  <svg
    width="34"
    height="34"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Where is my BUS"
    className="shrink-0 rounded-[10px] ring-1 ring-zinc-900/5 dark:ring-white/15"
  >
    <rect width="40" height="40" rx="11" fill="#09090B" />
    <rect x="9.5" y="9.5" width="21" height="19.5" rx="4.5" fill="#10B981" />
    <rect x="12" y="12.2" width="16" height="7.8" rx="2" fill="#09090B" />
    <rect x="15" y="7" width="10" height="2.2" rx="1.1" fill="#34D399" />
    <circle cx="14.2" cy="24.5" r="1.8" fill="#FEF08A" />
    <circle cx="25.8" cy="24.5" r="1.8" fill="#FEF08A" />
    <rect x="12.2" y="29" width="3.5" height="2.8" rx="1" fill="#A1A1AA" />
    <rect x="24.3" y="29" width="3.5" height="2.8" rx="1" fill="#A1A1AA" />
    <circle cx="31.5" cy="9.5" r="3.5" fill="#10B981" stroke="#09090B" strokeWidth="1.5" />
  </svg>
);

export const HeaderBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    closeLiveTracking,
    cityPresetId,
    selectCityPreset,
    userGeo,
    detectUserLocation,
    liveFleetVehicles,
    tickets,
    alarms,
    favoriteRoutes,
    routes,
    simulateAlarmRingNow,
    openLiveTracking,
  } = useTransit();

  const activeAlarm = alarms.find((a) => a.active && !a.triggered);
  const activeAlarmCount = alarms.filter((a) => a.active && !a.triggered).length;
  const savedCount = favoriteRoutes.length + activeAlarmCount;

  let activeAlarmDistLabel = '';
  if (activeAlarm) {
    if (userGeo.lat !== null && userGeo.lon !== null && userGeo.status === 'granted') {
      const d = haversineMeters(
        userGeo.lat,
        userGeo.lon,
        activeAlarm.stopLat,
        activeAlarm.stopLon
      );
      activeAlarmDistLabel = formatMeters(d);
    } else {
      const r = routes.find((rt) => rt.id === activeAlarm.routeId);
      if (r && r.buses[0]) {
        const tel = getBusTelemetry(r.stops, r.buses[0].routeProgress);
        const d = haversineMeters(
          tel.lat,
          tel.lng,
          activeAlarm.stopLat,
          activeAlarm.stopLon
        );
        activeAlarmDistLabel = formatMeters(d);
      }
    }
  }

  const desktopNavOptions: Array<{
    id: ActiveTab;
    label: string;
    count?: string | number;
  }> = [
    { id: 'home', label: 'Home' },
    {
      id: 'search',
      label: 'Search & Routes',
      count: routes.length > 0 ? routes.length : undefined,
    },
    {
      id: 'saved',
      label: 'Saved',
      count: savedCount > 0 ? savedCount : undefined,
    },
  ];

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-card/95 backdrop-blur-md pt-safe transition-colors">
      <div className="mx-auto max-w-5xl px-3 sm:px-6">
        {/* Ultra-compact h-12 (48px) on mobile, h-14 (56px) on desktop */}
        <div className="flex h-12 sm:h-14 items-center justify-between gap-1.5 sm:gap-2">
          {/* Left: Vector Brand Logo Only + Live Status Indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <button
              type="button"
              aria-label="Where is my BUS"
              title="Where is my BUS — Home"
              onClick={() => {
                closeLiveTracking();
                setActiveTab('home');
              }}
              className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
            >
              <BrandVectorLogo />
            </button>

            <span className="hidden min-[385px]:inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-800 tabular-nums truncate dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <StatusDot tone="live" pulse />
              <span className="truncate">
                {liveFleetVehicles.length > 0
                  ? `${liveFleetVehicles.length} live`
                  : `${routes.length} routes`}
              </span>
            </span>
          </div>

          {/* Center: Clean 3-Tab Desktop Navigation */}
          <nav aria-label="Primary Navigation" className="hidden md:flex items-center">
            <SegmentedTabs
              ariaLabel="Application Sections"
              options={desktopNavOptions}
              value={activeTab === 'tickets' ? 'home' : activeTab}
              onChange={(next) => {
                closeLiveTracking();
                setActiveTab(next);
              }}
              size="sm"
            />
          </nav>

          {/* Right: Theme Switcher, GPS, Active Passes Badge (if any), and City Selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            {tickets.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  closeLiveTracking();
                  setActiveTab('tickets');
                }}
                aria-label={`View ${tickets.length} QR passes`}
                title="Active QR Passes"
                className={cn(
                  'inline-flex h-10 items-center gap-1 rounded-xl border px-2 sm:px-2.5 text-xs font-semibold tabular-nums transition-colors',
                  activeTab === 'tickets'
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                )}
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>{tickets.length}</span>
              </button>
            )}

            <ThemeSwitcher />

            <button
              type="button"
              onClick={detectUserLocation}
              title="Detect nearest bus stop via GPS"
              aria-label="Detect nearest bus stop via GPS"
              className={cn(
                'inline-flex h-10 w-10 sm:w-auto sm:px-2.5 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100',
                userGeo.status === 'granted'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : userGeo.status === 'locating'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300'
                  : 'border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200/80 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white'
              )}
            >
              {userGeo.status === 'locating' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">
                {userGeo.status === 'granted' ? 'GPS' : 'Locate'}
              </span>
            </button>

            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 dark:text-zinc-400" />
              <select
                aria-label="Select City or Live GPS"
                value={cityPresetId}
                onChange={(e) => selectCityPreset(e.target.value as CityPresetId)}
                className="h-10 appearance-none rounded-xl border border-zinc-300 bg-zinc-100 pl-7 pr-6 text-xs font-medium text-zinc-900 transition-colors hover:border-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none max-w-[110px] sm:max-w-[175px] truncate cursor-pointer dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:focus:border-zinc-500 dark:focus:bg-zinc-900"
              >
                {(Object.keys(CITY_PRESETS) as CityPresetId[]).map((id) => (
                  <option
                    key={id}
                    value={id}
                    className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal"
                  >
                    {id === 'live_gps'
                      ? userGeo.cityLabel
                        ? `Near ${userGeo.cityLabel}`
                        : 'Nearest (GPS)'
                      : `${CITY_PRESETS[id].name} · ${CITY_PRESETS[id].primaryOperator}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600 dark:text-zinc-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Compact Active Proximity Alarm Strip (shown only when an alarm is armed) */}
      {activeAlarm && (
        <div className="border-t border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-900/60 dark:bg-emerald-950/60 px-4 py-1">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => openLiveTracking(activeAlarm.routeId, 0, false)}
              className="flex min-h-[34px] items-center gap-2 text-left min-w-0 flex-1 text-emerald-950 dark:text-emerald-200 hover:underline"
            >
              <BellRing className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span className="truncate tabular-nums">
                Wake alarm: <strong className="font-semibold">{activeAlarm.stopName}</strong>
                {activeAlarmDistLabel ? ` · ${activeAlarmDistLabel} away` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => simulateAlarmRingNow(activeAlarm.id)}
              className="shrink-0 inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-zinc-800"
            >
              <Volume2 className="h-3 w-3" />
              <span>Test</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
