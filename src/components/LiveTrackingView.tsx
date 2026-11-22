import React from 'react';
import { useTransit } from '../context/TransitContext';
import { LiveBusTimeline } from './LiveBusTimeline';

/**
 * Full-screen / Slide-over Live Bus Status & Timeline overlay.
 * Interactive map is rendered ONLY on demand when user taps "Show Map" inside LiveBusTimeline.
 */
export const LiveTrackingView: React.FC = () => {
  const { selectedRouteId } = useTransit();

  if (!selectedRouteId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live bus status and stop timeline"
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto touch-pan-y bg-canvas text-zinc-900 dark:text-zinc-100"
    >
      <LiveBusTimeline />
    </div>
  );
};
