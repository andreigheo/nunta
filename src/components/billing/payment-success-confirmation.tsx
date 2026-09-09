"use client";

import { Check, Coins, X } from "lucide-react";
import type { BillingSuccessNotice } from "@/lib/billing-success";
import styles from "./payment-success-confirmation.module.css";

export function PaymentSuccessConfirmation({
  notice,
  onDismiss,
  onViewCredits,
}: {
  notice: BillingSuccessNotice;
  onDismiss: () => void;
  onViewCredits: () => void;
}) {
  return (
    <section
      className={`${styles.panel} rounded-xl border border-success/25 bg-success-soft/45 p-5 sm:p-6`}
      role="status"
      aria-live="polite"
      aria-label="Confirmare plată"
    >
      <span className={styles.thread} aria-hidden />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Închide confirmarea plății"
        className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <span
          className={`${styles.icon} inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-success text-white`}
          aria-hidden
        >
          <Check className="size-5" strokeWidth={3} />
        </span>
        <div className={styles.content}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-success">
            {notice.kind === "subscription"
              ? "Plată confirmată"
              : "Credite adăugate"}
          </p>
          <h2 className="mt-1 font-brand text-xl font-semibold text-ink sm:text-2xl">
            {notice.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            {notice.description}
          </p>
        </div>
      </div>

      <div
        className={`${styles.content} mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center`}
      >
        <div className="rounded-lg bg-surface/75 px-4 py-3">
          <p className="text-xl font-semibold tabular-nums text-ink">
            {notice.primaryValue}
          </p>
          <p className="text-xs text-muted">{notice.primaryLabel}</p>
        </div>
        <div className="rounded-lg bg-surface/75 px-4 py-3">
          <p className="text-xl font-semibold tabular-nums text-ink">
            {notice.secondaryValue}
          </p>
          <p className="text-xs text-muted">{notice.secondaryLabel}</p>
        </div>
        <button
          type="button"
          onClick={onViewCredits}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand transition-colors hover:bg-surface/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Coins className="size-4" aria-hidden />
          Vezi soldul
        </button>
      </div>
    </section>
  );
}
