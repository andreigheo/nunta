"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeEuro,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  DatabaseBackup,
  Flag,
  Gauge,
  Menu,
  ScrollText,
  Settings2,
  Tags,
  ShieldCheck,
  TrafficCone,
  Users,
  X,
} from "lucide-react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { ThemeCycleButton } from "@/lib/theme";

const navigation = [
  { href: "/admin", label: "Centru de comandă", icon: Gauge },
  { href: "/admin/traffic", label: "Trafic și conversii", icon: TrafficCone },
  { href: "/admin/users", label: "Utilizatori", icon: Users },
  { href: "/admin/workspaces", label: "Evenimente", icon: Boxes },
  { href: "/admin/vendors", label: "Furnizori", icon: Building2 },
  { href: "/admin/commerce", label: "Comerț", icon: BadgeEuro },
  { href: "/admin/support", label: "Suport", icon: CircleHelp },
  { href: "/admin/incidents", label: "Erori și incidente", icon: Activity },
  { href: "/admin/security", label: "Securitate", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/configuration", label: "Configurare", icon: Settings2 },
  { href: "/admin/labels", label: "Etichete", icon: Tags },
  { href: "/admin/operations", label: "Backup și release-uri", icon: DatabaseBackup },
  { href: "/admin/access", label: "Acces administrativ", icon: Flag },
] as const;

function isCurrent(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [compact, setCompact] = React.useState(false);

  const nav = (
    <nav aria-label="Navigație administrativă" className="space-y-1 p-3">
      {navigation.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={current ? "page" : undefined}
            title={compact ? item.label : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              current
                ? "bg-brand text-on-brand"
                : "text-muted hover:bg-subtle hover:text-ink"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!compact ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background text-ink">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-action focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-on-action"
      >
        Sari la conținut
      </a>

      <aside
        className={`fixed inset-y-0 left-0 z-50 hidden border-r border-line bg-surface transition-[width] duration-200 lg:block ${compact ? "w-[4.75rem]" : "w-[16.5rem]"}`}
      >
        <div className="flex h-[4.5rem] items-center justify-between border-b border-line px-4">
          <SarbatoMark href="/admin" compact={compact} />
          <button
            type="button"
            aria-label={compact ? "Extinde navigația" : "Restrânge navigația"}
            onClick={() => setCompact((value) => !value)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {compact ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>
        <div className="h-[calc(100dvh-4.5rem)] overflow-y-auto">{nav}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="Închide navigația"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[min(20rem,88vw)] border-r border-line bg-surface shadow-xl">
            <div className="flex h-[4.5rem] items-center justify-between border-b border-line px-4">
              <SarbatoMark href="/admin" />
              <button
                type="button"
                aria-label="Închide navigația"
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-subtle"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      ) : null}

      <div className={compact ? "lg:pl-[4.75rem]" : "lg:pl-[16.5rem]"}>
        <header className="sticky top-0 z-40 flex h-[4.5rem] items-center gap-3 border-b border-line bg-background/92 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Deschide navigația"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-subtle lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted">Administrare Sarbato</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeCycleButton />
            <Link href="/start" className="hidden min-h-10 items-center rounded-lg px-3 text-[13px] font-medium text-muted hover:bg-subtle hover:text-ink sm:inline-flex">
              Ieși din admin
            </Link>
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <header className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-brand text-[30px] font-semibold leading-tight tracking-[-0.025em] text-brand sm:text-[36px]">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{subtitle}</p>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
