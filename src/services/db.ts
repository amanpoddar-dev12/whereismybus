import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { BusRoute, UpiTicketPass } from '../types/transit';

const DB_NAME = 'wimb-offline-db';
const DB_VERSION = 1;
const MAX_CACHED_ROUTES = 15;

export interface CachedRouteRecord {
  id: string;
  routeNumber: string;
  operator: string;
  origin: string;
  destination: string;
  viewedAt: number;
  route: BusRoute;
}

export interface ActiveTicketRecord {
  id: string;
  routeNumber: string;
  issuedAt: number;
  expiresAt: number;
  validationHash: string;
  qrPayload: string;
  ticket: UpiTicketPass;
}

export interface HomeWorkPresets {
  homeStopName?: string;
  homeLat?: number;
  homeLon?: number;
  workStopName?: string;
  workLat?: number;
  workLon?: number;
}

export interface UserPreferenceRecord {
  key: string;
  updatedAt: number;
  value: HomeWorkPresets | string[] | Record<string, unknown>;
}

interface WimbOfflineDB extends DBSchema {
  cached_routes: {
    key: string;
    value: CachedRouteRecord;
    indexes: { 'by-viewedAt': number };
  };
  active_tickets: {
    key: string;
    value: ActiveTicketRecord;
    indexes: { 'by-issuedAt': number };
  };
  user_preferences: {
    key: string;
    value: UserPreferenceRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<WimbOfflineDB>> | null = null;

function getDb(): Promise<IDBPDatabase<WimbOfflineDB>> | null {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return null;
  }
  if (!dbPromise) {
    dbPromise = openDB<WimbOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cached_routes')) {
          const routeStore = db.createObjectStore('cached_routes', {
            keyPath: 'id',
          });
          routeStore.createIndex('by-viewedAt', 'viewedAt');
        }
        if (!db.objectStoreNames.contains('active_tickets')) {
          const ticketStore = db.createObjectStore('active_tickets', {
            keyPath: 'id',
          });
          ticketStore.createIndex('by-issuedAt', 'issuedAt');
        }
        if (!db.objectStoreNames.contains('user_preferences')) {
          db.createObjectStore('user_preferences', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Generates a deterministic cryptographic validation hash for offline QR verification.
 */
export async function computeTicketValidationHash(
  ticket: UpiTicketPass
): Promise<string> {
  const raw = `${ticket.id}|${ticket.routeNumber}|${ticket.utrNumber}|${ticket.totalFareInr}|${ticket.issuedAt}|${ticket.qrSeed}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24)
        .toUpperCase();
    }
  } catch {
    // Fallback to deterministic FNV-1a hash
  }
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `WIMB-${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Caches a recently viewed route (metadata, polyline, stops, schedules) and prunes to last 15 routes.
 */
export async function cacheViewedRoute(route: BusRoute): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.put('cached_routes', {
      id: route.id,
      routeNumber: route.routeNumber,
      operator: route.operator,
      origin: route.origin,
      destination: route.destination,
      viewedAt: Date.now(),
      route,
    });

    const allByDate = await db.getAllFromIndex('cached_routes', 'by-viewedAt');
    if (allByDate.length > MAX_CACHED_ROUTES) {
      const excess = allByDate.slice(0, allByDate.length - MAX_CACHED_ROUTES);
      const tx = db.transaction('cached_routes', 'readwrite');
      await Promise.all(excess.map((item) => tx.store.delete(item.id)));
      await tx.done;
    }
  } catch {
    // Ignore IndexedDB quota/private-mode errors gracefully
  }
}

export async function getCachedRoutes(): Promise<BusRoute[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const records = await db.getAllFromIndex('cached_routes', 'by-viewedAt');
    return records.reverse().map((r) => r.route);
  } catch {
    return [];
  }
}

export async function getCachedRouteById(id: string): Promise<BusRoute | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rec = await db.get('cached_routes', id);
    return rec?.route ?? null;
  } catch {
    return null;
  }
}

/**
 * Saves an issued UPI ticket pass + cryptographic validation hash for offline verification.
 */
export async function saveActiveTicket(ticket: UpiTicketPass): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const validationHash = await computeTicketValidationHash(ticket);
    const qrPayload = JSON.stringify({
      id: ticket.id,
      route: ticket.routeNumber,
      op: ticket.operator,
      from: ticket.originStop,
      to: ticket.destinationStop,
      fare: ticket.totalFareInr,
      utr: ticket.utrNumber,
      exp: ticket.expiresAt,
      sig: validationHash,
    });

    await db.put('active_tickets', {
      id: ticket.id,
      routeNumber: ticket.routeNumber,
      issuedAt: ticket.issuedAt,
      expiresAt: ticket.expiresAt,
      validationHash,
      qrPayload,
      ticket,
    });
  } catch {
    // Ignore IndexedDB errors
  }
}

export async function getActiveTickets(): Promise<ActiveTicketRecord[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const records = await db.getAllFromIndex('active_tickets', 'by-issuedAt');
    return records.reverse();
  } catch {
    return [];
  }
}

export async function saveUserPreference(
  key: string,
  value: UserPreferenceRecord['value']
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put('user_preferences', {
      key,
      updatedAt: Date.now(),
      value,
    });
  } catch {
    // Ignore IndexedDB errors
  }
}

export async function getUserPreference<T = UserPreferenceRecord['value']>(
  key: string
): Promise<T | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rec = await db.get('user_preferences', key);
    return (rec?.value as T) ?? null;
  } catch {
    return null;
  }
}
