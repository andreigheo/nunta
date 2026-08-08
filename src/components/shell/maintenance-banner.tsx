"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";
import { isDemoCookieHeader } from "@/lib/api/transport-policy";

type StatusResponse = {
  data?: {
    maintenance?: { scope: string; message: string; supportUrl?: string | null; endsAt?: string | null } | null;
  };
};

const apiIndependentPublicPaths = new Set([
  "/",
  "/confidentialitate",
  "/privacy",
  "/termeni",
  "/terms",
  "/rambursari",
  "/cookies",
]);

export function MaintenanceBanner() {
  const pathname = usePathname();
  const [maintenance, setMaintenance] = React.useState<NonNullable<StatusResponse["data"]>["maintenance"]>(null);
  React.useEffect(() => {
    if (
      apiIndependentPublicPaths.has(pathname) ||
      isDemoCookieHeader(document.cookie) ||
      (process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true" &&
        pathname === "/sign-in")
    )
      return;
    const controller = new AbortController();
    void fetch("/api/v1/status", { credentials: "omit", cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<StatusResponse> : null)
      .then((payload) => setMaintenance(payload?.data?.maintenance ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname]);
  if (!maintenance) return null;
  return <div role="status" className="flex min-h-10 items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-sm text-ink"><AlertTriangle className="size-4 shrink-0 text-warning" /><span>{maintenance.message}{maintenance.endsAt ? ` Estimare finalizare: ${new Date(maintenance.endsAt).toLocaleString("ro-RO")}.` : ""}</span>{maintenance.supportUrl ? <a className="font-semibold underline" href={maintenance.supportUrl}>Suport</a> : null}</div>;
}
