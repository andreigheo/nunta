import type { Metadata } from "next";
import { DomainStory } from "@/components/marketing/domain-story";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { LiveFlow } from "@/components/marketing/live-flow";
import { PlanningStory } from "@/components/marketing/planning-story";
import { PricingSection } from "@/components/marketing/pricing-section";
import { PublicProofSection } from "@/components/marketing/public-proof-section";
import { TrustSection } from "@/components/marketing/trust-section";
import { productStories } from "@/content/marketing/sarbato";
import { getMarketingProductProof } from "@/lib/marketing/product-proof";

const title = "Sarbato — plan, invitații, furnizori și ziua nunții, împreună";
const description =
  "Invitație, RSVP, logistică, furnizori, buget și coordonarea zilei nunții, în același loc.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    siteName: "Sarbato",
    title,
    description,
  },
  twitter: { card: "summary", title, description },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Sarbato",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
  inLanguage: "ro",
  description,
};

export default async function LandingPage() {
  const proof = await getMarketingProductProof();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <LiveFlow />
      <div role="region" aria-label="Povestea produsului Sarbato">
        <PlanningStory />
        {/* Capitolul de planificare ocupă poziția 0, deci restul păstrează
            alternanța stânga/dreapta pornind de la 1. */}
        {productStories.map((story, index) => (
          <DomainStory key={story.id} story={story} index={index + 1} />
        ))}
      </div>
      <TrustSection />
      <PricingSection />
      <PublicProofSection proof={proof} />
      <FaqSection />
      <FinalCta />
    </>
  );
}
