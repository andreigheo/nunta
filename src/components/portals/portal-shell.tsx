"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { Badge } from "@/components/ui";
import { ThemeCycleButton } from "@/lib/theme";

export function PortalShell({
  role,
  title,
  subtitle,
  children,
  backHref = "/overview",
  backLabel = "Sarbato",
}: {
  role: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-brand focus:px-4 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Sari la conținut
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid min-h-[4.5rem] w-full max-w-[90rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-4 py-2 sm:flex sm:h-[4.5rem] sm:flex-nowrap sm:gap-3 sm:px-8 sm:py-0 lg:px-10 xl:px-12">
          <SarbatoMark href={backHref} compact />
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <Badge
            variant="brand"
            className="col-start-1 row-start-2 w-fit max-w-full justify-self-start overflow-hidden text-ellipsis sm:col-auto sm:row-auto"
          >
            {role}
          </Badge>
          <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-1 justify-self-end sm:ml-auto sm:gap-1.5">
            <ThemeCycleButton />
            <Link
              href={backHref}
              aria-label={`Înapoi la ${backLabel}`}
              className="inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-muted transition-colors hover:bg-subtle hover:text-ink sm:h-11 sm:w-auto sm:px-3"
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          </div>
        </div>
      </header>

      <main
        id="portal-main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[90rem] px-4 py-8 pb-16 sm:px-8 sm:py-10 lg:px-10 xl:px-12"
      >
        <header className="mb-8 border-b border-line pb-6">
          <h1 className="font-brand text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-brand text-balance sm:text-[36px]">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-muted">{subtitle}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
