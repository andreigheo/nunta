"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { loadPaddle, type PaddleEnvironment } from "@/lib/paddle";

type PublicPaddleConfiguration = {
  enabled: boolean;
  clientToken: string | null;
  environment: PaddleEnvironment;
};

export function PaddleCheckout({ transactionId }: { transactionId: string | null }) {
  const [state, setState] = React.useState<"idle" | "loading" | "opened" | "error">(
    transactionId ? "loading" : "idle",
  );
  const [message, setMessage] = React.useState<string | null>(null);

  const openCheckout = React.useCallback(async () => {
    if (!transactionId) return;
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/public/billing/paddle", {
        credentials: "omit",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Configurația Paddle nu este disponibilă.");
      const payload = (await response.json()) as {
        data: PublicPaddleConfiguration;
      };
      if (!payload.data.enabled || !payload.data.clientToken)
        throw new Error("Checkout-ul este momentan indisponibil.");
      const paddle = await loadPaddle(
        payload.data.clientToken,
        payload.data.environment,
      );
      paddle.Checkout.open({
        transactionId,
        settings: {
          displayMode: "overlay",
          theme: "light",
          successUrl: `${window.location.origin}/settings?tab=billing&checkout=success`,
        },
      });
      setState("opened");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Checkout-ul nu a putut fi deschis.",
      );
    }
  }, [transactionId]);

  React.useEffect(() => {
    if (!transactionId) return;
    const timeoutId = window.setTimeout(() => void openCheckout(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [openCheckout, transactionId]);

  return (
    <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-line bg-surface p-6 shadow-[0_24px_80px_rgba(24,56,47,0.12)] sm:p-9">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <CreditCard className="size-5" aria-hidden />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-accent">
        Abonament Sarbato
      </p>
      <h1 className="marketing-heading mt-3 text-4xl font-semibold leading-tight tracking-[-0.035em] text-brand sm:text-5xl">
        Plata rămâne în mediul securizat Paddle.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted">
        Sarbato primește doar confirmarea abonamentului și datele contabile ale
        tranzacției. Datele cardului nu trec prin serverele noastre.
      </p>

      <div className="mt-7 rounded-2xl border border-line bg-subtle p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-ink">
              {state === "loading"
                ? "Deschidem checkout-ul…"
                : state === "opened"
                  ? "Checkout-ul este deschis"
                  : state === "error"
                    ? "Checkout-ul nu s-a deschis"
                    : "Nu există o tranzacție de deschis"}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted">
              {message ??
                (transactionId
                  ? "Dacă ai închis fereastra Paddle, o poți redeschide de aici."
                  : "Pornește alegerea planului din Setări → Abonament.")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {transactionId ? (
          <button
            type="button"
            onClick={() => void openCheckout()}
            disabled={state === "loading"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand transition hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className="size-4" aria-hidden />
            {state === "loading" ? "Se deschide…" : "Redeschide checkout-ul"}
          </button>
        ) : null}
        <Link
          href="/settings?tab=billing"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand-softer"
        >
          Mergi la abonament
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
