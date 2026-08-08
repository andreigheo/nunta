"use client";

import { ArrowLeftRight, Landmark } from "lucide-react";
import { PortalShell } from "@/components/portals/portal-shell";
import { Card, CardContent } from "@/components/ui";

export default function VendorPayoutsPage() {
  return (
    <PortalShell
      role="Furnizor de servicii"
      title="Plăți stabilite direct"
      subtitle="Sarbato nu încasează și nu redistribuie bani între organizatori și furnizori."
      backHref="/vendor"
      backLabel="Zona profesională"
    >
      <Card>
        <CardContent className="grid gap-5 p-6 md:grid-cols-[auto_1fr] md:items-start">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
            <Landmark className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-brand text-xl font-semibold text-ink">
              Fără intermediere financiară
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Plata serviciilor se face direct între părți, prin metoda agreată
              în contract. Sarbato poate păstra termene și dovezi operaționale,
              dar nu deschide conturi de încasare și nu inițiază payout-uri.
            </p>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-subtle p-4">
              <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden />
              <p className="text-sm text-muted">
                O eventuală integrare financiară viitoare va fi lansată numai
                după definirea responsabilităților legale și a fluxului de
                consimțământ. Până atunci, acest modul nu execută operațiuni.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
