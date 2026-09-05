"use client";

import * as React from "react";
import Link from "next/link";
import type { RegistrationIntent } from "@weddingos/contracts";
import { cn } from "@/lib/utils";

type AuthActionLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "outline" | "ghost";
};

const authActionLinkVariants = {
  primary: "bg-action text-on-action hover:bg-action-hover",
  secondary: "bg-subtle text-ink hover:bg-sunken",
  outline: "border border-line bg-surface text-ink hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-ink",
} as const;

export function SocialButtons({
  mode,
  returnTo,
  registrationIntent,
  termsAccepted = false,
  marketingConsent = false,
}: {
  mode: "sign-in" | "register";
  returnTo?: string | null;
  registrationIntent?: RegistrationIntent | null;
  termsAccepted?: boolean;
  marketingConsent?: boolean;
}) {
  const registrationReady =
    mode === "sign-in" || (termsAccepted && Boolean(registrationIntent));
  const content = (
    <>
      <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
        <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1l-3.9 2.9C2.3 21.2 7.3 24 12 24z" />
        <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
        <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-2.9 3.6-5 6.8-5z" />
      </svg>
      Continuă cu Google
    </>
  );
  return (
    <div>
      {registrationReady ? (
        <form action="/api/v1/auth/google" method="post">
          <input type="hidden" name="mode" value={mode} />
          {returnTo ? (
            <input type="hidden" name="returnTo" value={returnTo} />
          ) : null}
          {mode === "register" && registrationIntent ? (
            <>
              <input
                type="hidden"
                name="intent"
                value={registrationIntent}
              />
              <input type="hidden" name="terms" value="1" />
              <input
                type="hidden"
                name="marketing"
                value={marketingConsent ? "1" : "0"}
              />
            </>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {content}
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled
          aria-describedby="google-registration-requirements"
          className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-muted opacity-65"
        >
          {content}
        </button>
      )}
      {!registrationReady ? (
        <p
          id="google-registration-requirements"
          className="mt-1.5 text-center text-xs text-faint"
        >
          Alege traseul și acceptă termenii pentru a continua cu Google.
        </p>
      ) : null}
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
    <div className="mb-6 text-center">
      <h1 className="font-brand text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink text-balance">{title}</h1>
      {subtitle && <p className="mx-auto mt-2 max-w-[36rem] text-[15px] leading-6 text-muted text-pretty">{subtitle}</p>}
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
