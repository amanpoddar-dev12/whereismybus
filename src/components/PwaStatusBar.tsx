import React from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/**
 * Global PWA Connectivity & Service Worker Update Bar:
 * 1. Displays a non-intrusive offline banner when disconnected.
 * 2. Displays an "Update available" toast with skipWaiting() activation when a new build deploys.
 */
export const PwaStatusBar: React.FC = () => {
  const { isOffline } = useNetworkStatus();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <>
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="w-full border-b border-amber-300/70 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/70 px-3.5 py-2 text-center text-xs font-medium text-amber-950 dark:text-amber-200"
        >
          <span className="inline-flex items-center justify-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Offline Mode — Showing scheduled timetable &amp; cached ticket
            </span>
          </span>
        </div>
      )}

      {needRefresh && (
        <div
          role="alert"
          className="fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-4 z-[60] flex sm:w-96 items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-xs text-white shadow-elevated"
        >
          <div className="min-w-0">
            <p className="font-semibold text-white">Update available</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              A newer version of Where is my BUS is ready.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Update now</span>
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              aria-label="Dismiss update notification"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
