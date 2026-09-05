"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CreditCard,
  FileWarning,
  ListChecks,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  Store,
  Users,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { AppNotification, NotificationModule } from "@/lib/types";
import { Badge, Drawer, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, Tabs, TabsList, TabsTrigger, useToast } from "@/components/ui";
import { useShell } from "./shell-context";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

type PersistentNotification = AppNotification & { version: number };

const moduleIcons: Record<NotificationModule, React.ElementType> = {
  tasks: ListChecks,
  guests: Users,
  vendors: Store,
  payments: CreditCard,
  risks: ShieldAlert,
  system: Bell,
};

const moduleLabels: Record<NotificationModule, string> = {
  tasks: "Sarcini",
  guests: "Invitați",
  vendors: "Furnizori",
  payments: "Plăți",
  risks: "Riscuri",
  system: "Sistem",
};

const moduleTones: Record<NotificationModule, string> = {
  tasks: "bg-brand-soft text-brand-strong",
  guests: "bg-info-soft text-info",
  vendors: "bg-accent-soft text-accent-strong",
  payments: "bg-warning-soft text-warning",
  risks: "bg-danger-soft text-danger",
  system: "bg-subtle text-muted",
};

const tabs = [
  { value: "all", label: "Toate" },
  { value: "tasks", label: "Sarcini" },
  { value: "guests", label: "Invitați" },
  { value: "vendors", label: "Furnizori" },
  { value: "payments", label: "Plăți" },
  { value: "risks", label: "Riscuri" },
  { value: "system", label: "Sistem" },
];

function NotificationRow({
  item,
  onRead,
  onDismiss,
}: {
  item: PersistentNotification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  const shell = useShell();
  const Icon = moduleIcons[item.module];

  const open = () => {
    onRead(item.id);
    shell.setNotificationsOpen(false);
    router.push(item.href);
  };

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        item.read ? "border-transparent" : "border-line bg-brand-softer/60",
      )}
    >
      <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg", moduleTones[item.module])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-snug", item.read ? "font-medium text-muted" : "font-semibold text-ink")}>
            {item.title}
          </p>
          {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-label="Necitită" />}
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{moduleLabels[item.module]}</Badge>
          <span className="text-xs text-faint">{formatRelativeTime(item.time)}</span>
          <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={open}
              className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
            >
              Vezi
            </button>
            {!item.read && (
              <button
                onClick={() => onRead(item.id)}
                className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-ink"
              >
                Marchează citită
              </button>
            )}
            <Dropdown>
              <DropdownTrigger>
                <button aria-label="Mai multe acțiuni" className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-subtle hover:text-ink">
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </DropdownTrigger>
              <DropdownContent widthClass="w-48">
                <DropdownItem onSelect={open}>Deschide modulul</DropdownItem>
                <DropdownItem onSelect={() => onRead(item.id)}>Marchează ca citită</DropdownItem>
                <DropdownItem icon={<FileWarning />} onSelect={() => onDismiss(item.id)} destructive>
                  Șterge notificarea
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </span>
        </div>
      </div>
    </div>
  );
}

export function NotificationsDrawer() {
  const { notificationsOpen, setNotificationsOpen } = useShell();
  const { currentWorkspace, demoMode } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = React.useState<PersistentNotification[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState("all");

  const filtered = tab === "all" ? items : items.filter((n) => n.module === tab);
  const unread = items.filter((n) => !n.read).length;

  React.useEffect(() => {
    if (!notificationsOpen || demoMode || !currentWorkspace) return;
    let cancelled = false;
    const workspaceId = currentWorkspace.id;
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      void weddingOsApi
        .notifications(workspaceId)
        .then((result) => {
          if (!cancelled) setItems(result.items.map(toAppNotification));
        })
        .catch((error) => {
          if (!cancelled)
            toast({ title: "Notificările nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentWorkspace, demoMode, notificationsOpen, toast]);

  const markRead = (id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || item.read || demoMode || !currentWorkspace) return;
    void weddingOsApi
      .updateNotification(currentWorkspace.id, id, true, item.version)
      .then((updated) =>
        setItems((previous) =>
          previous.map((candidate) =>
            candidate.id === id ? toAppNotification(updated) : candidate,
          ),
        ),
      )
      .catch((error) => toast({ title: "Notificarea nu a putut fi actualizată", description: apiErrorMessage(error), variant: "error" }));
  };
  const dismiss = (id: string) => {
    if (demoMode || !currentWorkspace) return;
    void weddingOsApi
      .removeNotification(currentWorkspace.id, id)
      .then(() => setItems((prev) => prev.filter((n) => n.id !== id)))
      .catch((error) => toast({ title: "Notificarea nu a putut fi ștearsă", description: apiErrorMessage(error), variant: "error" }));
  };
  const markAll = () => {
    if (demoMode || !currentWorkspace) return;
    void weddingOsApi
      .markAllNotificationsRead(currentWorkspace.id)
      .then(() => setItems((prev) => prev.map((n) => ({ ...n, read: true }))))
      .catch((error) => toast({ title: "Notificările nu au putut fi actualizate", description: apiErrorMessage(error), variant: "error" }));
  };

  return (
    <Drawer
      open={notificationsOpen}
      onClose={() => setNotificationsOpen(false)}
      width="md"
      title={
        <span className="flex items-center gap-2">
          <span className="font-brand text-lg font-semibold tracking-tight text-ink">Notificări</span>
          {unread > 0 && <Badge variant="brand">{unread} necitite</Badge>}
        </span>
      }
      headerActions={
        <>
          <button
            onClick={markAll}
            disabled={demoMode || unread === 0}
            aria-label="Marchează tot ca citit"
            title="Marchează tot ca citit"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <CheckCheck className="size-4.5" aria-hidden />
          </button>
          <button
            onClick={() => {
              setNotificationsOpen(false);
              router.push("/settings?tab=notifications");
            }}
            aria-label="Setări notificări"
            title="Setări notificări"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <Settings className="size-4.5" aria-hidden />
          </button>
        </>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-elevated px-4 py-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="space-y-2 p-4">
        {loading ? (
          <p className="py-14 text-center text-sm text-muted">Se încarcă notificările…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-subtle text-faint">
              <Bell className="size-6" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium text-ink">Nicio notificare aici</p>
            <p className="mt-1 text-[13px] text-muted">
              {demoMode ? "Notificările persistente sunt disponibile într-un cont real." : "Ești la zi cu tot ce contează."}
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <NotificationRow key={item.id} item={item} onRead={markRead} onDismiss={dismiss} />
          ))
        )}
      </div>
    </Drawer>
  );
}

function toAppNotification(item: import("@weddingos/contracts").NotificationResource): PersistentNotification {
  const notificationSection = notificationModule(item.module);
  return {
    id: item.id,
    module: notificationSection,
    title: item.title,
    description: item.body,
    time: item.createdAt,
    read: Boolean(item.readAt),
    href: item.actionUrl ?? "/settings?tab=notifications",
    version: item.version,
  };
}

function notificationModule(kind: string): NotificationModule {
  if (["tasks", "guests", "vendors", "payments", "risks"].includes(kind)) {
    return kind as NotificationModule;
  }
  return "system";
}
