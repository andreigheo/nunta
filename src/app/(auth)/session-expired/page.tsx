"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthHeading } from "@/components/auth/auth-bits";

export default function SessionExpiredPage() {
  const router = useRouter();
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
        <Button size="lg" className="w-full" onClick={() => router.push("/sign-in")}>
          Reconectează-te
        </Button>
        <Link href="/sign-in" className="block">
          <Button variant="ghost" size="lg" className="w-full">Înapoi la pagina de conectare</Button>
        </Link>
      </div>
    </div>
  );
}
