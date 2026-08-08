"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CalendarDays,
  CornerDownLeft,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navGroups } from "@/lib/navigation";
import { weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useShell } from "./shell-context";
import type { CapabilityKey } from "@weddingos/contracts";

type Action = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  capability?: CapabilityKey;
  run: () => void;
};
const subscribeToHydration = () => () => undefined;

export function CommandPalette() {
  const { paletteOpen } = useShell();
  const hydrated = React.useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  if (!hydrated || !paletteOpen) return null;
  return <CommandPaletteContent />;
}

function CommandPaletteContent() {
  const { setPaletteOpen, setQuickCreate, openAI } = useShell();
  const { currentWorkspace, demoMode, bootstrap } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [remote, setRemote] = React.useState<Action[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const close = React.useCallback(
    () => setPaletteOpen(false),
    [setPaletteOpen],
  );
  const base = React.useMemo<Action[]>(
    () => {
      const actions: Action[] = [
        {
          id: "ask-copilot",
          label: "Întreabă Copilot",
          hint: "Răspuns cu surse și propuneri controlate",
          group: "Acțiuni",
          capability: "copilot.use",
          run: openAI,
        },
        {
          id: "create-task",
          label: "Creează o sarcină",
          hint: "Salvare reală",
          group: "Acțiuni",
          capability: "task.write",
          run: () => setQuickCreate("task"),
        },
        {
          id: "create-event",
          label: "Adaugă eveniment în calendar",
          hint: "Salvare reală",
          group: "Acțiuni",
          capability: "calendar.write",
          run: () => setQuickCreate("event"),
        },
        {
          id: "create-risk",
          label: "Adaugă un risc",
          hint: "Registru real",
          group: "Acțiuni",
          capability: "risk.write",
          run: () => setQuickCreate("risk"),
        },
        {
          id: "detect-risks",
          label: "Rulează detectarea riscurilor",
          hint: "Job determinist și deduplicat",
          group: "Acțiuni",
          capability: "risk.detect",
          run: () => setQuickCreate("risk_detection"),
        },
        {
          id: "create-plan-b",
          label: "Creează un Plan B",
          hint: "Draft versionat",
          group: "Acțiuni",
          capability: "contingency.write",
          run: () => setQuickCreate("plan_b"),
        },
        {
          id: "create-automation",
          label: "Creează o automatizare",
          hint: "Regulă draft controlată",
          group: "Acțiuni",
          capability: "automation.write",
          run: () => setQuickCreate("automation"),
        },
        {
          id: "create-household",
          label: "Creează o gospodărie",
          hint: "Guest CRM · salvare reală",
          group: "Acțiuni",
          capability: "guest.write",
          run: () => setQuickCreate("household"),
        },
        {
          id: "create-guest",
          label: "Adaugă un invitat",
          hint: "Guest CRM · salvare reală",
          group: "Acțiuni",
          capability: "guest.write",
          run: () => setQuickCreate("guest"),
        },
        {
          id: "send-campaign",
          label: "Trimite o campanie de invitații",
          hint: "Livrare asincronă reală",
          group: "Acțiuni",
          capability: "campaign.send",
          run: () => setQuickCreate("campaign"),
        },
        {
          id: "view-rsvp",
          label: "Vezi răspunsurile RSVP",
          hint: "Date reale",
          group: "Acțiuni",
          capability: "rsvp.read",
          run: () => router.push("/rsvp"),
        },
        ...navGroups.flatMap((group) =>
          group.items.map<Action>((item) => ({
            id: `nav-${item.href}`,
            label: item.label,
            hint: group.label,
            group: "Navigare",
            capability: item.capability,
            run: () => router.push(item.href),
          })),
        ),
      ];
      return actions.filter(
        (item) =>
          !item.capability ||
          (bootstrap?.membership.capabilities ?? []).includes(item.capability),
      );
    },
    [bootstrap?.membership, openAI, router, setQuickCreate],
  );

  React.useEffect(() => {
    const normalized = query.trim();
    if (!normalized || !currentWorkspace || demoMode) {
      const resetTimer = window.setTimeout(() => setRemote([]), 0);
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => {
      void weddingOsApi
        .search(currentWorkspace.id, normalized)
        .then((result) =>
          setRemote(
            result.items.map((item) => ({
              id: `resource-${item.type}-${item.id}`,
              label: item.title,
              hint: item.subtitle ?? item.type,
              group: "Rezultate",
              run: () => router.push(item.href),
            })),
          ),
        )
        .catch(() => setRemote([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [currentWorkspace, demoMode, query, router]);

  const actions = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const local = normalized
      ? base.filter((item) =>
          `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(normalized),
        )
      : base.slice(0, 12);
    return [...remote, ...local];
  }, [base, query, remote]);
  const grouped = React.useMemo(
    () =>
      Object.entries(
        actions.reduce<Record<string, Action[]>>(
          (result, item) => ({
            ...result,
            [item.group]: [...(result[item.group] ?? []), item],
          }),
          {},
        ),
      ).map(([label, items]) => ({ label, items })),
    [actions],
  );
  const flat = grouped.flatMap((group) => group.items);
  const runAction = (action: Action) => {
    close();
    window.setTimeout(action.run, 40);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comenzi"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-elevated shadow-overlay"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, flat.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && flat[activeIndex]) {
            event.preventDefault();
            runAction(flat[activeIndex]);
          } else if (event.key === "Escape") close();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Caută taskuri, riscuri, Planuri B, automatizări sau pagini…"
            className="h-13 w-full bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
          />
          <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-faint">
            ESC
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 && (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted">
                Niciun rezultat autorizat pentru „{query}”.
              </p>
              <p className="mt-1 text-xs text-faint">
                Căutarea include numai resursele autorizate ale workspace-ului.
              </p>
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                {group.label}
              </p>
              {group.items.map((action) => {
                const index = flat.indexOf(action);
                const active = index === activeIndex;
                return (
                  <button
                    key={action.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runAction(action)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                      active && "bg-brand-soft dark:bg-brand-softer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-lg bg-subtle",
                        active && "text-brand",
                      )}
                      aria-hidden
                    >
                      {action.id === "create-task" ? (
                        <Plus className="size-4" />
                      ) : action.id === "create-event" ? (
                        <CalendarDays className="size-4" />
                      ) : (
                        <Search className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {action.label}
                      </span>
                      {action.hint && (
                        <span className="block truncate text-xs text-faint">
                          {action.hint}
                        </span>
                      )}
                    </span>
                    {active ? (
                      <CornerDownLeft className="size-3.5 text-faint" />
                    ) : (
                      <ArrowRight className="size-3.5 opacity-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex gap-4 border-t border-line bg-surface px-4 py-2.5 text-[11px] text-faint">
          <span>↑↓ navigare</span>
          <span>↵ deschide</span>
          <span>esc închide</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
