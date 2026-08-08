"use client";

import { Hourglass } from "lucide-react";
import { AuthActionLink, AuthHeading } from "@/components/auth/auth-bits";

export default function SessionExpiredPage() {
  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <Hourglass className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Sesiunea a expirat"
        subtitle="Ai fost deconectat automat după o perioadă de inactivitate. Datele tale sunt în siguranță — reconectează-te pentru a continua."
      />
      <div className="space-y-2.5">
        <AuthActionLink href="/sign-in">
          Reconectează-te
        </AuthActionLink>
        <AuthActionLink href="/sign-in" variant="ghost">Înapoi la pagina de conectare</AuthActionLink>
      </div>
    </div>
  );
}
