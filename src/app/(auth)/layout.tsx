import { Suspense } from "react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { ThemeSegmentedControl } from "@/lib/theme";

const flow = [
  "Planificare",
  "Invitații și RSVP",
  "Furnizori și buget",
  "Ziua evenimentului",
] as const;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="relative hidden w-[42%] min-w-[400px] flex-col justify-between overflow-hidden bg-brand-panel p-10 text-on-brand-panel dark:bg-sunken lg:flex xl:p-12">
        <SarbatoMark href="/" inverse className="relative" />
        <div className="relative max-w-[31rem]">
          <p className="font-brand text-[38px] font-semibold leading-[1.08] tracking-[-0.03em] text-balance xl:text-[42px]">
            Un singur fir pentru tot evenimentul.
          </p>
          <p className="mt-4 max-w-[36rem] text-[15px] leading-6 text-on-brand-panel/72 dark:text-muted">
            Planul, invitațiile, furnizorii și ziua evenimentului folosesc aceeași informație.
          </p>
          <ol className="relative mt-9 space-y-4 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-on-brand-panel/20 dark:before:bg-line">
            {flow.map((step, index) => (
              <li key={step} className="relative flex items-center gap-4">
                <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-on-brand-panel/25 bg-brand-panel-strong text-sm font-semibold tabular-nums dark:border-line-strong dark:bg-elevated">
                  {index + 1}
                </span>
                <span className="text-[15px] font-medium leading-snug text-on-brand-panel/86 dark:text-ink">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-on-brand-panel/58 dark:text-faint">
          Pentru orice tip de eveniment. Direct din browser.
        </p>
      </aside>

      <main className="flex min-h-dvh flex-1 flex-col items-center justify-start px-4 py-6 sm:px-8 sm:py-8 lg:justify-center">
        <div className="w-full max-w-[468px] lg:my-auto">
          <div className="mb-7 flex justify-end">
            <ThemeSegmentedControl compactOnMobile />
          </div>
          <SarbatoMark
            href="/"
            compact
            className="mb-8 flex justify-center lg:hidden"
          />
          <section className="bg-transparent sm:rounded-[14px] sm:border sm:border-line sm:bg-elevated sm:px-7 sm:py-7">
            <Suspense
              fallback={
                <div
                  className="h-96 animate-pulse rounded-[14px] bg-subtle"
                  role="status"
                  aria-label="Se încarcă formularul"
                />
              }
            >
              {children}
            </Suspense>
          </section>
        </div>
      </main>
    </div>
  );
}
