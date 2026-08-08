"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import type { TeamInvitation } from "@weddingos/contracts";
import { Avatar, Button } from "@/components/ui";
import { AuthError, AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { ApiClientError, apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { formatDateLong } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  couple_owner: "Proprietar",
  couple_partner: "Partener",
  wedding_planner: "Wedding planner",
  family_collaborator: "Familie — acces limitat",
  viewer: "Doar vizualizare",
};

export default function InvitationAcceptPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [invitation, setInvitation] = React.useState<
    (TeamInvitation & { weddingDate: string | null }) | null
  >(null);
  const [error, setError] = React.useState("");
  const [token, setToken] = React.useState("");

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextToken = new URLSearchParams(window.location.search).get("token") ?? "";
      setToken(nextToken);
      if (!nextToken) {
        setError("Linkul invitației este incomplet.");
        return;
      }
      weddingOsApi
        .invitation(nextToken)
        .then(setInvitation)
        .catch((cause) => setError(apiErrorMessage(cause)));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const redirectToSignIn = () => {
    router.push(`/sign-in?returnTo=${encodeURIComponent(`/invitation?token=${token}`)}`);
  };

  const accept = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await weddingOsApi.acceptInvitation(token);
      await weddingOsApi.updatePreference({ lastActiveWorkspaceId: result.workspaceId });
      router.push("/overview");
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        redirectToSignIn();
        return;
      }
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const decline = async () => {
    setLoading(true);
    setError("");
    try {
      await weddingOsApi.declineInvitation(token);
      router.push("/sign-in?invitationDeclined=1");
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        redirectToSignIn();
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
        <HeartHandshake className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Ai fost invitat în echipă"
        subtitle={
          invitation
            ? `${invitation.invitedByName} te invită să colaborezi la planificarea „${invitation.workspaceTitle}”.`
            : "Verificăm invitația securizată."
        }
      />

      {error && (
        <div className="mb-4 text-left">
          <AuthError message={error} />
        </div>
      )}
      {!invitation && !error && (
        <div className="mb-4 text-left">
          <AuthInfo message="Se încarcă detaliile invitației…" />
        </div>
      )}

      {invitation && (
        <div className="rounded-2xl border border-line bg-surface p-5 text-left shadow-card">
          <div className="flex items-center gap-3">
            <Avatar name={invitation.invitedByName} size="lg" />
            <div>
              <p className="text-sm font-semibold text-ink">{invitation.invitedByName}</p>
              <p className="text-xs text-faint">Proprietar spațiu de lucru</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-faint">Nuntă</dt>
              <dd className="font-medium text-ink">{invitation.workspaceTitle}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Data</dt>
              <dd className="font-medium text-ink">
                {invitation.weddingDate ? formatDateLong(invitation.weddingDate) : "Nesetată"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Rolul tău</dt>
              <dd className="font-medium text-ink">
                {roleLabels[invitation.role] ?? invitation.role}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Invitația expiră</dt>
              <dd className="font-medium text-ink">{formatDateLong(invitation.expiresAt)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        <Button
          size="lg"
          className="w-full"
          loading={loading}
          disabled={!invitation}
          onClick={() => void accept()}
        >
          Acceptă invitația
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          disabled={!invitation || loading}
          onClick={() => void decline()}
        >
          Refuză
        </Button>
      </div>
    </div>
  );
}
