"use client";

import { Hourglass } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { AuthActionLink, AuthHeading } from "@/components/auth/auth-bits";
import { safeInternalPath } from "@/lib/account-routing";

export default function SessionExpiredPage() {
  const searchParams = useSearchParams();
  const returnTo = safeInternalPath(searchParams.get("returnTo"));
  const signInHref = returnTo
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";
  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <Hourglass className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Sesiunea a expirat"
        subtitle="Ai fost deconectat automat după o perioadă de inactivitate. Datele tale sunt în siguranță. Reconectează-te pentru a continua."
      />
      <div className="space-y-2.5">
        <AuthActionLink href={signInHref}>
          Reconectează-te
        </AuthActionLink>
        <AuthActionLink href="/" variant="ghost">Înapoi la pagina principală</AuthActionLink>
      </div>
    </div>
  );
}
