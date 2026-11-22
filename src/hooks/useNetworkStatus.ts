import { useCallback, useEffect, useState } from 'react';

export interface NetworkStatusState {
  isOnline: boolean;
  isOffline: boolean;
  heartbeatFailed: boolean;
  lastOnlineAt: number | null;
  reportHeartbeatFailure: () => void;
  reportHeartbeatSuccess: () => void;
}

/**
 * Reactive network connectivity hook listening to browser online/offline events
 * as well as live API/WebSocket heartbeat failures.
 */
export function useNetworkStatus(): NetworkStatusState {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [heartbeatFailed, setHeartbeatFailed] = useState<boolean>(false);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(() =>
    typeof navigator !== 'undefined' && navigator.onLine ? Date.now() : null
  );

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      setHeartbeatFailed(false);
      setLastOnlineAt(Date.now());
    };

    const handleOffline = () => {
      setBrowserOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const reportHeartbeatFailure = useCallback(() => {
    setHeartbeatFailed(true);
  }, []);

  const reportHeartbeatSuccess = useCallback(() => {
    setHeartbeatFailed(false);
    setLastOnlineAt(Date.now());
  }, []);

  const isOnline = browserOnline && !heartbeatFailed;

  return {
    isOnline,
    isOffline: !isOnline,
    heartbeatFailed,
    lastOnlineAt,
    reportHeartbeatFailure,
    reportHeartbeatSuccess,
  };
}
