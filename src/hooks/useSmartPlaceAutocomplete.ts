import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTransit } from '../context/TransitContext';
import {
  SearchPlaceSuggestion,
  searchRealTransitPlaces,
} from '../services/liveTransitApi';
import {
  buildHybridSearchSuggestions,
  UnifiedSearchSuggestion,
} from '../utils/stationSearchEngine';
import { estimateWalkingMinutes, formatMeters } from '../utils/transitHelpers';

/**
 * Manages origin/destination combobox state, debounced remote place search,
 * hybrid local/remote suggestion synthesis, keyboard navigation, and selection.
 */
export function useSmartPlaceAutocomplete() {
  const {
    city,
    userGeo,
    detectUserLocation,
    allAreaStops,
    activeStation,
    routes,
    openLiveTracking,
    originQuery,
    setOriginQuery,
    destinationQuery,
    setOriginCoords,
    applyOriginSuggestion,
    applyDestinationSuggestion,
    recentSearches,
  } = useTransit();

  const [focusedField, setFocusedField] = useState<'origin' | 'dest' | null>(
    null
  );
  const [remoteSuggestions, setRemoteSuggestions] = useState<
    SearchPlaceSuggestion[]
  >([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);

  const searchCardRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeQuery = focusedField === 'origin' ? originQuery : destinationQuery;
  const refLat = userGeo.lat ?? activeStation?.lat ?? city.center[0];
  const refLon = userGeo.lon ?? activeStation?.lon ?? city.center[1];

  useEffect(() => {
    const handleOutside = (ev: MouseEvent) => {
      if (
        searchCardRef.current &&
        !searchCardRef.current.contains(ev.target as Node)
      ) {
        setFocusedField(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (highlightedIdx >= 0) {
      optionRefs.current[highlightedIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIdx]);

  useEffect(() => {
    if (!focusedField) {
      setRemoteSuggestions([]);
      setHighlightedIdx(-1);
      return;
    }

    const q = activeQuery.trim();
    if (q.length < 2) {
      setRemoteSuggestions([]);
      setIsSearchingPlaces(false);
      setHighlightedIdx(-1);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const res = await searchRealTransitPlaces(
          q,
          refLat,
          refLon,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setRemoteSuggestions(res);
        }
      } catch {
        if (!controller.signal.aborted) setRemoteSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchingPlaces(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery, focusedField, refLat, refLon]);

  const unifiedSuggestions: UnifiedSearchSuggestion[] = useMemo(() => {
    if (!focusedField) return [];
    const q = activeQuery.trim();

    if (q.length >= 1) {
      return buildHybridSearchSuggestions({
        query: q,
        localStops: allAreaStops,
        routes,
        remoteResults: remoteSuggestions,
        refLat,
        refLon,
        includeRoutes: focusedField === 'dest',
        maxResults: 10,
      });
    }

    const list: UnifiedSearchSuggestion[] = [];

    if (focusedField === 'origin') {
      list.push({
        id: '__my_live_gps__',
        name:
          userGeo.status === 'granted' && userGeo.addressLabel
            ? `Current location (${userGeo.addressLabel})`
            : 'Use current GPS location',
        subtitle:
          userGeo.status === 'granted'
            ? `Accuracy ±${userGeo.accuracyMeters ?? 15}m · Nearest boarding stop`
            : 'Detect live coordinates and closest stop',
        lat: userGeo.lat ?? city.center[0],
        lon: userGeo.lon ?? city.center[1],
        isTransitStop: false,
        category: 'gps',
        score: 200,
      });
    }

    for (const rec of recentSearches.slice(0, 3)) {
      list.push({
        id: `recent-${rec.id}`,
        name: rec.name,
        subtitle: rec.subtitle,
        lat: rec.lat,
        lon: rec.lon,
        isTransitStop: rec.isTransitStop,
        stopId: rec.stopId,
        stopCode: rec.stopCode,
        category: 'recent',
        score: 150,
      });
    }

    for (const st of allAreaStops.slice(0, 6)) {
      if (list.some((x) => x.name.toLowerCase() === st.name.toLowerCase())) {
        continue;
      }
      const dist = st.distanceFromUserMeters ?? 150;
      const walkMin = estimateWalkingMinutes(dist * 1.2);
      list.push({
        id: st.stopId,
        name: st.name,
        subtitle: `${st.agencyPrefix}${
          st.stopCode ? ` #${st.stopCode}` : ''
        } · ${formatMeters(dist)} (~${walkMin}m walk)`,
        lat: st.lat,
        lon: st.lon,
        isTransitStop: true,
        stopId: st.stopId,
        stopCode: st.stopCode,
        distanceMeters: dist,
        category: st.isHub ? 'terminal' : 'gtfs_stop',
        score: 100,
      });
    }

    return list;
  }, [
    activeQuery,
    allAreaStops,
    city.center,
    focusedField,
    recentSearches,
    refLat,
    refLon,
    remoteSuggestions,
    routes,
    userGeo.accuracyMeters,
    userGeo.addressLabel,
    userGeo.lat,
    userGeo.lon,
    userGeo.status,
  ]);

  const handleSelectSuggestion = useCallback(
    (item: UnifiedSearchSuggestion) => {
      if (item.category === 'gps') {
        detectUserLocation();
        if (userGeo.lat !== null && userGeo.lon !== null) {
          setOriginQuery(userGeo.addressLabel || 'Current location');
          setOriginCoords({
            lat: userGeo.lat,
            lon: userGeo.lon,
            label: userGeo.addressLabel || 'Current location',
          });
        }
        setFocusedField(null);
        return;
      }

      if (item.category === 'route' && item.routeId) {
        setFocusedField(null);
        openLiveTracking(item.routeId, 0);
        return;
      }

      const payload = {
        id: item.stopId || item.id.replace(/^recent-/, ''),
        name: item.name,
        subtitle: item.subtitle,
        lat: item.lat,
        lon: item.lon,
        isTransitStop: item.isTransitStop,
        stopId: item.stopId,
        stopCode: item.stopCode,
        category: item.category === 'recent' ? undefined : item.category,
      };

      if (focusedField === 'origin') {
        applyOriginSuggestion(payload);
      } else {
        applyDestinationSuggestion(payload);
      }
      setFocusedField(null);
      setHighlightedIdx(-1);
    },
    [
      applyDestinationSuggestion,
      applyOriginSuggestion,
      detectUserLocation,
      focusedField,
      openLiveTracking,
      setOriginCoords,
      setOriginQuery,
      userGeo.addressLabel,
      userGeo.lat,
      userGeo.lon,
    ]
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!focusedField || unifiedSuggestions.length === 0) {
        if (e.key === 'Escape') setFocusedField(null);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev < unifiedSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev > 0 ? prev - 1 : unifiedSuggestions.length - 1
        );
      } else if (e.key === 'Home' && unifiedSuggestions.length > 0) {
        e.preventDefault();
        setHighlightedIdx(0);
      } else if (e.key === 'End' && unifiedSuggestions.length > 0) {
        e.preventDefault();
        setHighlightedIdx(unifiedSuggestions.length - 1);
      } else if (e.key === 'Enter') {
        if (highlightedIdx >= 0 && unifiedSuggestions[highlightedIdx]) {
          e.preventDefault();
          handleSelectSuggestion(unifiedSuggestions[highlightedIdx]);
        } else if (unifiedSuggestions[0] && activeQuery.trim().length >= 2) {
          e.preventDefault();
          handleSelectSuggestion(unifiedSuggestions[0]);
        }
      } else if (e.key === 'Escape') {
        setFocusedField(null);
        setHighlightedIdx(-1);
      }
    },
    [
      activeQuery,
      focusedField,
      handleSelectSuggestion,
      highlightedIdx,
      unifiedSuggestions,
    ]
  );

  return {
    focusedField,
    setFocusedField,
    isSearchingPlaces,
    highlightedIdx,
    setHighlightedIdx,
    searchCardRef,
    optionRefs,
    activeQuery,
    unifiedSuggestions,
    handleSelectSuggestion,
    handleInputKeyDown,
  };
}
