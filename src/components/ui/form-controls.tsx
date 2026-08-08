"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Checkbox                                                           */
/* ------------------------------------------------------------------ */

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2.5 text-left text-sm text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          checked
            ? "border-brand bg-brand text-on-brand"
            : "border-line-strong bg-surface hover:border-brand",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} aria-hidden />}
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Switch                                                             */
/* ------------------------------------------------------------------ */

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const generatedId = React.useId();
  const labelId = label ? `switch-${generatedId}-label` : undefined;
  const descriptionId = description
    ? `switch-${generatedId}-description`
    : undefined;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : (ariaLabel ?? "Comutator")}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "cursor-pointer rounded-lg text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        label
          ? "flex min-h-11 w-full items-center justify-between gap-4 py-2"
          : "inline-flex size-11 items-center justify-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {label && (
        <span className="min-w-0">
          <span id={labelId} className="block text-sm font-medium text-ink">
            {label}
          </span>
          {description && (
            <span
              id={descriptionId}
              className="mt-0.5 block text-[13px] text-muted"
            >
              {description}
            </span>
          )}
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "inline-block size-[18px] transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-[3px]",
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Segmented control                                                  */
/* ------------------------------------------------------------------ */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: Array<{
    value: T;
    label: React.ReactNode;
    icon?: React.ReactNode;
    ariaLabel?: string;
  }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    if (buttons.length === 0) return;
    const currentIndex = Math.max(
      0,
      buttons.indexOf(document.activeElement as HTMLButtonElement),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (currentIndex + 1) % buttons.length
            : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    onChange(options[nextIndex].value);
    buttons[nextIndex].focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-subtle p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-11 px-2.5 text-xs" : "h-11 px-3 text-[13px]",
              active
                ? "bg-elevated text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
