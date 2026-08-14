"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { AuthHeading } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const token = searchParams.get("token") ?? "";
  const missingToken = token
    ? ""
    : "Linkul de resetare este incomplet. Solicită un link nou.";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      er.password =
        "Folosește minim 8 caractere, o literă mică, o majusculă și o cifră.";
    }
    if (confirm !== password) er.confirm = "Parolele nu coincid.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    if (!token) {
      setFormError(missingToken);
      setLoading(false);
      return;
    }
    setFormError("");
    try {
      const result = await weddingOsApi.resetPassword(token, password);
      const params = new URLSearchParams({ passwordReset: "1" });
      if (result.returnTo) params.set("returnTo", result.returnTo);
      router.push(`/sign-in?${params.toString()}`);
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <AuthHeading title="Alege o parolă nouă" subtitle="Linkul securizat verifică identitatea contului tău." />
      <form onSubmit={submit} className="space-y-4" noValidate>
        {(formError || missingToken) && <AuthError message={formError || missingToken} />}
        <Field label="Parolă nouă" error={errors.password}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} placeholder="••••••••" />
        </Field>
        <Field label="Confirmă parola nouă" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} placeholder="••••••••" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!token}>
          Salvează parola nouă
        </Button>
      </form>
    </div>
  );
}
