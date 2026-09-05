"use client";

import * as React from "react";
import { primaryCta, signInCta, headerNav } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { CtaLink } from "./section";
import { MobileMenu } from "./mobile-menu";

export function MarketingHeader() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-200",
        scrolled
          ? "border-line bg-background shadow-sm"
          : "border-line/60 bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:h-[4.5rem] sm:px-5 lg:px-8 xl:px-12">
        <BrandMark />

        <nav
          aria-label="Navigație principală"
          className="mx-auto hidden items-center gap-1 min-[1101px]:flex"
        >
          {headerNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-ink transition-colors hover:bg-subtle hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CtaLink
            cta={signInCta}
            variant="ghost"
            className="hidden sm:inline-flex"
          />
          <CtaLink
            cta={primaryCta}
            variant="primary"
            className="hidden min-[520px]:inline-flex"
          />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
