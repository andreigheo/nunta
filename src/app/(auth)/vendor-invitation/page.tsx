"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui";
import {
  AuthActionLink,
  AuthError,
  AuthHeading,
  AuthInfo,
} from "@/components/auth/auth-bits";
import {
  ApiClientError,
  apiErrorMessage,
  weddingOsApi,
} from "@/lib/api/client";
import { formatDateLong } from "@/lib/utils";

type VendorInvitationPreview = Awaited<
  ReturnType<typeof weddingOsApi.vendorInvitationPreview>
>;

export default function VendorInvitationPage() {
  const router = useRouter();
  const [token, setToken] = React.useState("");
  const [invitation, setInvitation] =
    React.useState<VendorInvitationPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [declined, setDeclined] = React.useState(false);

  const signIn = React.useCallback(
    (value: string) => {
      const returnTo = `/vendor-invitation?token=${encodeURIComponent(value)}`;
      router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    },
    [router],
  );

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const value =
        new URLSearchParams(window.location.search).get("token") ?? "";
      setToken(value);
      if (!value) {
        setError("Linkul invitației este incomplet.");
        return;
      }
      weddingOsApi
        .vendorInvitationPreview(value)
        .then(setInvitation)
        .catch((cause) => {
          if (cause instanceof ApiClientError && cause.status === 401) {
            signIn(value);
            return;
          }
          setError(apiErrorMessage(cause));
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [signIn]);

  const act = async (action: "accept" | "decline") => {
    setLoading(true);
    setError("");
    try {
      if (action === "accept") {
        const result = await weddingOsApi.acceptVendorInvitation(token);
        router.push(
          `/vendor?organization=${encodeURIComponent(result.vendorOrganizationId)}`,
        );
      } else {
        await weddingOsApi.declineVendorInvitation(token);
        setInvitation(null);
        setDeclined(true);
      }
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        signIn(token);
        return;
      }
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong dark:text-brand">
        <Building2 className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Invitație în spațiul furnizorului"
        subtitle={
          invitation
            ? `Ai fost invitat să colaborezi în organizația „${invitation.organizationName}”.`
            : "Verificăm invitația securizată."
        }
      />

      {error ? (
        <div className="mb-4 space-y-3 text-left">
          <AuthError message={error} />
          {token ? (
            <AuthActionLink
              href={`/sign-in?switch=1&returnTo=${encodeURIComponent(`/vendor-invitation?token=${encodeURIComponent(token)}`)}`}
              variant="outline"
            >
              Încearcă alt cont
            </AuthActionLink>
          ) : null}
        </div>
      ) : null}
      {declined ? (
        <div className="mb-4 space-y-4 text-left">
          <AuthInfo message="Invitația furnizorului a fost refuzată. Celelalte contexte ale contului nu au fost afectate." />
          <AuthActionLink href="/start" variant="outline">
            Înapoi la contul meu
          </AuthActionLink>
        </div>
      ) : null}
      {!invitation && !error && !declined ? (
        <div className="mb-4 text-left">
          <AuthInfo message="Se încarcă detaliile invitației…" />
        </div>
      ) : null}

      {invitation ? (
        <dl className="rounded-2xl border border-line bg-surface p-5 text-left text-sm shadow-card">
          <div className="flex justify-between gap-4">
            <dt className="text-faint">Organizație</dt>
            <dd className="font-medium text-ink">
              {invitation.organizationName}
            </dd>
          </div>
          <div className="mt-3 flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-faint">Rol</dt>
            <dd className="font-medium text-ink">{invitation.roleName}</dd>
          </div>
          <div className="mt-3 flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-faint">Expiră</dt>
            <dd className="font-medium text-ink">
              {formatDateLong(invitation.expiresAt)}
            </dd>
          </div>
        </dl>
      ) : null}

      {!declined ? <div className="mt-4 space-y-2.5">
        <Button
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!invitation}
          onClick={() => void act("accept")}
        >
          Acceptă invitația
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          disabled={!invitation || loading}
          onClick={() => void act("decline")}
        >
          Refuză
        </Button>
      </div> : null}
    </div>
  );
}
