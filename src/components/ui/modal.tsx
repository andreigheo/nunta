"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared overlay primitives                                          */
/* ------------------------------------------------------------------ */

function useDialogA11y(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.body.style.overflow = "hidden";

    const firstField = ref.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled):not([data-dialog-close])',
    );
    (firstField ?? ref.current)?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open, onClose, ref]);
}

const subscribeToHydration = () => () => undefined;

function Portal({ children }: { children: React.ReactNode }) {
  const hydrated = React.useSyncExternalStore(subscribeToHydration, () => true, () => false);
  if (!hydrated) return null;
  return createPortal(children, document.body);
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  hideClose,
  "aria-label": ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideClose?: boolean;
  "aria-label"?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const titleId = `modal-${generatedId}-title`;
  const descriptionId = `modal-${generatedId}-description`;
  useDialogA11y(open, onClose, ref);
  if (!open) return null;

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[min(96vw,1200px)]",
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div
          className="absolute inset-0 animate-fade-in bg-[var(--overlay)] backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title ? undefined : ariaLabel ?? "Fereastră de dialog"}
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-2xl border border-line bg-elevated shadow-overlay sm:rounded-2xl",
            sizes[size],
          )}
        >
          {(title || description || !hideClose) && (
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                {title && <h2 id={titleId} className="font-brand text-lg font-semibold tracking-tight text-ink">{title}</h2>}
                {description && <p id={descriptionId} className="mt-0.5 text-[13px] text-muted">{description}</p>}
              </div>
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  data-dialog-close
                  aria-label="Închide"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <X className="size-4.5" aria-hidden />
                </button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  description,
  width = "md",
  children,
  footer,
  headerActions,
  "aria-label": ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  width?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  "aria-label"?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const titleId = `drawer-${generatedId}-title`;
  const descriptionId = `drawer-${generatedId}-description`;
  useDialogA11y(open, onClose, ref);
  if (!open) return null;

  const widths = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-xl",
    xl: "sm:max-w-2xl",
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div
          className="absolute inset-0 animate-fade-in bg-[var(--overlay)] backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title ? undefined : ariaLabel ?? "Panou lateral"}
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col border-l border-line bg-elevated shadow-overlay",
            widths[width],
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              {typeof title === "string" ? (
                <h2 id={titleId} className="font-brand text-lg font-semibold tracking-tight text-ink">{title}</h2>
              ) : (
                title && <div id={titleId}>{title}</div>
              )}
              {description && <p id={descriptionId} className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                data-dialog-close
                aria-label="Închide"
                className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation dialog                                                */
/* ------------------------------------------------------------------ */

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireTypedConfirmation?: string;
  loading?: boolean;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  return <ConfirmDialogContent key={props.open ? "open" : "closed"} {...props} />;
}

function ConfirmDialogContent({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmă",
  cancelLabel = "Renunță",
  destructive = false,
  requireTypedConfirmation,
  loading = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState("");

  const canConfirm = !requireTypedConfirmation || typed.trim().toLowerCase() === requireTypedConfirmation.toLowerCase();

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className={
              destructive
                ? "inline-flex h-11 items-center rounded-lg bg-danger px-4 text-sm font-medium text-on-danger transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                : "inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {loading ? "Se procesează…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{description}</p>
      {requireTypedConfirmation && (
        <div className="mt-4">
          <label htmlFor="typed-confirm" className="text-[13px] font-medium text-ink">
            Tastează <span className="font-semibold text-danger">„{requireTypedConfirmation}”</span> pentru a confirma
          </label>
          <input
            id="typed-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus-visible:border-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-danger/40"
            autoComplete="off"
          />
        </div>
      )}
    </Modal>
  );
}
