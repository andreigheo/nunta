import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "bg-subtle text-muted",
  brand: "bg-brand-soft text-brand-strong dark:text-brand",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  outline: "border border-line text-muted",
};

export function Badge({
  className,
  variant = "neutral",
  dot = false,
  children,
}: {
  className?: string;
  variant?: BadgeVariant;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Numeric counter badge for navigation. */
export function CountBadge({
  count,
  tone = "brand",
  className,
}: {
  count: number;
  tone?: "danger" | "warning" | "brand" | "neutral";
  className?: string;
}) {
  if (!count) return null;
  const tones = {
    danger: "bg-danger text-on-danger",
    warning: "bg-warning text-on-warning",
    brand: "bg-brand text-on-brand",
    neutral: "bg-subtle text-muted",
  };
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        tones[tone],
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
