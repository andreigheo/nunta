"use client";

import * as React from "react";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui";
import { ApiProblemPolicyProvider } from "@/lib/api/problem-policy";
import { MaintenanceBanner } from "@/components/shell/maintenance-banner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ApiProblemPolicyProvider><MaintenanceBanner />{children}</ApiProblemPolicyProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
