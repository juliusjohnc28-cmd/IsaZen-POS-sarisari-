import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastOptions {
  kind?: ToastKind;
  /** ms before it disappears (0 = stays until dismissed). */
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ToastApi {
  show: (text: string, options?: ToastOptions) => void;
  success: (text: string, options?: Omit<ToastOptions, 'kind'>) => void;
  error: (text: string, options?: Omit<ToastOptions, 'kind'>) => void;
  info: (text: string, options?: Omit<ToastOptions, 'kind'>) => void;
  /** A friendly replacement for window.confirm. Resolves true when the person taps the confirm button. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const STYLES: Record<ToastKind, { box: string; icon: React.ReactNode }> = {
  success: {
    box: 'bg-emerald-700 text-white',
    icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
  },
  error: {
    box: 'bg-rose-600 text-white',
    icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
  },
  info: {
    box: 'bg-slate-800 text-white',
    icon: <Info className="w-5 h-5 shrink-0" />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);
  const timers = useRef<Record<number, number>>({});

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (text: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const kind = options.kind ?? 'info';
      const duration = options.duration ?? (kind === 'error' ? 6000 : options.actionLabel ? 9000 : 3500);
      setToasts((prev) => [...prev.slice(-3), { ...options, id, text, kind }]);
      if (duration > 0) {
        timers.current[id] = window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ ...options, resolve });
      }),
    []
  );

  const closeDialog = (ok: boolean) => {
    dialog?.resolve(ok);
    setDialog(null);
  };

  // Escape closes the confirm dialog
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dialog.resolve(false);
        setDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const api: ToastApi = {
    show,
    success: (text, o) => show(text, { ...o, kind: 'success' }),
    error: (text, o) => show(text, { ...o, kind: 'error' }),
    info: (text, o) => show(text, { ...o, kind: 'info' }),
    confirm,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="fixed z-[80] inset-x-0 bottom-20 md:inset-x-auto md:bottom-auto md:top-4 md:right-4 md:w-[26rem] flex flex-col items-center md:items-end gap-2 px-3 md:px-0 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl text-sm font-bold ${STYLES[t.kind].box}`}
          >
            {STYLES[t.kind].icon}
            <span className="flex-1 min-w-0 break-words">{t.text}</span>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-black uppercase tracking-wide transition-colors"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="app-shell fixed inset-0 z-[90] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => closeDialog(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-base font-black text-slate-800">
              {dialog.title}
            </h3>
            {dialog.message && <p className="mt-1.5 text-sm text-slate-600">{dialog.message}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors"
              >
                {dialog.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeDialog(true)}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${
                  dialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {dialog.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
