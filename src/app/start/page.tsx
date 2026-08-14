"use client";

import * as React from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarHeart,
  MailCheck,
  LogOut,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { WorkspaceProvider, useWorkspace } from "@/lib/api/workspace-context";
import { PortalShell } from "@/components/portals/portal-shell";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";

export default function AccountStartPage() {
  return (
    <WorkspaceProvider allowNoWorkspace>
      <AccountStartContent />
    </WorkspaceProvider>
  );
}

function AccountStartContent() {
  const { user, workspaces, loading, logout } = useWorkspace();
  const [invitationLink, setInvitationLink] = React.useState("");
  const [error, setError] = React.useState("");

  const openInvitation = () => {
    setError("");
    try {
      const url = new URL(invitationLink);
      if (url.origin !== window.location.origin) throw new Error();
      if (
        url.pathname !== "/invitation" &&
        url.pathname !== "/vendor-invitation"
      ) {
        throw new Error();
      }
      if (!url.searchParams.get("token")) throw new Error();
      window.location.assign(`${url.pathname}${url.search}`);
    } catch {
      setError("Lipește linkul complet primit în invitația Sarbato.");
    }
  };

  if (loading) {
    return <div className="min-h-dvh animate-pulse bg-canvas" />;
  }

  return (
    <PortalShell
      role="Cont Sarbato"
      title={`Bun venit, ${user?.user.firstName ?? ""}`}
      subtitle="Alege contextul în care vrei să lucrezi. Un singur cont poate organiza evenimente, oferi servicii și accepta invitații."
      backHref="/"
      backLabel="Pagina principală"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex h-full flex-col p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <CalendarHeart className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-brand text-xl font-semibold text-ink">
              Organizează un eveniment
            </h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
              Acces complet la plan, invitații, RSVP, logistică, furnizori,
              buget și coordonarea zilei evenimentului.
            </p>
            <Link href={workspaces.length ? "/overview" : "/onboarding"} className="mt-5">
              <Button className="w-full">
                {workspaces.length ? "Deschide evenimentele" : "Creează evenimentul"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col p-5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
              <BriefcaseBusiness className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-brand text-xl font-semibold text-ink">
              Oferă servicii pentru evenimente
            </h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
              Configurează profilul profesional, serviciile, cererile,
              ofertele, rezervările, contractele și abonamentul.
            </p>
            <Link
              href={
                user?.contexts.vendorOrganizations ? "/vendor" : "/vendor?setup=1"
              }
              className="mt-5"
            >
              <Button variant="secondary" className="w-full">
                {user?.contexts.vendorOrganizations
                  ? "Deschide zona profesională"
                  : "Configurează serviciile"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {user?.contexts.platform ? (
          <Card>
            <CardContent className="flex h-full flex-col p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info-strong">
                <ShieldCheck className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-brand text-xl font-semibold text-ink">
                Administrează platforma
              </h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
                Acces operațional separat, limitat la capabilitățile globale
                acordate contului tău.
              </p>
              <Link href="/admin" className="mt-5">
                <Button variant="outline" className="w-full">
                  Deschide centrul platformei
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="mt-4">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr_auto] md:items-end">
          <span className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info-strong">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <Field label="Ai primit o invitație?" error={error || undefined}>
            <Input
              value={invitationLink}
              onChange={(event) => setInvitationLink(event.target.value)}
              placeholder="https://sarbato.space/invitation?token=..."
            />
          </Field>
          <Button
            variant="outline"
            disabled={!invitationLink.trim()}
            onClick={openInvitation}
          >
            Deschide invitația
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">Cont și securitate</h2>
            <p className="mt-1 text-sm text-muted">
              Profilul, parola și sesiunile rămân accesibile indiferent de contextul ales.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/settings?tab=security">
              <Button variant="outline" className="w-full sm:w-auto">
                <Settings2 className="size-4" aria-hidden />
                Setările contului
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => void logout()}
            >
              <LogOut className="size-4" aria-hidden />
              Deconectare
            </Button>
          </div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
