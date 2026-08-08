"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ApiProblem } from "@weddingos/contracts";
import { useToast } from "@/components/ui";
import type { ApiProblemPolicy } from "./client";

type ProblemEvent = CustomEvent<{
  problem: ApiProblem;
  policy: ApiProblemPolicy;
}>;

export function ApiProblemPolicyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    const listener = (event: Event) => {
      const { problem, policy } = (event as ProblemEvent).detail;
      if (policy === "reauthenticate") {
        window.dispatchEvent(new Event("weddingos:session-invalidated"));
        const returnTo = `${window.location.pathname}${window.location.search}`;
        router.replace(`/session-expired?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (policy === "forbidden") {
        const capability = problem.requiredCapability
          ? `?capability=${encodeURIComponent(problem.requiredCapability)}`
          : "";
        router.replace(`/access-denied${capability}`);
        return;
      }
      if (policy === "conflict") {
        toast({
          title: "Datele au fost modificate între timp",
          description: "Reîncarcă datele și reaplică manual schimbarea. Nu am suprascris nimic.",
          variant: "warning",
          action: { label: "Reîncarcă", onClick: () => window.location.reload() },
        });
      }
    };
    window.addEventListener("weddingos:api-problem", listener);
    return () => window.removeEventListener("weddingos:api-problem", listener);
  }, [router, toast]);

  return children;
}
