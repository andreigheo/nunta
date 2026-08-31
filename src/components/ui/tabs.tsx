"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  setValue: () => undefined,
  baseId: "tabs",
});

function tabDomId(baseId: string, kind: "tab" | "panel", value: string) {
  return [baseId, kind, encodeURIComponent(value)].join("-");
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const generatedId = React.useId();
  const current = value ?? internal;
  const setValue = React.useCallback(
    (v: string) => {
      setInternal(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId: generatedId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    if (tabs.length === 0) return;
    const focusedTab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    const selectedIndex = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    const currentIndex = Math.max(0, focusedTab ? tabs.indexOf(focusedTab) : selectedIndex);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };

  return (
    <div
      {...props}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-subtle p-1 scrollbar-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  badge?: React.ReactNode;
}

export function TabsTrigger({
  value,
  children,
  badge,
  className,
  disabled = false,
  id,
  tabIndex,
  onClick,
  type,
  "aria-controls": ariaControls,
  ...props
}: TabsTriggerProps) {
  const { value: current, setValue, baseId } = React.useContext(TabsContext);
  const active = current === value;
  return (
    <button
      {...props}
      id={id ?? tabDomId(baseId, "tab", value)}
      type={type ?? "button"}
      role="tab"
      aria-selected={active}
      aria-controls={ariaControls ?? tabDomId(baseId, "panel", value)}
      tabIndex={tabIndex ?? (active ? 0 : -1)}
      data-tabs-trigger=""
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setValue(value);
      }}
      className={cn(
        "inline-flex h-11 min-h-11 min-w-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active ? "bg-elevated text-ink shadow-card" : "text-muted hover:text-ink",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {children}
      {badge}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
  id,
  tabIndex,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: current, baseId } = React.useContext(TabsContext);
  if (current !== value) return null;
  return (
    <div
      {...props}
      id={id ?? tabDomId(baseId, "panel", value)}
      role="tabpanel"
      aria-labelledby={ariaLabelledBy ?? tabDomId(baseId, "tab", value)}
      tabIndex={tabIndex ?? 0}
      className={cn(className)}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

export function Progress({
  value,
  max = 100,
  tone = "brand",
  className,
  barClassName,
  "aria-label": ariaLabel,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "accent" | "success" | "warning" | "danger";
  className?: string;
  barClassName?: string;
  "aria-label"?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const tones = {
    brand: "bg-brand",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? "Progres"}
      aria-valuetext={`${Math.round(pct)}%`}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tones[tone], barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
