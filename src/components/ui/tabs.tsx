"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({ value: "", setValue: () => undefined });

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
  const current = value ?? internal;
  const setValue = React.useCallback(
    (v: string) => {
      setInternal(v);
      onValueChange?.(v);
    },
    [onValueChange],
  );
  return (
    <TabsContext.Provider value={{ value: current, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-subtle p-1 scrollbar-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  badge,
  className,
  disabled = false,
}: {
  value: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { value: current, setValue } = React.useContext(TabsContext);
  const active = current === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors",
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
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { value: current } = React.useContext(TabsContext);
  if (current !== value) return null;
  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
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
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
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
      aria-label={ariaLabel}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tones[tone], barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
