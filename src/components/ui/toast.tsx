"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, "id" | "variant"> & { variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue>({ toast: () => undefined });

export function useToast() {
  return React.useContext(ToastContext);
}

const icons: Record<ToastVariant, React.ElementType> = {
  default: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const iconTones: Record<ToastVariant, string> = {
  default: "text-faint",
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

const subscribeToHydration = () => () => undefined;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const hydrated = React.useSyncExternalStore(subscribeToHydration, () => true, () => false);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ variant = "default", ...rest }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, variant, ...rest }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {hydrated &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed inset-x-4 bottom-20 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]"
          >
            {toasts.map((t) => {
              const Icon = icons[t.variant];
              return (
                <div
                  key={t.id}
                  className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-line bg-elevated p-3.5 shadow-overlay"
                >
                  <Icon className={cn("mt-0.5 size-4.5 shrink-0", iconTones[t.variant])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.description}</p>}
                    {t.action && (
                      <button
                        type="button"
                        onClick={() => {
                          t.action!.onClick();
                          dismiss(t.id);
                        }}
                        className="mt-1.5 inline-flex min-h-11 items-center rounded-lg text-[13px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Închide notificarea"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
