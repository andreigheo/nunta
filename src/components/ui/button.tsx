import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "destructive-outline"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-action text-on-action hover:bg-action-hover active:bg-action-hover disabled:bg-action/50",
  accent:
    "bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-strong disabled:bg-accent/50",
  secondary:
    "bg-subtle text-ink hover:bg-sunken active:bg-sunken disabled:text-faint",
  outline:
    "border border-line bg-surface text-ink hover:bg-subtle active:bg-subtle disabled:text-faint",
  ghost:
    "text-muted hover:bg-subtle hover:text-ink active:bg-sunken disabled:text-faint",
  destructive:
    "bg-danger text-on-danger hover:brightness-110 active:brightness-95 disabled:bg-danger/50",
  "destructive-outline":
    "border border-danger/40 bg-surface text-danger hover:bg-danger-soft disabled:text-danger/50",
  link: "text-brand underline-offset-4 hover:underline disabled:text-faint",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-11 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-[15px]",
  icon: "size-11 rounded-lg",
  "icon-sm": "size-11 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
