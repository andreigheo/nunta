import type { Metadata } from "next";
import { ProductFirstControlRoom } from "@/components/marketing/product-first-control-room";
import { getMarketingProductProof } from "@/lib/marketing/product-proof";

const title = "Sarbato — tot evenimentul, într-un singur fir";
const description =
  "Plan, oameni, furnizori, buget și ziua evenimentului — conectate într-un singur spațiu pentru organizatori.";
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
  applicationCategory: "BusinessApplication",
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
      <ProductFirstControlRoom proof={proof} />
    </>
  );
}
