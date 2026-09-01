"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Drawer } from "@/components/ui";
import { headerNav, primaryCta, signInCta } from "@/content/marketing/sarbato";
import { BrandMark } from "./brand-mark";
import { CtaLink } from "./section";

/**
 * Navigația mobilă: buton hamburger + Drawer (focus trap, Escape,
 * restaurare focus, implementate de primitiva din ui/modal.tsx).
 */
export function MobileMenu() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-[821px]:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Deschide meniul"
        aria-expanded={open}
        className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={<BrandMark compact />}
      >
        <nav aria-label="Navigație mobilă" className="flex flex-col gap-1 p-4">
          {headerNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-ink transition-colors hover:bg-subtle"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <CtaLink cta={primaryCta} variant="primary" className="w-full" />
            <CtaLink cta={signInCta} variant="outline" className="w-full" />
          </div>
        </nav>
      </Drawer>
    </div>
  );
}
