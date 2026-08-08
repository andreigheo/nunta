"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthError, AuthHeading, AuthInfo } from "@/components/auth/auth-bits";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export default function MagicLinkPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setLoading(false);
        return;
      }
      weddingOsApi
        .exchangeMagicLink(token)
        .then(() => {
          router.replace("/overview");
          router.refresh();
        })
        .catch((cause) => setError(apiErrorMessage(cause)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  return (
    <div className="text-center">
      <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
        <Wand2 className="size-7" aria-hidden />
      </span>
      <AuthHeading
        title={loading ? "Verificăm linkul magic" : "Verifică-ți inboxul"}
        subtitle="Linkul magic este valabil 15 minute și creează o sesiune securizată, fără parolă."
      />
      {loading && <div className="mb-4 text-left"><AuthInfo message="Conectarea este în curs…" /></div>}
      {error && <div className="mb-4 text-left"><AuthError message={error} /></div>}
      <div className="space-y-2.5">
        <Link href="/sign-in" className="block">
          <Button variant="ghost" size="lg" className="w-full">Înapoi la conectare</Button>
        </Link>
      </div>
      <p className="mt-4 text-xs text-faint">Nu găsești emailul? Verifică Spam sau Promoții.</p>
    </div>
  );
}
