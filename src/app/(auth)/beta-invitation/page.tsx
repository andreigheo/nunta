"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { AuthError, AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { Button, Checkbox, Switch } from "@/components/ui";
import { ApiClientError, apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export default function BetaInvitationPage() {
  const router = useRouter();
  const [token, setToken] = React.useState("");
  const [terms, setTerms] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(false);
  const [limitations, setLimitations] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setToken(
          new URLSearchParams(window.location.search).get("token") ?? "",
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const accept = async () => {
    if (!token) {
      setError("Linkul beta este incomplet: lipsește tokenul invitației.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await weddingOsApi.acceptBetaInvitation(token, analytics);
      router.push("/beta");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        router.push(
          `/sign-in?returnTo=${encodeURIComponent(`/beta-invitation?token=${token}`)}`,
        );
        return;
      }
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const requiredAccepted = terms && privacy && limitations;

  return (
    <div>
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <FlaskConical className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Invitație în programul Beta"
        subtitle="Acces controlat la o versiune pre-release, cu suport și colectare structurată de feedback."
      />

      {error ? <div className="mb-4"><AuthError message={error} /></div> : null}
      {!token && !error ? <div className="mb-4"><AuthInfo message="Deschide linkul complet primit de la operatorul beta." /></div> : null}

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <Checkbox checked={terms} onCheckedChange={setTerms} label="Accept condițiile programului beta" className="min-h-11 text-left" />
        <Checkbox checked={privacy} onCheckedChange={setPrivacy} label="Confirm că am citit notificarea de confidențialitate" className="min-h-11 text-left" />
        <Checkbox checked={limitations} onCheckedChange={setLimitations} label="Înțeleg limitările și utilizarea providerilor sandbox" className="min-h-11 text-left" />
        <div className="border-t border-line pt-4">
          <Switch checked={analytics} onCheckedChange={setAnalytics} label="Analytics de produs beta" description="Opțional. Sunt trimise numai evenimente allowlisted și metadata tehnică limitată; poți refuza." className="[&_button]:min-h-11 [&_button]:min-w-11" />
        </div>
      </div>

      <Button className="mt-4 w-full" size="lg" disabled={!requiredAccepted || !token} loading={loading} onClick={() => void accept()}>
        Acceptă și continuă onboarding-ul
      </Button>
      <p className="mt-3 text-center text-xs leading-relaxed text-faint">Tokenul invitației este verificat pe server și nu este stocat în clar.</p>
    </div>
  );
}
