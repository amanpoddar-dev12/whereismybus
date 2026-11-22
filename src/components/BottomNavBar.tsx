import React from 'react';
import { Home, Search, Star } from 'lucide-react';
import { useTransit } from '../context/TransitContext';
import { ActiveTab } from '../types/transit';
import { cn } from './ui/primitives';

export const BottomNavBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    alarms,
    favoriteRoutes,
    closeLiveTracking,
  } = useTransit();

  const activeAlarmCount = alarms.filter((a) => a.active && !a.triggered).length;
  const savedTotal = favoriteRoutes.length + activeAlarmCount;

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
  }> = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home className="h-[19px] w-[19px]" />,
    },
    {
      id: 'search',
      label: 'Search & Routes',
      icon: <Search className="h-[19px] w-[19px]" />,
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: <Star className="h-[19px] w-[19px]" />,
      badge: savedTotal > 0 ? savedTotal : undefined,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-md pb-safe transition-colors"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 px-2 pt-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                closeLiveTracking();
                setActiveTab(item.id);
              }}
              className={cn(
                'relative flex min-h-[54px] flex-col items-center justify-center gap-1 py-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 rounded-xl',
                isActive
                  ? 'font-semibold text-zinc-950 dark:text-white'
                  : 'font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-200'
              )}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-zinc-950 dark:bg-emerald-400"
                />
              )}
              <div className="relative">
                {item.icon}
                {item.badge !== undefined && (
                  <span className="tabular-nums absolute -right-4 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zinc-900 dark:bg-emerald-500 px-1 text-[9px] font-semibold text-white dark:text-zinc-950">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
