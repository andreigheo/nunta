"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { AuthHeading } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      er.password = "Folosește minim 8 caractere, o majusculă și o cifră.";
    }
    if (confirm !== password) er.confirm = "Parolele nu coincid.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFormError("Linkul de resetare lipsește sau nu este valid.");
      setLoading(false);
      return;
    }
    setFormError("");
    try {
      await weddingOsApi.resetPassword(token, password);
      router.push("/sign-in?passwordReset=1");
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
        {formError && <AuthError message={formError} />}
        <Field label="Parolă nouă" error={errors.password}>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} placeholder="••••••••" />
        </Field>
        <Field label="Confirmă parola nouă" error={errors.confirm}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={!!errors.confirm} placeholder="••••••••" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Salvează parola nouă
        </Button>
      </form>
    </div>
  );
}
