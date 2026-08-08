"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { weddingOsApi } from "@/lib/api/client";

export function BetaStatusPill() {
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void weddingOsApi
      .betaStatus()
      .then((status) => {
        if (active && status.betaAccess) {
          setLabel(status.releaseVersion ?? "Beta");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!label) return null;

  return (
    <Link href="/beta" aria-label="Deschide centrul programului beta">
      <Badge variant="warning" dot className="hidden md:inline-flex">
        Beta · {label}
      </Badge>
    </Link>
  );
}
