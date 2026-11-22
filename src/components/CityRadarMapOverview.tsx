import React, { Suspense } from 'react';
import { MapCanvasSkeleton } from './maps/MapCanvasSkeleton';

const LazyUnifiedTransitMap = React.lazy(() => import('./maps/UnifiedTransitMap'));

export const CityRadarMapOverview: React.FC = () => {
  return (
    <div className="h-80 sm:h-96 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-card">
      <Suspense fallback={<MapCanvasSkeleton />}>
        <LazyUnifiedTransitMap />
      </Suspense>
    </div>
  );
};
