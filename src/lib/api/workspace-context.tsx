"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  CapabilityKey,
  CurrentUser,
  WorkspaceBootstrap,
  WorkspaceSummary,
} from "@weddingos/contracts";
import { wedding, workspaces as demoWorkspaces } from "@/lib/data/wedding";
import { ApiClientError, hasDemoCookie, weddingOsApi } from "./client";
import { navGroups } from "@/lib/navigation";
import { destinationForRegistration } from "@/lib/account-routing";

const demoCapabilities: CapabilityKey[] = Array.from(
  new Set<CapabilityKey>([
    "workspace.manage_public_aggregation",
    ...navGroups.flatMap((group) =>
      group.items.flatMap((item) => (item.capability ? [item.capability] : [])),
    ),
  ]),
);

type WorkspaceContextValue = {
  user: CurrentUser | null;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary | null;
  bootstrap: WorkspaceBootstrap | null;
  loading: boolean;
  demoMode: boolean;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(
  null,
);

export function WorkspaceProvider({
  children,
  allowNoWorkspace = false,
}: {
  children: React.ReactNode;
  allowNoWorkspace?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [workspaces, setWorkspaces] = React.useState<WorkspaceSummary[]>([]);
  const [currentWorkspace, setCurrentWorkspace] =
    React.useState<WorkspaceSummary | null>(null);
  const [bootstrap, setBootstrap] = React.useState<WorkspaceBootstrap | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [demoMode, setDemoMode] = React.useState(false);
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true";

  const loadDemo = React.useCallback(() => {
    const summaries: WorkspaceSummary[] = demoWorkspaces.map((item) => ({
      id: item.id,
      title: item.title,
      weddingDate: item.date,
      location: item.city,
      status: "active",
      role: "couple_owner",
      capabilities: demoCapabilities,
      imageUrl: null,
      progress: null,
    }));
    setDemoMode(true);
    setUser({
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        firstName: "Ana",
        lastName: "Dumitrescu",
        email: "demo@weddingos.local",
        emailVerified: true,
      },
      preferences: {
        locale: "ro-RO",
        timezone: "Europe/Bucharest",
        theme: "system",
        registrationIntent: "EVENT_ORGANIZER",
      },
      contexts: {
        workspaces: true,
        vendorOrganizations: false,
        platform: false,
      },
      globalCapabilities: [],
    });
    setWorkspaces(summaries);
    setCurrentWorkspace(summaries[0] ?? null);
    setBootstrap({
      workspace: {
        id: wedding.id,
        title: wedding.title,
        status: "active",
        weddingDate: wedding.date,
        timezone: "Europe/Bucharest",
        currency: wedding.currency,
        version: 1,
      },
      membership: {
        id: "00000000-0000-4000-8000-000000000002",
        roleTemplate: "couple_owner",
        capabilities: demoCapabilities,
      },
      shell: {
        unreadNotifications: 0,
        pendingAiProposals: 0,
        urgentTasks: 0,
        unansweredRsvp: 0,
        vendorReplies: 0,
        upcomingPayments: 0,
      },
      subscription: {
        plan: "FREE",
        status: "FREE",
        entitlements: {},
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
    });
    setLoading(false);
  }, []);

  const refresh = React.useCallback(async () => {
    if (demoEnabled && hasDemoCookie()) {
      loadDemo();
      return;
    }
    setLoading(true);
    try {
      const [nextUser, nextWorkspaces, preference] = await Promise.all([
        weddingOsApi.me(),
        weddingOsApi.workspaces(),
        weddingOsApi.preference(),
      ]);
      setUser(nextUser);
      setWorkspaces(nextWorkspaces);
      const selected =
        nextWorkspaces.find(
          (item) => item.id === preference.lastActiveWorkspaceId,
        ) ??
        nextWorkspaces[0] ??
        null;
      setCurrentWorkspace(selected);
      setBootstrap(
        selected ? await weddingOsApi.workspaceBootstrap(selected.id) : null,
      );
      if (!selected && !allowNoWorkspace)
        router.replace(
          destinationForRegistration(nextUser.preferences.registrationIntent),
        );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        router.replace("/session-expired");
        return;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, [allowNoWorkspace, demoEnabled, loadDemo, router]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0);
    const invalidate = () => {
      setUser(null);
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setBootstrap(null);
      setLoading(false);
    };
    window.addEventListener("weddingos:session-invalidated", invalidate);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("weddingos:session-invalidated", invalidate);
    };
  }, [refresh]);

  const selectWorkspace = React.useCallback(
    async (workspaceId: string) => {
      const selected = workspaces.find((item) => item.id === workspaceId);
      if (!selected) return;
      if (!demoMode) {
        await weddingOsApi.updatePreference({
          lastActiveWorkspaceId: workspaceId,
        });
        setBootstrap(await weddingOsApi.workspaceBootstrap(workspaceId));
      }
      setCurrentWorkspace(selected);
      router.push("/overview");
    },
    [demoMode, router, workspaces],
  );

  const logout = React.useCallback(async () => {
    if (!demoMode) await weddingOsApi.logout();
    document.cookie = "weddingos_demo=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/sign-in");
    router.refresh();
  }, [demoMode, router]);

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        workspaces,
        currentWorkspace,
        bootstrap,
        loading,
        demoMode,
        selectWorkspace,
        refresh,
        logout,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
