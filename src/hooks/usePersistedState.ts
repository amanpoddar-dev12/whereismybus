import { useEffect, useState } from 'react';

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Type-safe React state synchronized with localStorage.
 */
export function usePersistedState<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => readStorage<T>(key, fallback));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore storage quota or private-browsing write failures.
    }
  }, [key, state]);

  return [state, setState] as const;
}
