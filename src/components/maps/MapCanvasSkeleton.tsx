import React from 'react';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { cn } from '../ui/primitives';

export const MapCanvasSkeleton: React.FC<{ className?: string }> = ({
  className,
}) => {
  return (
    <div
      role="status"
      aria-label="Loading interactive transit map"
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400',
        className
      )}
    >
      {/* Subtle geometric street grid placeholder to prevent visual CLS */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-15"
        style={{
          backgroundImage:
            'linear-gradient(to right, #a1a1aa 1px, transparent 1px), linear-gradient(to bottom, #a1a1aa 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card/90 px-5 py-4 shadow-subtle backdrop-blur-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950">
          <MapIcon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
          <span>Loading live transit map…</span>
        </div>
      </div>
    </div>
  );
};
