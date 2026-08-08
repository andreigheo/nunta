"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Wand2 } from "lucide-react";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { AuthError, AuthHeading, AuthInfo, Divider, SocialButtons } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import {
  destinationAfterAuthentication,
  inferredRegistrationIntent,
  safeInternalPath,
} from "@/lib/account-routing";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true";
  const returnTo = safeInternalPath(searchParams.get("returnTo"));
  const registrationHref = React.useMemo(() => {
    if (!returnTo) return "/create-account";
    const next = new URLSearchParams({ returnTo });
    const intent = inferredRegistrationIntent(returnTo);
    if (intent) next.set("intent", intent);
    return `/create-account?${next.toString()}`;
  }, [returnTo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setInfo("");
    const er: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) er.email = "Introdu o adresă de email validă.";
    if (password.length < 6) er.password = "Parola trebuie să aibă cel puțin 6 caractere.";
    setErrors(er);
    if (Object.keys(er).length) return;

    setLoading(true);
    try {
      await weddingOsApi.signIn(email, password, remember);
      const [currentUser, workspaces] = await Promise.all([
        weddingOsApi.me(),
        weddingOsApi.workspaces(),
      ]);
      const destination = destinationAfterAuthentication({
        returnTo,
        registrationIntent: currentUser.preferences.registrationIntent,
        workspaceCount: workspaces.length,
        hasVendorOrganizations: currentUser.contexts.vendorOrganizations,
        hasPlatformAccess: currentUser.contexts.platform,
      });

      // The HttpOnly cookie changed during this request. A full navigation
      // makes every server boundary evaluate the new session consistently.
      window.location.assign(destination);
    } catch (error) {
      setFormError(apiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <AuthHeading title="Bine ai revenit" subtitle="Conectează-te la evenimentele, invitațiile sau serviciile tale." />

      <div className="space-y-4">
        <SocialButtons mode="signin" />
        <Divider label="sau cu email" />

        {formError && <AuthError message={formError} />}
        {info && <AuthInfo message={info} />}

        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="ana@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!errors.email}
              icon={<Mail className="size-4" />}
            />
          </Field>
          <Field label="Parolă" error={errors.password}>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={!!errors.password}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition-colors hover:bg-subtle hover:text-ink"
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </Field>

          <div className="flex items-center justify-between">
            <Checkbox checked={remember} onCheckedChange={setRemember} label="Ține-mă conectat" />
            <Link href="/forgot-password" className="text-[13px] font-medium text-brand hover:underline">
              Ai uitat parola?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Conectează-te
          </Button>
        </form>

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={async () => {
            setFormError("");
            if (!/^\S+@\S+\.\S+$/.test(email)) {
              setErrors({ email: "Introdu adresa de email pentru linkul magic." });
              return;
            }
            try {
              await weddingOsApi.requestMagicLink(email);
              setInfo("Dacă există un cont verificat, livrarea linkului magic a fost pusă în coadă.");
            } catch (error) {
              setFormError(apiErrorMessage(error));
            }
          }}
        >
          <Wand2 className="size-4 text-accent" aria-hidden />
          Trimite-mi un link magic
        </Button>

        <Divider label="nou aici?" />

        <div className="grid gap-2.5">
          <Link href={registrationHref} className="w-full">
            <Button variant="secondary" size="lg" className="w-full">
              Creează un cont
            </Button>
          </Link>
          {demoEnabled && (
            <button
              onClick={() => {
                document.cookie = "weddingos_demo=1; Path=/; Max-Age=28800; SameSite=Lax";
                router.push("/overview?demo=1");
              }}
              className="w-full cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              Încearcă demo-ul fără cont →
            </button>
          )}
        </div>

        <p className="text-center text-xs leading-relaxed text-faint">
          Autentificarea folosește o sesiune securizată HttpOnly. Modul demo este izolat și nu scrie în conturile reale.
        </p>
      </div>
    </div>
  );
}
