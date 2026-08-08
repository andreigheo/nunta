"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailOpen } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import type { RegistrationIntent } from "@weddingos/contracts";
import {
  destinationForRegistration,
  inferredRegistrationIntent,
  safeInternalPath,
} from "@/lib/account-routing";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [resent, setResent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [destination, setDestination] = React.useState("/onboarding");
  const [changeEmailHref, setChangeEmailHref] = React.useState("/create-account");

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const nextEmail = params.get("email") ?? sessionStorage.getItem("weddingos.pendingVerificationEmail") ?? "";
      const token = params.get("token");
      const returnTo = safeInternalPath(
        params.get("returnTo") ?? sessionStorage.getItem("sarbato.returnTo"),
      );
      const storedIntent =
        params.get("intent") ?? sessionStorage.getItem("sarbato.registrationIntent");
      const intent =
        storedIntent === "SERVICE_PROVIDER" ||
        storedIntent === "INVITED_MEMBER" ||
        storedIntent === "EVENT_ORGANIZER"
          ? (storedIntent as RegistrationIntent)
          : inferredRegistrationIntent(returnTo) ?? "EVENT_ORGANIZER";
      const nextDestination = destinationForRegistration(intent, returnTo);
      setDestination(nextDestination);
      const createParams = new URLSearchParams({ intent });
      if (returnTo) createParams.set("returnTo", returnTo);
      setChangeEmailHref(`/create-account?${createParams.toString()}`);
      setEmail(nextEmail);
      if (token) {
        setLoading(true);
        weddingOsApi
          .verifyEmail({ token })
          .then(() =>
            router.replace(
              `/sign-in?verified=1&returnTo=${encodeURIComponent(nextDestination)}`,
            ),
          )
          .catch((cause) => setError(apiErrorMessage(cause)))
          .finally(() => setLoading(false));
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong dark:text-brand">
        <MailOpen className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Verifică-ți emailul"
        subtitle={<>Cererea pentru codul de confirmare către <span className="font-medium text-ink">{email || "adresa ta"}</span> este în coadă. Când emailul ajunge, introdu codul sau deschide linkul.</>}
      />

      {resent && <div className="mb-4 text-left"><AuthInfo message="Retrimiterea a fost pusă în coadă. După livrare, verifică și folderul Spam." /></div>}
      {error && <div className="mb-4 text-left"><AuthError message={error} /></div>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          try {
            await weddingOsApi.verifyEmail({ email, code });
            router.push(
              `/sign-in?verified=1&returnTo=${encodeURIComponent(destination)}`,
            );
          } catch (cause) {
            setError(apiErrorMessage(cause));
          } finally {
            setLoading(false);
          }
        }}
        className="space-y-4"
      >
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Cod din 6 cifre"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-13 text-center text-xl font-semibold tracking-[0.4em] tabular-nums"
          aria-label="Cod de verificare din 6 cifre"
        />
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.length < 6}>
          Confirmă emailul
        </Button>
      </form>

      <div className="mt-5 space-y-2 text-sm">
        <button
          onClick={async () => {
            setError("");
            try {
              await weddingOsApi.requestEmailVerification(email);
              setResent(true);
            } catch (cause) {
              setError(apiErrorMessage(cause));
            }
          }}
          className="cursor-pointer font-medium text-brand hover:underline"
        >
          Retrimite emailul
        </button>
        <p className="text-muted">
          Adresă greșită?{" "}
          <Link href={changeEmailHref} className="font-medium text-brand hover:underline">
            Schimbă emailul
          </Link>
        </p>
      </div>
    </div>
  );
}
