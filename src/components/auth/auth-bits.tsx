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

export function SocialButtons({ mode }: { mode: "signin" | "signup" }) {
  const label = mode === "signin" ? "Continuă cu" : "Înscrie-te cu";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          disabled
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-muted opacity-70"
        >
          <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1l-3.9 2.9C2.3 21.2 7.3 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-2.9 3.6-5 6.8-5z" />
          </svg>
          {label} Google · în curând
        </button>
        <button
          type="button"
          disabled
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-background opacity-60 dark:border dark:border-line dark:bg-elevated dark:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-4.5 fill-current" aria-hidden>
            <path d="M17.05 20.28c-.98.95-2.05.86-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.98-.2 1.92-.86 3.24-.77 1.58.13 2.77.75 3.55 1.9-3.27 1.96-2.5 6.27.53 7.5-.59 1.56-1.35 3.11-2.4 3.54zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          {label} Apple · în curând
        </button>
      </div>
      <p className="text-center text-xs leading-relaxed text-faint">
        Autentificarea socială nu este încă activă. Folosește emailul și parola.
      </p>
    </div>
  );
}

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
