"use client";

import * as React from "react";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
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
    span: "col-span-1",
  },
  guests: {
    ink: "text-accent-strong",
    fill: "bg-accent",
    span: "col-span-3",
  },
  vendors: {
    ink: "text-sun-strong",
    fill: "bg-sun",
    span: "col-span-2",
  },
  "event-day": {
    ink: "text-success",
    fill: "bg-success",
    span: "col-span-1",
  },
} as const;

const resultTone = [
  "bg-accent-soft text-accent-strong",
  "bg-warning-soft text-warning",
  "bg-success-soft text-success",
] as const;

function isChapterStart(stepId: FlowId, chapter: FlowChapter) {
  return chapter.stepIds[0] === stepId;
}

function showMobileChapter(stepId: FlowId, chapter: FlowChapter) {
  if (!isChapterStart(stepId, chapter)) return false;
  const step = flow.steps.find((item) => item.id === stepId);
  return !(chapter.stepIds.length === 1 && chapter.label === step?.label);
}

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
          <div className="relative border-b border-line px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                Firul complet al evenimentului
              </p>
              <p className="text-xs leading-5 text-muted">
                {touring ? flow.tourHint : flow.pickHint}
              </p>
            </div>
            {touring ? (
              <span
                key={active.id}
                aria-hidden
                className={cn(
                  "mkt-flow-dwell pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-brand",
                  hoverPaused && "mkt-flow-dwell-paused",
                )}
              />
            ) : null}
          </div>

          <div className="border-b border-line bg-subtle px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <div className="mb-3 hidden grid-cols-7 lg:grid">
              {flow.chapters.map((chapter) => {
                const activeChapter = (chapter.stepIds as readonly string[]).includes(
                  active.id,
                );

                return (
                  <p
                    key={chapter.id}
                    className={cn(
                      "px-1 text-xs font-semibold leading-4",
                      chapterTone[chapter.id].ink,
                      chapterTone[chapter.id].span,
                    )}
                  >
                    {chapter.label}
                    <span
                      aria-hidden
                      className={cn(
                        "mt-2 block h-0.5 rounded-full motion-reduce:transition-none motion-safe:transition-opacity motion-safe:duration-200",
                        chapterTone[chapter.id].fill,
                        activeChapter ? "opacity-100" : "opacity-35",
                      )}
                    />
                  </p>
                );
              })}
            </div>

            <ol
              className="flex flex-col lg:grid lg:grid-cols-7"
              aria-label="Etapele informației în Sarbato"
              onKeyDown={onListKeyDown}
            >
              {flow.steps.map((step, index) => {
                const chapter = chapterByStepId[step.id];
                const selected = step.id === active.id;
                const showChapter = showMobileChapter(step.id, chapter);
                const isFirst = index === 0;
                const isLast = index === flow.steps.length - 1;
                const nextStep = flow.steps[index + 1];
                const nextShowsChapter = nextStep
                  ? showMobileChapter(nextStep.id, chapterByStepId[nextStep.id])
                  : false;
                const previousChapter =
                  index > 0 ? chapterByStepId[flow.steps[index - 1].id] : chapter;
                const incomingFilled = !isFirst && activeIndex >= index;
                const outgoingFilled = !isLast && activeIndex > index;

                return (
                  <li key={step.id} className="relative min-w-0">
                    {showChapter ? (
                      <p
                        className={cn(
                          "pb-1 pl-7 text-xs font-semibold leading-4 lg:hidden",
                          chapterTone[chapter.id].ink,
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
                      className="relative flex min-h-11 w-full touch-manipulation items-center gap-3 py-1 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-16 lg:flex-col lg:items-center lg:justify-start lg:gap-2 lg:px-1 lg:pt-0 lg:text-center"
                    >
                      {isFirst ? null : (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-[0.375rem] right-[calc(50%+0.5rem)] left-0 hidden h-0.5 lg:block motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200",
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
                            "absolute top-[0.375rem] left-[calc(50%+0.5rem)] right-0 hidden h-0.5 lg:block motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200",
                            outgoingFilled
                              ? chapterTone[chapter.id].fill
                              : "bg-line-strong",
                          )}
                        />
                      )}
                      {isLast ? null : (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-[5px] w-0.5 lg:hidden motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200",
                            outgoingFilled
                              ? chapterTone[chapter.id].fill
                              : "bg-line-strong",
                          )}
                          style={{
                            top: "1.375rem",
                            bottom: nextShowsChapter ? "-2.625rem" : "-1.375rem",
                          }}
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          "relative z-[1] rounded-full border-2 motion-reduce:transition-none motion-safe:transition-[width,height,background-color,border-color] motion-safe:duration-200",
                          selected
                            ? "size-3.5 border-brand bg-brand"
                            : "size-3 border-line-strong bg-surface",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 text-sm font-semibold leading-5",
                          selected ? "text-brand" : "text-muted",
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
                <p className="text-sm font-semibold text-accent-strong">Preia</p>
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
                  Predă
                </p>
                <p className="mt-1 max-w-[50ch] text-base font-semibold leading-6 text-ink">
                  {active.next}
                </p>
              </div>
            </div>

            <div className="marketing-product-surface-flat p-4 sm:p-8 lg:p-10">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted">
                  Devine disponibil în produs
                </p>
                <span className="text-xs font-semibold text-faint tabular-nums">
                  {String(activeIndex + 1).padStart(2, "0")} / 07
                </span>
              </div>
              <ul
                className="mt-3 divide-y divide-line border-y border-line sm:mt-5"
                aria-label="Rezultatele etapei"
              >
                {active.results.map((result, index) => (
                  <li
                    key={result}
                    className="flex min-h-12 items-center gap-3 py-2.5 sm:min-h-14 sm:gap-4 sm:py-3"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        resultTone[Math.min(index, resultTone.length - 1)],
                      )}
                    >
                      <Check className="size-4" strokeWidth={2.2} aria-hidden />
                    </span>
                    <span className="text-base font-semibold leading-6 text-ink">
                      {result}
                    </span>
                  </li>
                ))}
              </ul>
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
