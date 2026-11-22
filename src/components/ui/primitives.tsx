import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Minimal, zero-dependency className joiner.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Geometric semantic status indicator (replaces emoji status dots for accessible, classic clarity).
 */
export const StatusDot: React.FC<{
  tone?: 'live' | 'warning' | 'danger' | 'neutral';
  pulse?: boolean;
  className?: string;
}> = ({ tone = 'neutral', pulse = false, className }) => {
  const fill =
    tone === 'live'
      ? 'bg-emerald-600 dark:bg-emerald-400'
      : tone === 'warning'
      ? 'bg-amber-500 dark:bg-amber-400'
      : tone === 'danger'
      ? 'bg-rose-600 dark:bg-rose-500'
      : 'bg-zinc-400 dark:bg-zinc-500';

  const ring =
    tone === 'live'
      ? 'bg-emerald-400'
      : tone === 'warning'
      ? 'bg-amber-400'
      : tone === 'danger'
      ? 'bg-rose-400'
      : 'bg-zinc-300 dark:bg-zinc-600';

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex h-2 w-2 shrink-0', className)}
    >
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            ring
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', fill)} />
    </span>
  );
};

/**
 * Restrained Geist-style semantic badge with narrow-screen overflow safety and Dark Mode support.
 */
export const Badge: React.FC<{
  variant?: 'default' | 'primary' | 'live' | 'warning' | 'danger' | 'subtle';
  children: React.ReactNode;
  className?: string;
}> = ({ variant = 'default', children, className }) => {
  const styles = {
    default:
      'border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    primary:
      'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950',
    live:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
    warning:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300',
    danger:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300',
    subtle:
      'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-800/90 dark:text-zinc-300',
  }[variant];

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-tight',
        styles,
        className
      )}
    >
      {children}
    </span>
  );
};

/**
 * Headless roving-focus Tabs primitive inspired by `@ui-sdk/core` (`createRovingFocus` + `createSelection`).
 * Supports ArrowLeft, ArrowRight, Home, and End keyboard navigation with WAI-ARIA tablist semantics.
 */
export interface SegmentedTabOption<T extends string> {
  id: T;
  label: string;
  count?: string | number;
  icon?: React.ReactNode;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  variant = 'segmented',
  className,
}: {
  options: ReadonlyArray<SegmentedTabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: 'xs' | 'sm';
  variant?: 'segmented' | 'pills';
  className?: string;
}) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (options.length <= 1) return;
    let nextIdx = -1;
    if (e.key === 'ArrowRight') {
      nextIdx = (idx + 1) % options.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = options.length - 1;
    }

    if (nextIdx >= 0) {
      e.preventDefault();
      const target = options[nextIdx];
      onChange(target.id);
      btnRefs.current[nextIdx]?.focus();
    }
  };

  if (variant === 'pills') {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar',
          className
        )}
      >
        {options.map((opt, idx) => {
          const isActive = opt.id === value;
          return (
            <button
              key={opt.id}
              ref={(el) => {
                btnRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(opt.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 focus-visible:ring-offset-1',
                size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs',
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white shadow-subtle dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border-zinc-300 bg-white text-zinc-800 shadow-subtle hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
              )}
            >
              {opt.icon}
              <span>{opt.label}</span>
              {opt.count !== undefined && (
                <span
                  className={cn(
                    'tabular-nums text-[11px]',
                    isActive
                      ? 'text-zinc-200 dark:text-zinc-600'
                      : 'text-zinc-600 dark:text-zinc-500'
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 rounded-lg border border-zinc-300 bg-zinc-200/75 p-0.5 overflow-x-auto no-scrollbar dark:border-zinc-800 dark:bg-zinc-900',
        className
      )}
    >
      {options.map((opt, idx) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(opt.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100',
              size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs',
              isActive
                ? 'bg-white text-zinc-950 font-semibold shadow-subtle ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-white dark:ring-white/10'
                : 'text-zinc-700 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums text-[11px]',
                  isActive
                    ? 'text-zinc-600 dark:text-zinc-300'
                    : 'text-zinc-600 dark:text-zinc-500'
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Headless Dialog / Overlay primitive inspired by `@ui-sdk/core` (`createPopup` + dismissal + focus recovery).
 */
export const DialogOverlay: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-md',
  tone = 'default',
  children,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      prevFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-950/55 p-3 sm:p-4 backdrop-blur-[2px]"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-elevated text-zinc-900 dark:text-zinc-100',
          maxWidthClass
        )}
      >
        <div
          className={cn(
            'sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-4',
            tone === 'danger'
              ? 'border-rose-100 bg-rose-50/70 backdrop-blur-md dark:border-rose-900/50 dark:bg-rose-950/40'
              : 'border-border bg-card/95 backdrop-blur-md'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                  tone === 'danger'
                    ? 'border-rose-300 bg-white text-rose-600 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400'
                    : 'border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
                )}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-sm sm:text-base font-semibold tracking-tight text-zinc-950 dark:text-white"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-100 text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>{children}</div>
      </div>
    </div>
  );
};
