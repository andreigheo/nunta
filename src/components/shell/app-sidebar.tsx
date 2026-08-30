"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  BriefcaseBusiness,
  LogOut,
  Plus,
  Settings2,
  UserRoundCog,
} from "lucide-react";
import { cn, daysUntil, formatDateShort } from "@/lib/utils";
import { navGroups } from "@/lib/navigation";
import { Avatar, Badge, CountBadge, Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger, Tooltip } from "@/components/ui";
import { ThemeCycleButton, useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/api/workspace-context";
import { SarbatoMark } from "@/components/brand/sarbato-mark";

/* ------------------------------------------------------------------ */
/*  Workspace switcher                                                 */
/* ------------------------------------------------------------------ */

function WorkspaceSwitcher() {
  const router = useRouter();
  const { currentWorkspace, workspaces, selectWorkspace } = useWorkspace();
  const days = currentWorkspace?.weddingDate ? daysUntil(currentWorkspace.weddingDate) : null;
  const initials = (currentWorkspace?.title ?? "W · O")
    .split(/\s*&\s*|\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("·");
  return (
    <Dropdown>
      <DropdownTrigger>
        <button className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left shadow-card transition-colors hover:border-line-strong">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-semibold text-accent-strong">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-brand text-[15px] font-semibold leading-tight text-ink">
              {currentWorkspace?.title ?? "Spațiul tău"}
            </span>
            <span className="block text-xs text-faint">
              {currentWorkspace?.eventDate ?? currentWorkspace?.weddingDate
                ? `${formatDateShort(currentWorkspace.eventDate ?? currentWorkspace.weddingDate!)} · ${days} zile rămase`
                : "Data evenimentului nu este setată"}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" widthClass="w-[264px]">
        <DropdownLabel>Evenimentele tale</DropdownLabel>
        {workspaces.map((w) => (
          <DropdownItem
            key={w.id}
            selected={w.id === currentWorkspace?.id}
            icon={
              <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-[10px] font-semibold text-accent-strong">
                {w.title.split(/\s*&\s*|\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("·")}
              </span>
            }
            onSelect={() => void selectWorkspace(w.id)}
          >
            <span className="flex flex-col">
              <span>{w.title}</span>
              <span className="text-xs text-faint">
                {w.eventDate ?? w.weddingDate
                  ? formatDateShort(w.eventDate ?? w.weddingDate!)
                  : "Dată nesetată"} · {w.location ?? "Locație nesetată"}
              </span>
            </span>
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem icon={<Plus />} onSelect={() => router.push("/onboarding")}>
          Creează un eveniment nou
        </DropdownItem>
        <DropdownItem icon={<UserRoundCog />} onSelect={() => router.push("/start")}>
          Cont și contexte
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

/* ------------------------------------------------------------------ */
/*  Navigation groups                                                  */
/* ------------------------------------------------------------------ */

function NavGroupSection({ group }: { group: (typeof navGroups)[number] }) {
  const pathname = usePathname();
  const containsActiveItem = group.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const [open, setOpen] = React.useState(
    containsActiveItem || group.id === "overview" || group.id === "planning",
  );

  React.useEffect(() => {
    if (!containsActiveItem) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [containsActiveItem]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint transition-colors hover:text-muted"
      >
        {group.label}
        <ChevronDown
          className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="mt-0.5 space-y-px">
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                    active
                      ? "bg-brand-soft text-brand-strong dark:bg-brand-softer dark:text-brand"
                      : "text-muted hover:bg-subtle hover:text-ink",
                  )}
                >
                  <item.icon
                    className={cn("size-[17px] shrink-0", active ? "text-brand-strong dark:text-brand" : "text-faint group-hover:text-muted")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <CountBadge count={item.badge} tone={item.badgeTone ?? "brand"} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar footer                                                     */
/* ------------------------------------------------------------------ */

function SidebarFooter() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { user, bootstrap, logout } = useWorkspace();
  const displayName = user ? `${user.user.firstName} ${user.user.lastName}` : "Cont Sarbato";
  const displayEmail = user?.user.email ?? "";
  const capabilities = new Set(bootstrap?.membership.capabilities ?? []);
  const roleLabels = {
    couple_owner: "Organizator principal",
    couple_partner: "Co-organizator",
    wedding_planner: "Planner de eveniment",
    family_collaborator: "Colaborator invitat",
    viewer: "Invitat cu acces",
  } as const;
  const role = bootstrap?.membership.roleTemplate;
  const roleLabel = role ? roleLabels[role] : "Membru";
  const showProfessionalContext =
    user?.contexts.vendorOrganizations ||
    user?.preferences.registrationIntent === "SERVICE_PROVIDER";

  return (
    <div className="border-t border-line p-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Rol în eveniment
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-ink">
              {roleLabel}
            </p>
          </div>
          <Badge variant={role === "couple_owner" ? "brand" : "neutral"}>
            {capabilities.has("workspace.update") ? "Editare" : "Acces limitat"}
          </Badge>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Meniul arată numai modulele permise prin rolul tău.
        </p>
      </div>

      {/* Help, theme, user */}
      <div className="mt-2 flex items-center gap-1">
        {capabilities.has("settings.read") ? (
        <Tooltip content="Preferințe notificări" side="top">
          <button
            onClick={() => router.push("/settings?tab=notifications")}
            aria-label="Preferințe notificări"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
          >
            <CircleHelp className="size-[18px]" aria-hidden />
          </button>
        </Tooltip>
        ) : null}
        <ThemeCycleButton />
        <div className="ml-auto">
          <Dropdown>
            <DropdownTrigger>
              <button className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-subtle" aria-label="Meniul utilizatorului">
                <Avatar name={displayName} size="sm" />
                <ChevronDown className="size-3.5 text-faint" aria-hidden />
              </button>
            </DropdownTrigger>
            <DropdownContent align="start" widthClass="w-60">
              <div className="flex items-center gap-3 px-2.5 py-2">
                <Avatar name={displayName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                  <p className="truncate text-xs text-faint">{displayEmail}</p>
                </div>
              </div>
              <DropdownSeparator />
              <DropdownLabel>Temă vizuală</DropdownLabel>
              <DropdownItem onSelect={() => setTheme("light")}>Luminoasă</DropdownItem>
              <DropdownItem onSelect={() => setTheme("dark")}>Întunecată</DropdownItem>
              <DropdownItem onSelect={() => setTheme("system")}>La fel ca sistemul</DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<UserRoundCog />} onSelect={() => router.push("/start")}>
                Cont și contexte
              </DropdownItem>
              {showProfessionalContext ? (
                <DropdownItem
                  icon={<BriefcaseBusiness />}
                  onSelect={() => router.push(user?.contexts.vendorOrganizations ? "/vendor" : "/vendor?setup=1")}
                >
                  Serviciile mele
                </DropdownItem>
              ) : null}
              {capabilities.has("settings.read") ? (
              <DropdownItem icon={<Settings2 />} onSelect={() => router.push("/settings")}>
                Setări eveniment
              </DropdownItem>
              ) : null}
              <DropdownItem icon={<LogOut />} destructive onSelect={() => void logout()}>
                Deconectare
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

export function AppSidebar() {
  const { bootstrap } = useWorkspace();
  const capabilities = new Set(bootstrap?.membership.capabilities ?? []);
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => capabilities.has(item.capability)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[268px] shrink-0 flex-col border-r border-line bg-brand-softer/55 lg:flex dark:bg-sunken/45">
      {/* Mark */}
      <div className="flex items-center px-4 pb-3 pt-4">
        <SarbatoMark href="/overview" compact />
      </div>

      <div className="px-3">
        <WorkspaceSwitcher />
      </div>

      <nav aria-label="Navigație principală" className="mt-3 min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 pb-4">
        {visibleGroups.map((group) => (
          <NavGroupSection key={group.id} group={group} />
        ))}
      </nav>

      <SidebarFooter />
    </aside>
  );
}
