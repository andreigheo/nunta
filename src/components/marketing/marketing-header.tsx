"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
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
      <div className="relative mx-auto flex h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:h-[4.5rem] sm:px-5 min-[821px]:pr-14 min-[941px]:pr-5 lg:px-10 xl:px-12">
        <BrandMark className="min-[821px]:max-[940px]:[&>span>span:first-child]:text-[1.75rem]" />

        <nav
          aria-label="Navigație principală"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 min-[821px]:flex min-[821px]:max-[1100px]:left-[43%] min-[1101px]:max-[1240px]:left-[46%]"
        >
          {headerNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-[0.68rem] font-medium text-ink transition-colors hover:bg-subtle hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 min-[1241px]:px-3 min-[1241px]:text-[0.82rem]"
            >
              {item.label}
              {item.label !== "Despre noi" ? (
                <ChevronDown
                  aria-hidden
                  className="size-2.5 opacity-65 min-[1241px]:size-3.5"
                />
              ) : null}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 min-[821px]:max-[940px]:mr-9 min-[821px]:max-[940px]:gap-[1.1rem]">
          <CtaLink
            cta={signInCta}
            variant="ghost"
            className="hidden sm:inline-flex min-[821px]:max-[940px]:px-0 min-[821px]:max-[940px]:text-[0.52rem]"
          />
          <CtaLink
            cta={primaryCta}
            variant="primary"
            className="hidden min-[520px]:inline-flex min-[821px]:max-[940px]:px-3 min-[821px]:max-[940px]:text-[0.52rem]"
          />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
