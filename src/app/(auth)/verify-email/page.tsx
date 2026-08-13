"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailOpen } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { safeInternalPath } from "@/lib/account-routing";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [resent, setResent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [returnTo, setReturnTo] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const nextEmail = params.get("email") ?? sessionStorage.getItem("weddingos.pendingVerificationEmail") ?? "";
      const token = params.get("token");
      const nextReturnTo = safeInternalPath(
        params.get("returnTo") ?? sessionStorage.getItem("sarbato.registrationReturnTo"),
      );
      setReturnTo(nextReturnTo);
      setEmail(nextEmail);
      if (token) {
        setLoading(true);
        weddingOsApi
          .verifyEmail({ token })
          .then((result) => {
            const destination = result.returnTo ?? nextReturnTo;
            const params = new URLSearchParams({ verified: "1" });
            if (destination) params.set("returnTo", destination);
            router.replace(`/sign-in?${params.toString()}`);
          })
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
            const result = await weddingOsApi.verifyEmail({ email, code });
            const destination = result.returnTo ?? returnTo;
            const params = new URLSearchParams({ verified: "1" });
            if (destination) params.set("returnTo", destination);
            router.push(`/sign-in?${params.toString()}`);
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
          type="button"
          onClick={async () => {
            setError("");
            try {
              await weddingOsApi.requestEmailVerification(email);
              setResent(true);
            } catch (cause) {
              setError(apiErrorMessage(cause));
            }
          }}
          className="inline-flex min-h-11 cursor-pointer items-center px-2 font-medium text-brand hover:underline"
        >
          Retrimite emailul
        </button>
        <p className="text-muted">
          Adresă greșită?{" "}
          <Link href="/create-account" className="inline-flex min-h-11 items-center font-medium text-brand hover:underline">
            Schimbă emailul
          </Link>
        </p>
      </div>
    </div>
  );
}
