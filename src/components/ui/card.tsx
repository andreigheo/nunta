import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  const keyboardInteractive = Boolean(interactive && onClick);
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <div
      role={role ?? (keyboardInteractive ? "button" : undefined)}
      tabIndex={tabIndex ?? (keyboardInteractive ? 0 : undefined)}
      onClick={onClick}
      onKeyDown={keyboardInteractive ? handleKeyDown : onKeyDown}
      className={cn(
        "rounded-xl border border-line bg-surface",
        interactive &&
          "min-h-11 cursor-pointer transition-[transform,border-color,background-color] hover:-translate-y-px hover:border-line-strong hover:bg-brand-softer/35 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6 sm:pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-brand text-lg font-semibold leading-tight tracking-[-0.015em] text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-[13px] text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-line px-5 py-3", className)}
      {...props}
    />
  );
}
