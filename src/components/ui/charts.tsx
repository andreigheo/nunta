import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Donut chart                                                        */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 140,
  thickness = 16,
  centerLabel,
  centerValue,
  className,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--subtle)"
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const offset = segments
            .slice(0, i)
            .reduce((sum, segment) => sum + (segment.value / total) * circumference, 0);
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
        })}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && (
            <span className="text-xl font-semibold tracking-tight text-ink tabular-nums">{centerValue}</span>
          )}
          {centerLabel && <span className="max-w-[80px] text-[11px] leading-tight text-faint">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function DonutLegend({
  items,
  className,
}: {
  items: Array<{ color: string; label: string; value: string }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[13px]">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          <span className="flex-1 text-muted">{item.label}</span>
          <span className="font-medium text-ink tabular-nums">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Horizontal bar list                                                */
/* ------------------------------------------------------------------ */

export function BarList({
  items,
  max,
  className,
}: {
  items: Array<{ label: string; value: number; formatted: string; tone?: "brand" | "accent" | "sage" }>;
  max?: number;
  className?: string;
}) {
  const maxValue = max ?? Math.max(...items.map((i) => i.value), 1);
  const tones = { brand: "bg-brand", accent: "bg-accent", sage: "bg-sage" };
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate text-muted">{item.label}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{item.formatted}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <div
              className={cn("h-full rounded-full", tones[item.tone ?? "brand"])}
              style={{ width: `${Math.min(100, (item.value / maxValue) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline (area)                                                   */
/* ------------------------------------------------------------------ */

export function Sparkline({
  points,
  width = 120,
  height = 36,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - 4 - ((p - min) / range) * (height - 8)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <path d={area} fill="var(--brand-soft)" />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
