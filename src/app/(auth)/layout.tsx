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
    <div className="flex min-h-dvh">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand p-10 text-on-brand lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #d9b98a 0, transparent 42%), radial-gradient(circle at 85% 75%, #91a899 0, transparent 45%), radial-gradient(circle at 60% 40%, #ffffff 0, transparent 30%)",
          }}
        />
        <SarbatoMark href="/sign-in" inverse className="relative" />
        <div className="relative">
          <p className="font-brand text-[34px] font-medium leading-[1.15] tracking-tight text-balance">
            Planul, invitațiile, furnizorii și ziua evenimentului folosesc
            aceeași informație.
          </p>
          <ol className="mt-10 space-y-4 border-t border-on-brand/20 pt-8">
            {flow.map((step, index) => (
              <li key={step} className="flex items-center gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-on-brand/15 text-sm font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="text-[15px] font-medium leading-snug text-on-brand/85">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-on-brand/60">
          Disponibil acum pentru organizarea nunților.
        </p>
      </aside>

      {/* Form side */}
      <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeSegmentedControl />
        </div>
        <div className="w-full max-w-[420px] pt-14 sm:pt-16">
          <SarbatoMark
            href="/sign-in"
            compact
            className="mb-8 flex justify-center lg:hidden"
          />
          <Suspense
            fallback={
              <div
                className="h-96 animate-pulse rounded-2xl bg-subtle"
                role="status"
                aria-label="Se încarcă formularul"
              />
            }
          >
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
