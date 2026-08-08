"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  href,
  onClick,
  tone = "default",
  footer,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down"; good?: boolean };
  href?: string;
  onClick?: () => void;
  tone?: "default" | "warning" | "danger";
  footer?: React.ReactNode;
  className?: string;
}) {
  const clickable = Boolean(href || onClick);
  const classes = cn(
    "group block w-full rounded-xl bg-subtle/65 p-4 text-left transition-[transform,background-color]",
    clickable &&
      "cursor-pointer hover:-translate-y-px hover:bg-brand-softer focus-visible:bg-brand-softer",
    className,
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-lg",
              tone === "danger" && "bg-danger-soft text-danger",
              tone === "warning" && "bg-warning-soft text-warning",
              tone === "default" && "bg-brand-soft text-brand-strong dark:text-brand",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums">{value}</p>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              trend.good === false ? "text-danger" : trend.good === true ? "text-success" : "text-faint",
            )}
          >
            {trend.direction === "up" ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden />
            )}
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-faint">{hint}</p>}
      {footer}
      {clickable && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
          Deschide <ArrowRight className="size-3" aria-hidden />
        </span>
      )}
    </>
  );
  if (href)
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  return <div className={classes}>{content}</div>;
}
