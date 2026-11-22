import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { TransitProvider, useTransit } from './context/TransitContext';
import { HeaderBar } from './components/HeaderBar';
import { PwaStatusBar } from './components/PwaStatusBar';
import { HomeTab } from './components/tabs/HomeTab';
import { SearchTab } from './components/tabs/SearchTab';
import { SavedRoutesTab } from './components/tabs/SavedRoutesTab';
import { UpiTicketsTab } from './components/tabs/UpiTicketsTab';
import { LiveTrackingView } from './components/LiveTrackingView';
import { BottomNavBar } from './components/BottomNavBar';
import { VoiceSearchModal } from './components/modals/VoiceSearchModal';
import { UpiTicketModal } from './components/modals/UpiTicketModal';
import { AlarmModal } from './components/modals/AlarmModal';
import { SosShareModal } from './components/modals/SosShareModal';
import { StatusDot } from './components/ui/primitives';

/**
 * Clean, Modular Application Shell ("Where is my BUS"):
 * - Tab 1 (`home`): Minimalist Home landing page (Origin -> Dest search, Saved swipe cards, Responsive Recommended Routes, "Search All Bus Routes ->") — ZERO default map clutter!
 * - Tab 2 (`search`): Dedicated Search & Routes engine (Bus Number & Stop lookup, auto-suggest, category filters, Origin->Dest planner).
 * - Tab 3 (`saved`): Saved Favorite Routes & Frequent Stations manager.
 * - On-Demand Tracking Overlay (`LiveTrackingView` -> `LiveBusTimeline`): Opens stop timeline immediately; dynamically loads Leaflet ONLY when user taps "Show Map".
 */
const AppShell: React.FC = () => {
  const { activeTab, toasts } = useTransit();

  return (
    <div className="min-h-dvh-screen w-full max-w-full overflow-x-hidden overflow-y-auto bg-canvas text-zinc-900 dark:text-zinc-100 flex flex-col transition-colors">
      <HeaderBar />
      <PwaStatusBar />

      <main className="flex-1 w-full max-w-full min-w-0">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'saved' && <SavedRoutesTab />}
        {activeTab === 'tickets' && <UpiTicketsTab />}
      </main>

      <LiveTrackingView />

      <VoiceSearchModal />
      <UpiTicketModal />
      <AlarmModal />
      <SosShareModal />

      {/* Minimalist Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-[55] flex w-auto sm:w-80 flex-col gap-2"
        >
          {toasts.map((toast) => {
            const dotTone =
              toast.tone === 'amber'
                ? 'warning'
                : toast.tone === 'rose'
                ? 'danger'
                : 'live';

            return (
              <div
                key={toast.id}
                className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 px-3.5 py-3 text-white shadow-elevated"
              >
                <StatusDot tone={dotTone} className="mt-1" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {toast.title}
                  </p>
                  {toast.subtitle && (
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {toast.subtitle}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomNavBar />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <TransitProvider>
        <AppShell />
      </TransitProvider>
    </ThemeProvider>
  );
}
