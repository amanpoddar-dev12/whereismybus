import React, { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, useTheme } from '../context/ThemeContext';
import { cn } from './ui/primitives';

export const ThemeSwitcher: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const options: Array<{
    id: ThemePreference;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
    { id: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
  ];

  const activeIcon =
    theme === 'system' ? (
      <Monitor className="h-4 w-4" />
    ) : resolvedTheme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Change theme (current: ${theme})`}
        title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-800 transition-colors hover:bg-zinc-200/80 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white dark:focus-visible:ring-zinc-100"
      >
        {activeIcon}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Select color theme"
          className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-xl border border-zinc-300 bg-white p-1 shadow-elevated dark:border-zinc-800 dark:bg-zinc-900"
        >
          {options.map((opt) => {
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isSelected
                    ? 'bg-zinc-100 text-zinc-950 font-semibold dark:bg-zinc-800 dark:text-white'
                    : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {opt.icon}
                  <span>{opt.label}</span>
                </span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
