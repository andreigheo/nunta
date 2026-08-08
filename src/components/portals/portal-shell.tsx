"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
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
      <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <SarbatoMark href={backHref} compact className="min-w-0" />
          <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
          <Badge variant="brand">{role}</Badge>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeCycleButton />
            <Link
              href={backHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">{backLabel}</span>
              <ExternalLink className="size-3.5 sm:hidden" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-16 sm:px-6 sm:py-8">
        <div className="mb-7">
          <h1 className="font-brand text-[28px] font-semibold leading-tight tracking-tight text-ink text-balance sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
