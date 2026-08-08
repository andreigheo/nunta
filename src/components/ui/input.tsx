import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Label + field wrapper                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, icon, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden>
            {icon}
          </span>
          <input
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cn(inputClasses(invalid), "pl-9", className)}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputClasses(invalid), className)}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

function inputClasses(invalid?: boolean) {
  return cn(
    "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink shadow-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-ring/0 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-faint",
    invalid ? "border-danger/60 focus:border-danger" : "border-line",
  );
}

/* ------------------------------------------------------------------ */
/*  Textarea                                                           */
/* ------------------------------------------------------------------ */

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "min-h-[88px] w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-strong focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle",
      invalid ? "border-danger/60" : "border-line",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/* ------------------------------------------------------------------ */
/*  Select (native, styled)                                            */
/* ------------------------------------------------------------------ */

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-10 w-full cursor-pointer appearance-none rounded-lg border bg-surface bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2386867f%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat px-3 pr-9 text-sm text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle",
      invalid ? "border-danger/60" : "border-line",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

/* ------------------------------------------------------------------ */
/*  Currency input                                                     */
/* ------------------------------------------------------------------ */

export const CurrencyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <input
        ref={ref}
        inputMode="numeric"
        className={cn(inputClasses(), "pr-12 text-right tabular-nums", className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-faint">
        RON
      </span>
    </div>
  ),
);
CurrencyInput.displayName = "CurrencyInput";
