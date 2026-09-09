"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, LockKeyhole, X } from "lucide-react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { cn } from "@/lib/utils";
import {
  mobileNavItems,
  navGroups,
  navigationItemForPath,
  planIncludes,
} from "@/lib/navigation";
import { CountBadge } from "@/components/ui";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useShell } from "./shell-context";

/** Bottom navigation for the couple's core modules (mobile). */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { setMobileNavOpen } = useShell();
  const { bootstrap } = useWorkspace();
  const capabilities = new Set(bootstrap?.membership.capabilities ?? []);
  const visiblePrimaryItems = mobileNavItems.filter((item) => {
    const configured = navigationItemForPath(item.href);
    return !configured?.capability || capabilities.has(configured.capability);
  });

  return (
    <nav
      aria-label="Navigație mobilă"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-elevated/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-20px_rgba(59,24,63,.45)] backdrop-blur-md lg:hidden"
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${visiblePrimaryItems.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {visiblePrimaryItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-16 flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium transition-colors",
                active ? "text-brand" : "text-faint",
              )}
            >
              {active ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand" aria-hidden /> : null}
              <item.icon className="size-[21px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium text-faint transition-colors hover:text-ink"
        >
          <LayoutGrid className="size-[21px]" aria-hidden />
          Mai mult
        </button>
      </div>
    </nav>
  );
}

/** Full-screen navigation sheet (mobile). */
export function MobileNavSheet() {
  const { mobileNavOpen, setMobileNavOpen } = useShell();
  const pathname = usePathname();
  const { bootstrap } = useWorkspace();
  const capabilities = new Set(bootstrap?.membership.capabilities ?? []);
  const plan = bootstrap?.subscription.plan ?? "FREE";

  React.useEffect(() => {
    setMobileNavOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!mobileNavOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-background lg:hidden" role="dialog" aria-modal="true" aria-label="Meniu de navigație">
      <div className="flex h-[4.5rem] items-center justify-between border-b border-line px-5">
        <SarbatoMark href="/overview" compact />
        <button
          onClick={() => setMobileNavOpen(false)}
          aria-label="Închide meniul"
          className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <nav aria-label="Toate modulele" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-24">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              !item.capability || capabilities.has(item.capability),
          );
          if (visibleItems.length === 0) return null;
          return <div key={group.id}>
            <p className="px-2 pb-1.5 font-brand text-sm font-semibold text-muted">{group.label}</p>
            <ul className="space-y-1">
              {visibleItems.map((item) => {
                const active = pathname === item.href;
                const planLocked =
                  item.minimumPlan &&
                  !planIncludes(plan, item.minimumPlan);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-action text-on-action"
                          : "text-muted hover:bg-subtle hover:text-ink",
                      )}
                    >
                      <item.icon className={cn("size-[18px] shrink-0", active ? "text-on-action" : "text-faint")} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {planLocked ? (
                        <LockKeyhole
                          className="size-3.5 shrink-0 text-warning"
                          aria-label={`Necesită planul ${item.minimumPlan}`}
                        />
                      ) : null}
                      {item.badge ? <CountBadge count={item.badge} tone={item.badgeTone ?? "brand"} /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>;
        })}
      </nav>
    </div>
  );
}
