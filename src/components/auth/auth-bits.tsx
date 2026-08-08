"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type AuthActionLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "outline" | "ghost";
};

const authActionLinkVariants = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "bg-subtle text-ink hover:bg-sunken",
  outline: "border border-line bg-surface text-ink hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
} as const;

/** A semantic link with the same local action hierarchy as auth buttons. */
export function AuthActionLink({
  className,
  variant = "primary",
  ...props
}: AuthActionLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-center text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        authActionLinkVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-line" aria-hidden />
      <span className="text-xs font-medium text-faint">{label}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-7 text-center">
      <h1 className="font-brand text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink text-balance">{title}</h1>
      {subtitle && <p className="mx-auto mt-2 max-w-[38rem] text-[15px] leading-6 text-muted">{subtitle}</p>}
    </div>
  );
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/60 px-4 py-3 text-sm text-danger dark:bg-danger-soft/25">
      {message}
    </div>
  );
}

export function AuthInfo({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="status" className="rounded-xl border border-info/30 bg-info-soft/60 px-4 py-3 text-sm text-info dark:bg-info-soft/25">
      {message}
    </div>
  );
}
