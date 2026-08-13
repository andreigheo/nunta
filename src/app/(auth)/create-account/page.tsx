"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarHeart, MailCheck } from "lucide-react";
import type { RegistrationIntent } from "@weddingos/contracts";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { AuthHeading, Divider, SocialButtons } from "@/components/auth/auth-bits";
import { AuthError } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { TERMS_VERSION } from "@weddingos/contracts";
import {
  registrationIntentForEntry,
  safeInternalPath,
} from "@/lib/account-routing";

const paths: Array<{
  value: RegistrationIntent;
  title: string;
  description: string;
  icon: typeof CalendarHeart;
}> = [
  {
    value: "EVENT_ORGANIZER",
    title: "Organizez un eveniment",
    description: "Plan, invitații, furnizori, buget și ziua evenimentului.",
    icon: CalendarHeart,
  },
  {
    value: "SERVICE_PROVIDER",
    title: "Ofer servicii pentru evenimente",
    description: "Profil, servicii, cereri, oferte, rezervări și contracte.",
    icon: BriefcaseBusiness,
  },
  {
    value: "INVITED_MEMBER",
    title: "Am primit o invitație",
    description: "Intru cu rolul și accesul stabilite de organizator.",
    icon: MailCheck,
  },
];

export default function CreateAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [values, setValues] = React.useState({ firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [terms, setTerms] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const returnTo = safeInternalPath(searchParams.get("returnTo"));
  const queryIntent = searchParams.get("intent");
  const [intent, setIntent] = React.useState<RegistrationIntent | null>(() =>
    registrationIntentForEntry(returnTo, queryIntent),
  );

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!values.firstName.trim()) er.firstName = "Prenumele este obligatoriu.";
    if (!values.lastName.trim()) er.lastName = "Numele este obligatoriu.";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) er.email = "Introdu o adresă de email validă.";
    if (values.password.length < 8 || !/[A-Z]/.test(values.password) || !/\d/.test(values.password)) {
      er.password = "Folosește minim 8 caractere, o majusculă și o cifră.";
    }
    if (values.confirm !== values.password) er.confirm = "Parolele nu coincid.";
    if (!terms) er.terms = "Trebuie să accepți termenii pentru a continua.";
    if (!intent) er.intent = "Alege cum vei folosi Sarbato.";
    setErrors(er);
    if (Object.keys(er).length) return;

    setLoading(true);
    setFormError("");
    try {
      await weddingOsApi.register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        acceptedTermsVersion: TERMS_VERSION,
        marketingConsent: marketing,
        registrationIntent: intent!,
        returnTo: returnTo ?? undefined,
      });
      sessionStorage.setItem("weddingos.pendingVerificationEmail", values.email.trim().toLowerCase());
      sessionStorage.setItem("sarbato.registrationIntent", intent!);
      if (returnTo)
        sessionStorage.setItem("sarbato.registrationReturnTo", returnTo);
      const params = new URLSearchParams({
        email: values.email.trim().toLowerCase(),
        intent: intent!,
      });
      if (returnTo) params.set("returnTo", returnTo);
      router.push(`/verify-email?${params.toString()}`);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const strength = values.password.length === 0 ? 0 : values.password.length < 8 ? 1 : /[A-Z]/.test(values.password) && /\d/.test(values.password) ? 3 : 2;

  return (
    <div>
      <AuthHeading title="Creează-ți contul" subtitle="Alege traseul potrivit. Același cont poate avea ulterior mai multe roluri." />

      <div className="space-y-4">
        <SocialButtons mode="signup" />
        <Divider label="sau cu email" />

        {formError && <AuthError message={formError} />}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">
              Cum folosești Sarbato?
            </legend>
            <div className="grid gap-2">
              {paths.map((path) => {
                const selected = intent === path.value;
                const Icon = path.icon;
                return (
                  <button
                    key={path.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setIntent(path.value)}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      selected
                        ? "border-brand bg-brand-soft text-brand-strong"
                        : "border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle"
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background">
                      <Icon className="size-4.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{path.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                        {path.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.intent ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {errors.intent}
              </p>
            ) : null}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prenume" error={errors.firstName}>
              <Input autoComplete="given-name" value={values.firstName} onChange={set("firstName")} invalid={!!errors.firstName} placeholder="Ana" />
            </Field>
            <Field label="Nume" error={errors.lastName}>
              <Input autoComplete="family-name" value={values.lastName} onChange={set("lastName")} invalid={!!errors.lastName} placeholder="Dumitrescu" />
            </Field>
          </div>
          <Field label="Email" error={errors.email}>
            <Input type="email" autoComplete="email" value={values.email} onChange={set("email")} invalid={!!errors.email} placeholder="ana@email.com" />
          </Field>
          <Field label="Parolă" error={errors.password} hint={!errors.password && values.password ? undefined : "Minim 8 caractere, ideal cu majuscule și cifre."}>
            <Input type="password" autoComplete="new-password" value={values.password} onChange={set("password")} invalid={!!errors.password} placeholder="••••••••" />
            {values.password.length > 0 && (
              <div className="mt-2 flex items-center gap-2" aria-hidden>
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= strength ? (strength === 1 ? "bg-danger" : strength === 2 ? "bg-warning" : "bg-success") : "bg-subtle"}`}
                  />
                ))}
                <span className="text-[11px] text-faint">{strength === 1 ? "slabă" : strength === 2 ? "bună" : strength === 3 ? "excelentă" : ""}</span>
              </div>
            )}
          </Field>
          <Field label="Confirmă parola" error={errors.confirm}>
            <Input type="password" autoComplete="new-password" value={values.confirm} onChange={set("confirm")} invalid={!!errors.confirm} placeholder="••••••••" />
          </Field>

          <div className="space-y-2.5">
            <div>
              <Checkbox
                checked={terms}
                onCheckedChange={setTerms}
                label="Accept Termenii și Politica de confidențialitate"
              />
              {errors.terms && <p role="alert" className="mt-1 text-xs text-danger">{errors.terms}</p>}
            </div>
            <Checkbox
              checked={marketing}
              onCheckedChange={setMarketing}
              label="Vreau sfaturi de planificare pe email (opțional)"
            />
          </div>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Creează contul
          </Button>
        </form>

        <p className="text-center text-sm text-muted">
          Ai deja un cont?{" "}
          <Link href={returnTo ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/sign-in"} className="font-semibold text-brand hover:underline">
            Conectează-te
          </Link>
        </p>
      </div>
    </div>
  );
}
