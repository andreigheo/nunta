"use client";

import * as React from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { FlowStagePreview } from "@/components/marketing/flow-stage-preview";
import { flow } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

type FlowId = (typeof flow.steps)[number]["id"];
type FlowChapter = (typeof flow.chapters)[number];

const chapterByStepId = Object.fromEntries(
  flow.chapters.flatMap((chapter) =>
    chapter.stepIds.map((stepId) => [stepId, chapter]),
  ),
) as Record<FlowId, FlowChapter>;

const chapterTone = {
  planning: {
    ink: "text-brand",
    fill: "bg-brand",
    tint: "bg-brand-soft",
    span: "col-span-1",
  },
  guests: {
    ink: "text-accent-strong",
    fill: "bg-accent",
    tint: "bg-accent-soft",
    span: "col-span-3",
  },
  vendors: {
    ink: "text-sun-strong",
    fill: "bg-sun",
    tint: "bg-sun-soft",
    span: "col-span-2",
  },
  "event-day": {
    ink: "text-success",
    fill: "bg-success",
    tint: "bg-success-soft",
    span: "col-span-1",
  },
} as const;

const DWELL_MS = 3800;

export function LiveFlow() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const userLockedRef = React.useRef(false);
  const [activeId, setActiveId] = React.useState<FlowId>(flow.steps[0].id);
  const [autoplay, setAutoplay] = React.useState(false);
  const [hoverPaused, setHoverPaused] = React.useState(false);
  const activeIndex = flow.steps.findIndex((step) => step.id === activeId);
  const active = flow.steps[activeIndex] ?? flow.steps[0];
  const previous = activeIndex > 0 ? flow.steps[activeIndex - 1] : null;
  const takes = previous?.next ?? active.trigger;
  const touring = autoplay;

  const stopAutoplay = React.useCallback(() => {
    userLockedRef.current = true;
    setAutoplay(false);
    setHoverPaused(false);
  }, []);

  const selectIndex = React.useCallback(
    (index: number) => {
      const nextIndex = Math.min(flow.steps.length - 1, Math.max(0, index));
      stopAutoplay();
      setActiveId(flow.steps[nextIndex].id);
      buttonRefs.current[nextIndex]?.focus();
    },
    [stopAutoplay],
  );

  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = (visible: boolean) => {
      if (userLockedRef.current || reduced.matches || document.hidden) {
        setAutoplay(false);
        return;
      }
      setAutoplay(visible);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        sync(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.32));
      },
      { threshold: [0, 0.32, 0.6] },
    );
    io.observe(node);
    const firstRect = node.getBoundingClientRect();
    const firstViewport = window.innerHeight || 1;
    sync(
      firstRect.top < firstViewport * 0.72 && firstRect.bottom > firstViewport * 0.28,
    );

    const onVisibility = () => {
      const rect = node.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const visible = rect.top < viewport * 0.72 && rect.bottom > viewport * 0.28;
      sync(visible);
    };

    const onMotion = () => {
      if (reduced.matches) {
        userLockedRef.current = true;
        setAutoplay(false);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotion);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
    };
  }, []);

  React.useEffect(() => {
    if (!autoplay || hoverPaused) return;

    const timer = window.setTimeout(() => {
      if (userLockedRef.current) return;
      setActiveId((current) => {
        const index = flow.steps.findIndex((step) => step.id === current);
        return flow.steps[(index + 1) % flow.steps.length].id;
      });
    }, DWELL_MS);

    return () => window.clearTimeout(timer);
  }, [autoplay, hoverPaused, activeId]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLOListElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex(activeIndex - 1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex(activeIndex + 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectIndex(flow.steps.length - 1);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="flux"
      className="scroll-mt-24 border-y border-line bg-elevated py-11 sm:scroll-mt-[5.5rem] sm:py-16 lg:py-20"
      aria-labelledby="flow-title"
      data-flow-autoplay={touring ? "true" : "false"}
    >
      <div className="marketing-safe-container mx-auto w-full max-w-[90rem] px-4 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(31rem,1.28fr)] lg:items-end lg:gap-12">
          <div>
            <p className="text-sm font-semibold text-accent-strong">
              Cum funcționează Sarbato
            </p>
            <h2
              id="flow-title"
              className="marketing-heading mt-2.5 max-w-[18ch] text-[clamp(2.125rem,9.5vw,2.5rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-ink text-balance sm:mt-3 sm:text-[clamp(2.5rem,4vw,3.5rem)] sm:leading-[1.02]"
            >
              {flow.title}
            </h2>
          </div>
          <p className="max-w-[62ch] text-lg leading-7 text-muted sm:leading-8">
            {flow.lead}
          </p>
        </div>

        <div
          className="mt-6 border border-line bg-surface sm:mt-10"
          onMouseEnter={() => {
            if (autoplay) setHoverPaused(true);
          }}
          onMouseLeave={() => setHoverPaused(false)}
        >
          <div className="border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                Toate etapele
              </p>
              <p className="text-xs leading-5 text-muted">
                {touring ? flow.tourHint : flow.pickHint}
              </p>
            </div>
          </div>

          <div className="border-b border-line bg-subtle px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5 lg:px-0 lg:pt-6 lg:pb-0">
            <div className="mb-3 hidden grid-cols-7 lg:grid">
              {flow.chapters.map((chapter) => {
                const activeChapter = (chapter.stepIds as readonly string[]).includes(
                  active.id,
                );
                const tone = chapterTone[chapter.id];

                return (
                  <div
                    key={chapter.id}
                    className={cn("flex min-w-0 flex-col pr-1.5 last:pr-0", tone.span)}
                  >
                    <p
                      className={cn(
                        "flex min-h-8 flex-1 items-center px-2.5 text-[10px] font-semibold leading-[1.2] tracking-[0.08em] uppercase xl:text-[11px]",
                        tone.tint,
                        tone.ink,
                      )}
                    >
                      {chapter.label}
                    </p>
                    <span
                      aria-hidden
                      className={cn(
                        "block h-[3px] motion-reduce:transition-none motion-safe:transition-opacity motion-safe:duration-200",
                        tone.fill,
                        activeChapter ? "opacity-100" : "opacity-25",
                      )}
                    />
                  </div>
                );
              })}
            </div>

            <ol
              className="flex flex-col lg:-mb-px lg:grid lg:grid-cols-7"
              aria-label="Etapele din Sarbato"
              onKeyDown={onListKeyDown}
            >
              {flow.steps.map((step, index) => {
                const chapter = chapterByStepId[step.id];
                const tone = chapterTone[chapter.id];
                const selected = step.id === active.id;
                const startsChapter = chapter.stepIds[0] === step.id;
                const isFirst = index === 0;
                const isLast = index === flow.steps.length - 1;
                const previousChapter =
                  index > 0 ? chapterByStepId[flow.steps[index - 1].id] : chapter;
                const traversed = activeIndex >= index;
                const incomingFilled = !isFirst && activeIndex >= index;
                const outgoingFilled = !isLast && activeIndex > index;

                return (
                  <li key={step.id} className="relative min-w-0">
                    {startsChapter ? (
                      <p
                        className={cn(
                          "-mx-4 mb-1.5 px-4 py-1.5 text-[10px] font-semibold leading-4 tracking-[0.08em] uppercase sm:-mx-6 sm:px-6 lg:hidden",
                          isFirst ? "mt-0" : "mt-3",
                          tone.tint,
                          tone.ink,
                        )}
                      >
                        {chapter.label}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      ref={(node) => {
                        buttonRefs.current[index] = node;
                      }}
                      onClick={() => {
                        stopAutoplay();
                        setActiveId(step.id);
                      }}
                      aria-pressed={selected}
                      aria-current={selected ? "step" : undefined}
                      tabIndex={selected ? 0 : -1}
                      className={cn(
                        "relative flex min-h-11 w-full touch-manipulation items-center gap-3 py-2 pr-3 pl-4 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 lg:min-h-28 lg:flex-col lg:items-center lg:justify-start lg:gap-1 lg:px-2 lg:pt-10 lg:pb-5 lg:text-center",
                        selected
                          ? "bg-surface shadow-sm lg:shadow-none"
                          : "hover:bg-surface/60",
                      )}
                    >
                      {isFirst ? null : (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-5 right-1/2 left-0 hidden h-[3px] lg:block motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200",
                            incomingFilled
                              ? chapterTone[previousChapter.id].fill
                              : "bg-line-strong",
                          )}
                        />
                      )}
                      {isLast ? null : (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-5 right-0 left-1/2 hidden h-[3px] lg:block motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200",
                            outgoingFilled ? tone.fill : "bg-line-strong",
                          )}
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0 left-0 w-[3px] lg:hidden motion-reduce:transition-none motion-safe:transition-opacity motion-safe:duration-200",
                          tone.fill,
                          traversed ? "opacity-100" : "opacity-25",
                        )}
                      />
                      {selected && touring ? (
                        <span
                          key={step.id}
                          aria-hidden
                          className={cn(
                            "mkt-flow-dwell pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[3px] lg:top-5 lg:bottom-auto lg:left-1/2",
                            tone.fill,
                            hoverPaused && "mkt-flow-dwell-paused",
                          )}
                        />
                      ) : null}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-5 left-1/2 z-[2] hidden -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] lg:block motion-reduce:transition-none motion-safe:transition-[width,height,background-color,border-color] motion-safe:duration-200",
                          selected
                            ? "size-5 border-surface"
                            : "size-3.5 border-subtle",
                          traversed ? tone.fill : "bg-line-strong",
                        )}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "shrink-0 text-[11px] font-semibold leading-4 tabular-nums lg:text-xs",
                          selected ? tone.ink : "text-faint",
                        )}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 text-sm font-semibold leading-5",
                          selected ? "text-ink" : "text-muted",
                        )}
                      >
                        {step.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="border-b border-line p-4 sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
              <div>
                <p className="text-sm font-semibold text-accent-strong">Primește</p>
                <p className="mt-1 max-w-[50ch] text-base leading-6 text-ink">
                  {takes}
                </p>
              </div>
              <h3
                className="marketing-heading mt-5 max-w-[20ch] text-[clamp(1.75rem,8vw,2.125rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-brand text-balance sm:mt-6 sm:text-[clamp(2rem,3vw,3rem)] sm:leading-[1.04] sm:tracking-[-0.03em]"
                aria-live={touring ? "off" : "polite"}
              >
                {active.title}
              </h3>
              <p className="mt-3 max-w-[50ch] text-base leading-6 text-muted sm:mt-4 sm:leading-7">
                {active.description}
              </p>
              <div className="mt-5 border-t border-line pt-4 sm:mt-7 sm:pt-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <span className="lg:hidden">
                    <ArrowDown className="size-4" aria-hidden />
                  </span>
                  <span className="hidden lg:inline">
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                  Dă mai departe
                </p>
                <p className="mt-1 max-w-[50ch] text-base font-semibold leading-6 text-ink">
                  {active.next}
                </p>
              </div>
            </div>

            <div className="marketing-product-surface-flat p-4 sm:p-8 lg:p-10">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted">
                  În produs, după acest pas
                </p>
                <span className="text-xs font-semibold text-faint tabular-nums">
                  {String(activeIndex + 1).padStart(2, "0")} / 07
                </span>
              </div>
              <div
                key={active.id}
                className="mkt-phone-swap mt-3 flex min-w-0 sm:mt-5 lg:min-h-[21.5rem]"
              >
                <FlowStagePreview stageId={active.id} />
              </div>
              <p
                data-testid="showcase-label"
                className="mt-3 text-xs leading-5 text-muted sm:mt-5"
              >
                Exemplu de produs — nu reprezintă datele unui client.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
