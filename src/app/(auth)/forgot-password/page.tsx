"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { AuthActionLink, AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { safeInternalPath } from "@/lib/account-routing";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const returnTo = safeInternalPath(searchParams.get("returnTo"));
  const signInHref = returnTo
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Introdu o adresă de email validă.");
      return;
    }
    setError("");
    setLoading(true);
    setFormError("");
    try {
      await weddingOsApi.requestPasswordReset(email, returnTo);
      setSent(true);
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong dark:text-brand">
        <KeyRound className="size-7" aria-hidden />
      </span>
      <AuthHeading title="Resetează-ți parola" subtitle="Îți trimitem un link de resetare valabil 30 de minute." />

      {sent ? (
        <div className="space-y-4">
          <AuthInfo message={`Dacă există un cont pentru ${email}, cererea de livrare a linkului a fost pusă în coadă.`} />
          <AuthActionLink href={signInHref} variant="outline">
            Înapoi la conectare
          </AuthActionLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <AuthError message={formError} />}
          <Field label="Email" error={error}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} placeholder="ana@email.com" autoComplete="email" />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Trimite linkul de resetare
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Ți-ai amintit parola?{" "}
        <Link href={signInHref} className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
          Înapoi la conectare
        </Link>
      </p>
    </div>
  );
}
