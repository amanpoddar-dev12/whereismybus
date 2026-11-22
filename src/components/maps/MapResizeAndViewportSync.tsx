import React, { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { PlannedJourney } from '../../types/transit';

export interface MapResizeAndViewportSyncProps {
  radarCenter: [number, number];
  previewJourney: PlannedJourney | null;
  trackedBusPos: [number, number] | null;
  trackedPolyline: [number, number][] | null;
  trackedRouteKey: string | null;
  cameraBoundsPoints?: [number, number][];
  followTrackedBus: boolean;
  pinMode: boolean;
  onMapClickPin: (lat: number, lon: number) => void;
  onViewportMoved: (lat: number, lon: number) => void;
  onUserPanOrZoom?: () => void;
}

const FOCUS_FIT_BOUNDS_OPTIONS: L.FitBoundsOptions = {
  paddingTopLeft: [40, 60],
  paddingBottomRight: [40, 120],
  maxZoom: 15,
  animate: true,
};

/**
 * Keeps Leaflet container size, route/journey bounds (with mobile-safe padding),
 * live bus camera tracking, and radar viewport move events synchronized with React state.
 */
export const MapResizeAndViewportSync: React.FC<
  MapResizeAndViewportSyncProps
> = ({
  radarCenter,
  previewJourney,
  trackedBusPos,
  trackedPolyline,
  trackedRouteKey,
  cameraBoundsPoints,
  followTrackedBus,
  pinMode,
  onMapClickPin,
  onViewportMoved,
  onUserPanOrZoom,
}) => {
  const map = useMap();
  const lastFramedJourneyIdRef = useRef<string | null>(null);
  const lastFramedRouteKeyRef = useRef<string | null>(null);
  const isProgrammaticMoveRef = useRef<boolean>(false);

  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    if (!trackedRouteKey || !trackedPolyline || trackedPolyline.length < 2) {
      lastFramedRouteKeyRef.current = null;
      return;
    }
    if (lastFramedRouteKeyRef.current === trackedRouteKey) return;

    const pts =
      cameraBoundsPoints && cameraBoundsPoints.length >= 2
        ? cameraBoundsPoints
        : trackedPolyline;
    const bounds = L.latLngBounds(pts);
    if (bounds.isValid()) {
      isProgrammaticMoveRef.current = true;
      map.fitBounds(bounds, FOCUS_FIT_BOUNDS_OPTIONS);
      lastFramedRouteKeyRef.current = trackedRouteKey;
      setTimeout(() => {
        isProgrammaticMoveRef.current = false;
      }, 450);
    }
  }, [cameraBoundsPoints, map, trackedPolyline, trackedRouteKey]);

  useEffect(() => {
    if (!trackedRouteKey || !trackedBusPos || !followTrackedBus) return;
    isProgrammaticMoveRef.current = true;
    map.panTo(trackedBusPos, { animate: true, duration: 0.65 });
    const t = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 700);
    return () => clearTimeout(t);
  }, [followTrackedBus, map, trackedBusPos, trackedRouteKey]);

  useEffect(() => {
    if (trackedRouteKey || !previewJourney) {
      lastFramedJourneyIdRef.current = null;
      return;
    }
    if (lastFramedJourneyIdRef.current === previewJourney.id) return;

    const pts: [number, number][] =
      cameraBoundsPoints && cameraBoundsPoints.length >= 2
        ? cameraBoundsPoints
        : [];
    if (pts.length < 2) {
      previewJourney.legs.forEach((l) => l.polyline.forEach((p) => pts.push(p)));
    }
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts);
      if (bounds.isValid()) {
        map.fitBounds(bounds, FOCUS_FIT_BOUNDS_OPTIONS);
        lastFramedJourneyIdRef.current = previewJourney.id;
      }
    }
  }, [cameraBoundsPoints, map, previewJourney, trackedRouteKey]);

  useEffect(() => {
    if (trackedRouteKey || previewJourney) return;
    map.setView(radarCenter, map.getZoom(), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarCenter[0], radarCenter[1], map, previewJourney, trackedRouteKey]);

  useMapEvents({
    click(e) {
      if (pinMode) {
        onMapClickPin(e.latlng.lat, e.latlng.lng);
      }
    },
    dragstart() {
      if (!isProgrammaticMoveRef.current && trackedRouteKey && followTrackedBus) {
        onUserPanOrZoom?.();
      }
    },
    zoomstart() {
      if (!isProgrammaticMoveRef.current && trackedRouteKey && followTrackedBus) {
        onUserPanOrZoom?.();
      }
    },
    moveend() {
      isProgrammaticMoveRef.current = false;
      if (trackedRouteKey) return;
      const c = map.getCenter();
      const dist = Math.hypot(c.lat - radarCenter[0], c.lng - radarCenter[1]);
      if (dist > 0.015) {
        onViewportMoved(c.lat, c.lng);
      }
    },
  });

  return null;
};
