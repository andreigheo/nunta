"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthActionLink, AuthHeading } from "@/components/auth/auth-bits";
import { weddingOsApi } from "@/lib/api/client";

export default function AccessDeniedPage() {
  const router = useRouter();
  const [switching, setSwitching] = React.useState(false);

  const switchAccount = async () => {
    setSwitching(true);
    try {
      await weddingOsApi.logout();
    } catch {
      // A stale session is already effectively signed out.
    }
    document.cookie = "weddingos_demo=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/sign-in?switch=1");
    router.refresh();
  };

  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldX className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title="Acces restricționat"
        subtitle="Nu ai permisiunea de a vedea această pagină. Cere proprietarului spațiului de lucru să-ți extindă accesul."
      />
      <div className="space-y-2.5">
        <AuthActionLink href="/start">Înapoi la cont și contexte</AuthActionLink>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          loading={switching}
          onClick={() => void switchAccount()}
        >
          Schimbă contul
        </Button>
      </div>
    </div>
  );
}
