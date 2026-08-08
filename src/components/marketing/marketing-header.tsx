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
      <div className="mx-auto flex h-[4.5rem] w-full max-w-[90rem] items-center gap-3 px-5 sm:px-8 lg:px-10 xl:px-12">
        <BrandMark />

        <nav
          aria-label="Navigație principală"
          className="ml-7 hidden items-center gap-1 xl:flex"
        >
          {headerNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CtaLink
            cta={signInCta}
            variant="ghost"
            className="hidden sm:inline-flex"
          />
          <CtaLink
            cta={{ ...primaryCta, label: "Creează eveniment" }}
            variant="primary"
            className="hidden min-[520px]:inline-flex"
          />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
