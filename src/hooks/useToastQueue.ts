import { useCallback, useState } from 'react';

export interface ToastNotice {
  id: string;
  title: string;
  subtitle?: string;
  tone: 'emerald' | 'amber' | 'indigo' | 'rose';
}

/**
 * Manages transient toast notifications (capped at 3 visible items, auto-dismissed after 3.8s).
 */
export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const pushToast = useCallback((notice: Omit<ToastNotice, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { ...notice, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return { toasts, pushToast };
}
