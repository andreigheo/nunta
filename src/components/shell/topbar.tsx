"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Armchair,
  Building2,
  CalendarPlus,
  Command,
  FileSignature,
  FileText,
  Mail,
  Images,
  ListChecks,
  Megaphone,
  MapPin,
  Menu,
  Plus,
  Search,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Siren,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { navGroups } from "@/lib/navigation";
import { daysUntil } from "@/lib/utils";
import {
  Badge,
  Button,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui";
import { useShell } from "./shell-context";
import type { QuickCreateKind } from "./shell-context";
import { useWorkspace } from "@/lib/api/workspace-context";
import type { CapabilityKey } from "@weddingos/contracts";

const quickCreateItems: Array<{
  kind: QuickCreateKind;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  capability: CapabilityKey;
}> = [
  { kind: "task", label: "Adaugă sarcină", icon: <Plus />, active: true, capability: "planning.write" },
  {
    kind: "event",
    label: "Eveniment în calendar",
    icon: <CalendarPlus />,
    active: true,
    capability: "calendar.write",
  },
  {
    kind: "run_of_show",
    label: "Moment Run of Show",
    icon: <Activity />,
    active: true,
    capability: "wedding_day.write",
  },
  {
    kind: "checklist_item",
    label: "Element checklist",
    icon: <ListChecks />,
    active: true,
    capability: "wedding_day.write",
  },
  {
    kind: "incident",
    label: "Raportează incident",
    icon: <Siren />,
    active: true,
    capability: "incident.write",
  },
  {
    kind: "announcement",
    label: "Publică anunț",
    icon: <Megaphone />,
    active: true,
    capability: "announcement.publish",
  },
  {
    kind: "manual_check_in",
    label: "Check-in manual",
    icon: <ScanLine />,
    active: true,
    capability: "check_in.override",
  },
  {
    kind: "gallery",
    label: "Creează galerie",
    icon: <Images />,
    active: true,
    capability: "gallery.write",
  },
  { kind: "guest", label: "Adaugă invitat", icon: <UserPlus />, active: true, capability: "guest.write" },
  {
    kind: "household",
    label: "Adaugă gospodărie",
    icon: <Users />,
    active: true,
    capability: "guest.write",
  },
  {
    kind: "seating_table",
    label: "Adaugă masă",
    icon: <Armchair />,
    active: true,
    capability: "seating.write",
  },
  {
    kind: "transport_route",
    label: "Adaugă rută",
    icon: <MapPin />,
    active: true,
    capability: "transport.write",
  },
  {
    kind: "accommodation_property",
    label: "Adaugă proprietate",
    icon: <Building2 />,
    active: true,
    capability: "accommodation.write",
  },
  {
    kind: "expense",
    label: "Adaugă cheltuială",
    icon: <Wallet />,
    active: true,
    capability: "budget.write",
  },
  {
    kind: "payment",
    label: "Înregistrează plată externă",
    icon: <Wallet />,
    active: true,
    capability: "payment.write",
  },
  { kind: "vendor", label: "Caută furnizor", icon: <Users />, active: true, capability: "marketplace.read" },
  { kind: "rfq", label: "Cerere de ofertă", icon: <FileText />, active: true, capability: "rfq.write" },
  {
    kind: "contract",
    label: "Contract din ofertă · automat",
    icon: <FileSignature />,
    active: false,
    capability: "contract.write",
  },
  {
    kind: "risk",
    label: "Adaugă risc",
    icon: <ShieldAlert />,
    active: true,
    capability: "risk.write",
  },
  {
    kind: "risk_detection",
    label: "Rulează detectarea riscurilor",
    icon: <ScanLine />,
    active: true,
    capability: "risk.detect",
  },
  {
    kind: "plan_b",
    label: "Creează Plan B",
    icon: <ShieldAlert />,
    active: true,
    capability: "contingency.write",
  },
  {
    kind: "automation",
    label: "Creează automatizare",
    icon: <Sparkles />,
    active: true,
    capability: "automation.write",
  },
  { kind: "campaign", label: "Trimite campanie", icon: <Mail />, active: true, capability: "campaign.write" },
  { kind: "rsvp", label: "Vezi RSVP", icon: <Mail />, active: true, capability: "rsvp.read" },
];

function pageMeta(pathname: string): { title: string; section: string } {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return { title: item.label, section: group.label };
      }
    }
  }
  return { title: "Prezentare generală", section: "Privire de ansamblu" };
}

export function Topbar() {
  const pathname = usePathname();
  const shell = useShell();
  const { currentWorkspace, bootstrap, user } = useWorkspace();
  const meta = pageMeta(pathname);
  const days = currentWorkspace?.eventDate
    ? daysUntil(currentWorkspace.eventDate)
    : null;
  const unread = bootstrap?.shell.unreadNotifications ?? 0;
  const initials = user
    ? `${user.user.firstName[0] ?? ""}${user.user.lastName[0] ?? ""}`
    : "WO";
  const capabilities = new Set<string>(
    bootstrap?.membership.capabilities ?? [],
  );
  const visibleQuickCreateItems = quickCreateItems.filter(
    (item) => capabilities.has(item.capability),
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur-md">
      <div className="flex h-[4.5rem] items-center gap-1 px-3 sm:gap-2 sm:px-8 lg:px-8 xl:px-10">
        {/* Mobile: menu + title */}
        <button
          onClick={() => shell.setMobileNavOpen(true)}
          aria-label="Deschide meniul"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <nav
            aria-label="Breadcrumb"
            className="hidden text-xs text-faint sm:block"
          >
            <ol className="flex items-center gap-1.5">
              <li>{meta.section}</li>
              <li aria-hidden>/</li>
              <li className="font-medium text-muted">{meta.title}</li>
            </ol>
          </nav>
          <p className="truncate font-brand text-[17px] font-semibold leading-tight tracking-[-0.015em] text-brand sm:text-[19px]">
            {meta.title}
          </p>
        </div>

        {/* Wedding status */}
        {days !== null && (
          <Badge variant="brand" dot className="hidden md:inline-flex">
            Pe drumul cel bun · {days} zile
          </Badge>
        )}
        {/* Search */}
        <button
          onClick={() => shell.setPaletteOpen(true)}
          className="hidden h-11 w-56 cursor-text items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] text-faint transition-colors hover:border-brand xl:flex"
          aria-label="Căutare rapidă"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Caută oriunde…</span>
          <kbd className="inline-flex items-center gap-0.5 rounded border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-faint">
            <Command className="size-2.5" aria-hidden />K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 xl:hidden"
          aria-label="Căutare"
          onClick={() => shell.setPaletteOpen(true)}
        >
          <Search className="size-5" aria-hidden />
        </Button>

        {/* AI Copilot */}
        <Button
          variant="outline"
          size="sm"
          disabled={!capabilities.has("copilot.use")}
          title={
            capabilities.has("copilot.use")
              ? "Deschide Copilot"
              : "Nu ai dreptul copilot.use"
          }
          onClick={shell.openAI}
          className="hidden sm:inline-flex"
        >
          <Sparkles className="size-4 text-accent" aria-hidden />
          Copilot AI
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!capabilities.has("copilot.use")}
          title="Copilot"
          onClick={shell.openAI}
          className="hidden size-11 shrink-0 min-[480px]:inline-flex sm:hidden"
          aria-label="Deschide Copilot AI"
        >
          <Sparkles className="size-5 text-accent" aria-hidden />
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notificări: ${unread} necitite`}
          onClick={() => shell.setNotificationsOpen(true)}
          className="relative size-11 shrink-0 sm:size-10"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span
              className="absolute right-1.5 top-1.5 flex size-2 rounded-full bg-danger ring-2 ring-background"
              aria-hidden
            />
          )}
        </Button>

        {/* Quick create */}
        <Dropdown>
          <DropdownTrigger>
            <Button
              size="icon-sm"
              aria-label="Creare rapidă"
              className="size-11 shrink-0 rounded-lg sm:size-9"
            >
              <Plus className="size-4.5" aria-hidden />
            </Button>
          </DropdownTrigger>
          <DropdownContent widthClass="w-60">
            <DropdownLabel>Creare rapidă</DropdownLabel>
            {visibleQuickCreateItems.slice(0, 2).map((item) => (
              <DropdownItem
                key={item.kind}
                icon={item.icon}
                onSelect={() => shell.setQuickCreate(item.kind)}
              >
                {item.label}
              </DropdownItem>
            ))}
            <DropdownSeparator />
            {visibleQuickCreateItems.slice(2).map((item) => (
              <DropdownItem
                key={item.kind}
                icon={item.icon}
                disabled={!item.active}
                trailing={item.active ? undefined : "Ulterior"}
                onSelect={() => shell.setQuickCreate(item.kind)}
              >
                {item.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>

        {/* User (compact on mobile topbar) */}
        <Link
          href="/settings"
          aria-label="Profil utilizator"
          className="inline-flex size-11 shrink-0 items-center justify-center lg:hidden"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-strong dark:text-brand">
            {initials.toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
  );
}
