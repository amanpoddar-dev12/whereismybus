import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusRoute, SavedFavoriteRoute } from '../types/transit';
import { inferBusServiceCategory } from '../utils/transitHelpers';

export const FAVORITE_ROUTES_STORAGE_KEY = 'wimb_favorite_routes_v1';

export interface FavoriteRoutesSyncAdapter {
  /**
   * Optional profile sync callback for authenticated users (e.g., Supabase / Firebase / REST).
   * Guest users default to offline-first `localStorage` persistence.
   */
  syncToCloud?: (favorites: SavedFavoriteRoute[]) => Promise<void>;
}

/**
 * Converts a `BusRoute` into a strict `SavedFavoriteRoute` domain record.
 */
export function createSavedFavoriteRecord(
  route: BusRoute,
  customLabel?: string,
  savedAt: number = Date.now()
): SavedFavoriteRoute {
  return {
    routeId: route.id,
    routeNumber: route.routeNumber,
    origin: route.origin,
    destination: route.destination,
    operator: route.operator,
    busCategory: inferBusServiceCategory(route),
    customLabel,
    savedAt,
    routeSnapshot: route,
  };
}

/**
 * Pure array reorder helper for drag-to-reorder and keyboard up/down controls.
 */
export function reorderFavoriteList(
  list: SavedFavoriteRoute[],
  fromIndex: number,
  toIndex: number
): SavedFavoriteRoute[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function loadInitialFavorites(): SavedFavoriteRoute[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(FAVORITE_ROUTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedFavoriteRoute =>
        Boolean(item && typeof item.routeId === 'string' && item.routeSnapshot)
    );
  } catch {
    return [];
  }
}

export function useFavoriteRoutes(adapter?: FavoriteRoutesSyncAdapter) {
  const [favorites, setFavorites] = useState<SavedFavoriteRoute[]>(() =>
    loadInitialFavorites()
  );
  const favoritesRef = useRef<SavedFavoriteRoute[]>(favorites);
  favoritesRef.current = favorites;

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          FAVORITE_ROUTES_STORAGE_KEY,
          JSON.stringify(favorites)
        );
      }
    } catch {
      // Ignore storage quota errors
    }

    if (adapter?.syncToCloud) {
      adapter.syncToCloud(favorites).catch(() => {});
    }
  }, [adapter, favorites]);

  const isFavorite = useCallback(
    (routeId: string): boolean => {
      return favorites.some((item) => item.routeId === routeId);
    },
    [favorites]
  );

  const getFavorites = useCallback((): SavedFavoriteRoute[] => {
    return favoritesRef.current;
  }, []);

  const toggleFavorite = useCallback(
    (route: BusRoute, customLabel?: string): boolean => {
      const exists = favoritesRef.current.some((f) => f.routeId === route.id);
      setFavorites((prev) => {
        if (prev.some((f) => f.routeId === route.id)) {
          return prev.filter((f) => f.routeId !== route.id);
        }
        return [createSavedFavoriteRecord(route, customLabel), ...prev];
      });
      return !exists;
    },
    []
  );

  const removeFavorite = useCallback((routeId: string): void => {
    setFavorites((prev) => prev.filter((f) => f.routeId !== routeId));
  }, []);

  const reorderFavorites = useCallback((fromIndex: number, toIndex: number): void => {
    setFavorites((prev) => reorderFavoriteList(prev, fromIndex, toIndex));
  }, []);

  const moveFavorite = useCallback(
    (routeId: string, direction: 'up' | 'down'): void => {
      setFavorites((prev) => {
        const idx = prev.findIndex((f) => f.routeId === routeId);
        if (idx === -1) return prev;
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        return reorderFavoriteList(prev, idx, targetIdx);
      });
    },
    []
  );

  const updateCustomLabel = useCallback(
    (routeId: string, customLabel: string): void => {
      setFavorites((prev) =>
        prev.map((item) =>
          item.routeId === routeId
            ? { ...item, customLabel: customLabel.trim() || undefined }
            : item
        )
      );
    },
    []
  );

  const savedRoutes = useMemo<BusRoute[]>(
    () => favorites.map((f) => f.routeSnapshot),
    [favorites]
  );

  return {
    favorites,
    savedRoutes,
    isFavorite,
    getFavorites,
    toggleFavorite,
    removeFavorite,
    reorderFavorites,
    moveFavorite,
    updateCustomLabel,
  };
}
