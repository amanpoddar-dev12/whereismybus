import React from 'react';
import { Award, Users } from 'lucide-react';
import { CrowdLevel } from '../../types/transit';
import { cn, StatusDot } from '../ui/primitives';

const CROWD_OPTIONS: ReadonlyArray<{
  level: CrowdLevel;
  tone: 'live' | 'warning' | 'danger';
  label: string;
}> = [
  { level: 'low', tone: 'live', label: 'Seats' },
  { level: 'medium', tone: 'warning', label: 'Standing' },
  { level: 'high', tone: 'danger', label: 'Full' },
];

export interface CrowdTelemetryDrawerProps {
  karmaPoints: number;
  crowdsourcedCount: number;
  isUserOnBoard: boolean;
  userVotedLevel?: CrowdLevel;
  onToggleOnBoard: () => void;
  onVoteCrowd: (level: CrowdLevel) => void;
}

/**
 * Expandable drawer for onboard GPS sharing and live crowd occupancy voting.
 */
export const CrowdTelemetryDrawer: React.FC<CrowdTelemetryDrawerProps> = ({
  karmaPoints,
  crowdsourcedCount,
  isUserOnBoard,
  userVotedLevel,
  onToggleOnBoard,
  onVoteCrowd,
}) => (
  <div className="rounded-xl border border-zinc-300 bg-card dark:border-border dark:bg-zinc-900/70 p-3.5 space-y-3 shadow-subtle">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-400">
        <Award className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-zinc-950 dark:text-zinc-100">
          {karmaPoints} karma
        </span>
        <span>· {crowdsourcedCount} riders live</span>
      </div>
      <button
        type="button"
        onClick={onToggleOnBoard}
        className={cn(
          'min-h-[44px] rounded-xl px-3.5 text-xs font-semibold text-white transition-colors',
          isUserOnBoard
            ? 'bg-emerald-600'
            : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200'
        )}
      >
        {isUserOnBoard ? 'Sharing GPS (Stop)' : 'Share Live GPS (+15)'}
      </button>
    </div>

    <div className="border-t border-border pt-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-400">
        <Users className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-500" />
        Report live crowd occupancy
      </p>
      <div className="grid grid-cols-3 gap-2">
        {CROWD_OPTIONS.map((opt) => (
          <button
            key={opt.level}
            type="button"
            onClick={() => onVoteCrowd(opt.level)}
            className={cn(
              'flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors',
              userVotedLevel === opt.level
                ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                : 'border-zinc-300 bg-zinc-50 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
            )}
          >
            <StatusDot tone={opt.tone} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);
