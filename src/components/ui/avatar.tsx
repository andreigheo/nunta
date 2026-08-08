import * as React from "react";
import { cn, initials } from "@/lib/utils";

const palette = [
  "bg-brand-soft text-brand-strong dark:text-brand",
  "bg-accent-soft text-accent-strong",
  "bg-info-soft text-info",
  "bg-warning-soft text-warning",
  "bg-success-soft text-success",
  "bg-danger-soft text-danger",
];

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-7 text-[11px]",
    md: "size-9 text-[12.5px]",
    lg: "size-11 text-[14px]",
  };
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        sizes[size],
        palette[hash % palette.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  const visible = names.slice(0, max);
  const rest = names.length - visible.length;
  return (
    <span className="flex -space-x-2">
      {visible.map((n) => (
        <Avatar key={n} name={n} size="sm" className="ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-muted ring-2 ring-surface">
          +{rest}
        </span>
      )}
    </span>
  );
}
