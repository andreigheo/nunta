import type { Viewport } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { PublicCookiePreferences } from "@/components/marketing/cookie-preferences";

export const viewport: Viewport = {
  themeColor: "#f7f7f3",
  viewportFit: "cover",
};

/**
 * Layout dedicat suprafețelor publice (landing + pagini legale).
 *
 * `.marketing-light` redeclară tokenurile light și `color-scheme: light`,
 * deci pagina rămâne luminoasă indiferent de tema aleasă în aplicație.
 * Aplicația autentificată nu folosește acest wrapper și își păstrează
 * suportul Light / Dark / System.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-light min-h-dvh">
      <a
        href="#continut"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-brand"
      >
        Sari la conținut
      </a>
      <MarketingHeader />
      <main id="continut" tabIndex={-1}>
        {children}
      </main>
      <MarketingFooter />
      <PublicCookiePreferences />
    </div>
  );
}
