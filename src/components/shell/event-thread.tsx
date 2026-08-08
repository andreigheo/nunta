import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type EventThreadItem = {
  label: string;
  value: string;
  href: string;
  icon: LucideIcon;
  tone: "brand" | "accent" | "sun" | "success";
};

const toneClasses: Record<EventThreadItem["tone"], string> = {
  brand: "bg-brand",
  accent: "bg-accent",
  sun: "bg-sun",
  success: "bg-success",
};

export function EventThread({ items }: { items: EventThreadItem[] }) {
  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby="event-thread-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 id="event-thread-title" className="font-brand text-xl font-semibold tracking-[-0.015em] text-brand">
            Firul evenimentului
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Aceeași informație continuă din plan până în ziua evenimentului.
          </p>
        </div>
        <p className="text-xs font-medium text-success">Date din spațiul curent</p>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
        <ol className="grid min-w-[64rem] grid-cols-7" aria-label="Etapele conectate ale evenimentului">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0 border-r border-line last:border-r-0">
                <Link
                  href={item.href}
                  className="group relative flex min-h-28 flex-col px-4 pb-4 pt-5 transition-colors hover:bg-brand-softer/60 focus-visible:bg-brand-softer"
                >
                  <span className={cn("absolute inset-x-0 top-0 h-1", toneClasses[item.tone])} aria-hidden />
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-subtle text-brand transition-colors group-hover:bg-surface">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-faint">{index + 1}/7</span>
                  </span>
                  <span className="mt-3 text-sm font-semibold text-ink">{item.label}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">{item.value}</span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
