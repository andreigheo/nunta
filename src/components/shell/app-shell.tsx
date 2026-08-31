"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/ui";
import { ShellProvider } from "./shell-context";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { NotificationsDrawer } from "./notifications-drawer";
import { AICopilot } from "./ai-copilot";
import { QuickCreateModal } from "./quick-create";
import { MobileBottomNav, MobileNavSheet } from "./mobile-nav";
import { WorkspaceProvider, useWorkspace } from "@/lib/api/workspace-context";
import { requiredCapabilityForPath } from "@/lib/navigation";
import { PortalShell } from "@/components/portals/portal-shell";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <WorkspaceProvider allowNoWorkspace={pathname === "/settings"}>
      <AppShellContent>{children}</AppShellContent>
    </WorkspaceProvider>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, loadError, demoMode, bootstrap, currentWorkspace, refresh } =
    useWorkspace();
  const focusedEditor = pathname === "/invitations/editor";
  if (loading) {
    return <div className="min-h-dvh animate-pulse bg-canvas" role="status" aria-label="Se încarcă spațiul de lucru" />;
  }
  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
        <ErrorState
          className="w-full max-w-lg"
          title="Spațiul de lucru nu este disponibil"
          description={loadError}
          onRetry={() => void refresh()}
        />
      </div>
    );
  }
  if (pathname === "/settings" && !bootstrap && !demoMode) {
    return (
      <PortalShell
        role="Cont Sarbato"
        title="Setările contului"
        subtitle="Profil, notificări, aspect, confidențialitate și securitate, independent de un eveniment."
        backHref="/start"
        backLabel="Cont și contexte"
      >
        {children}
      </PortalShell>
    );
  }
  const requiredCapability = requiredCapabilityForPath(pathname);
  const allowed =
    demoMode ||
    !requiredCapability ||
    Boolean(bootstrap?.membership.capabilities.includes(requiredCapability));
  return (
    <ShellProvider>
      {demoMode && (
        <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-accent px-3 py-1 text-center text-xs font-semibold text-on-accent">
          <span>Demo local — date izolate, fără sincronizare sau documente reale</span>
          <button
            type="button"
            className="cursor-pointer underline underline-offset-2"
            onClick={() => window.location.reload()}
          >
            Resetează demo
          </button>
        </div>
      )}
      <div
        className={
          demoMode
            ? "flex min-h-dvh pt-10 sm:pt-6"
            : "flex min-h-dvh"
        }
      >
        {!focusedEditor ? <AppSidebar /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          {!focusedEditor ? <Topbar /> : null}
          <main
            className={
              focusedEditor
                ? "min-w-0 flex-1 p-2 sm:p-3"
                : "min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10"
            }
          >
            {allowed ? (
              children
            ) : (
              <EmptyState
                icon={LockKeyhole}
                title="Acest modul nu face parte din rolul tău"
                description="Organizatorul controlează accesul fiecărui membru. Meniul tău rămâne limitat la modulele permise prin invitație."
                action={{
                  label: "Înapoi la prezentare",
                  onClick: () => router.replace("/overview"),
                }}
              />
            )}
          </main>
        </div>
      </div>
      {!focusedEditor ? (
        <>
          <CommandPalette />
          <NotificationsDrawer />
          <AICopilot key={currentWorkspace?.id ?? "no-workspace"} />
          <QuickCreateModal />
          <MobileBottomNav />
          <MobileNavSheet />
        </>
      ) : null}
    </ShellProvider>
  );
}
