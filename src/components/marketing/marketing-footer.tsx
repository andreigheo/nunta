import Link from "next/link";
import { footer } from "@/content/marketing/sarbato";
import { BrandMark } from "./brand-mark";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="marketing-safe-container mx-auto w-full max-w-[90rem] px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-14 sm:pb-[max(3.5rem,env(safe-area-inset-bottom))] lg:px-10 lg:py-16 lg:pb-[max(4rem,env(safe-area-inset-bottom))] xl:px-12">
        <div className="grid gap-9 sm:gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div>
            <BrandMark />
            <p className="mt-5 max-w-xs text-base leading-7 text-muted">
              {footer.tagline}
            </p>
            <p className="mt-5 max-w-xs bg-brand-softer px-4 py-3 text-sm font-semibold leading-6 text-brand">
              {footer.stageNote}
            </p>
          </div>

          <nav
            className="grid grid-cols-1 gap-x-6 gap-y-8 min-[360px]:grid-cols-2 sm:grid-cols-4 sm:gap-8"
            aria-label="Navigație subsol"
          >
            {footer.columns.map((column) => (
              <div key={column.title}>
                <h2 className="text-sm font-semibold text-ink">
                  {column.title}
                </h2>
                <ul className="mt-4 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-brand hover:underline hover:underline-offset-4"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 sm:mt-12 sm:pt-6">
          <p className="text-xs text-muted">
            © 2026 Sarbato. Toate drepturile rezervate.
          </p>
          <p className="text-xs text-muted">Totul rămâne legat.</p>
        </div>
      </div>
    </footer>
  );
}
