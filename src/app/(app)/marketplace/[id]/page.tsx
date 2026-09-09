"use client";

import * as React from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  Flag,
  Heart,
  ImageIcon,
  Languages,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { vendors as demoVendors } from "@/lib/data/vendors";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Modal,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from "@/components/ui";

type PublicVendor = OperationResource & {
  services: OperationResource[];
  packages: OperationResource[];
  serviceRegions: OperationResource[];
  portfolio: OperationResource[];
};

export default function VendorProfilePage() {
  const { id: slug } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, demoMode } = useWorkspace();
  const [vendor, setVendor] = React.useState<PublicVendor | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [reviews, setReviews] = React.useState<OperationResource[]>([]);
  const [ratingSummary, setRatingSummary] = React.useState<
    Record<string, unknown>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [reportedReview, setReportedReview] =
    React.useState<OperationResource | null>(null);
  const [reportReason, setReportReason] = React.useState("INACCURATE_CONTENT");
  const [reportDetails, setReportDetails] = React.useState("");
  const [reporting, setReporting] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!slug) {
        setLoading(false);
        return;
      }
      if (demoMode) {
        const match = demoVendors.find(
          (item) =>
            `demo-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` ===
            slug,
        );
        if (match) {
          setVendor({
            id: `demo-profile-${match.id}`,
            version: 1,
            vendorOrganizationId: match.id,
            headline: match.name,
            shortDescription: `${match.category} · ${match.city}`,
            description: match.description,
            categories: [match.category],
            languages: ["ro"],
            startingPriceMinor: match.startingPrice * 100,
            responseTimeLabel: match.responseTime,
            yearsExperience: yearsFromDescription(match.description),
            verificationStatus: match.verified ? "VERIFIED" : "UNVERIFIED",
            publicEmail: null,
            publicPhone: null,
            coverImageUrl: null,
            logoUrl: null,
            serviceRegions: [
              {
                id: `demo-region-${match.id}`,
                version: 1,
                city: match.city,
                region: null,
                country: null,
              },
            ],
            services: [
              {
                id: `demo-service-${match.id}`,
                version: 1,
                name: match.category,
                description: match.description,
                category: match.category,
                startingPriceMinor: match.startingPrice * 100,
              },
            ],
            packages: [],
            portfolio: [],
          });
          setRatingSummary({
            publishedReviewCount: match.reviews,
            overallAverageScaled: Math.round(match.rating * 100),
          });
        }
        setLoading(false);
        return;
      }
      void Promise.all([
        weddingOsApi.marketplaceVendor(slug),
        currentWorkspace
          ? weddingOsApi.vendorFavorites(currentWorkspace.id)
          : Promise.resolve({ items: [] }),
        weddingOsApi.marketplaceReviews(slug),
      ])
        .then(([profile, favorites, reviewResult]) => {
          setVendor(profile as PublicVendor);
          setSaved(
            favorites.items.some(
              (item) =>
                item.vendorOrganizationId === profile.vendorOrganizationId,
            ),
          );
          setReviews(reviewResult.items);
          setRatingSummary(reviewResult.summary as Record<string, unknown>);
        })
        .catch((error) =>
          toast({
            title: "Profilul nu a putut fi încărcat",
            description: apiErrorMessage(error),
            variant: "error",
          }),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentWorkspace, demoMode, slug, toast]);

  const toggleFavorite = async () => {
    if (!vendor || !currentWorkspace || demoMode) return;
    const next = !saved;
    setSaved(next);
    try {
      await weddingOsApi.setVendorFavorite(
        currentWorkspace.id,
        String(vendor.vendorOrganizationId),
        next,
      );
    } catch (error) {
      setSaved(!next);
      toast({
        title: "Favoritul nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const submitReport = async () => {
    if (!reportedReview || !currentWorkspace || demoMode) return;
    setReporting(true);
    try {
      await weddingOsApi.reportReview(currentWorkspace.id, reportedReview.id, {
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setReportedReview(null);
      setReportDetails("");
      toast({
        title: "Raport trimis",
        description: "Cazul a intrat în coada reală de moderare.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Raportul nu a fost trimis",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <Card className="mx-auto max-w-3xl p-10 text-center text-sm text-muted">
        Se încarcă profilul public…
      </Card>
    );
  }
  if (!vendor) {
    return (
      <div className="mx-auto max-w-3xl pt-16">
        <EmptyState
          icon={MapPin}
          title="Furnizor negăsit"
          description="Profilul nu există, nu este publicat sau modul demo este activ."
          action={{
            label: "Înapoi la marketplace",
            onClick: () => router.push("/marketplace"),
          }}
        />
      </div>
    );
  }

  const regions = vendor.serviceRegions ?? [];
  const categories = Array.isArray(vendor.categories)
    ? vendor.categories.map(String)
    : [];
  const languages = Array.isArray(vendor.languages)
    ? vendor.languages.map(String)
    : [];
  const startingPrice = Number(vendor.startingPriceMinor ?? 0) / 100;
  const reviewCount = Number(ratingSummary.publishedReviewCount ?? 0);
  const rating = Number(ratingSummary.overallAverageScaled ?? 0) / 100;
  const initials = initialsFor(String(vendor.headline));

  return (
    <div
      className="mx-auto max-w-7xl space-y-4 pb-20"
      data-testid="vendor-public-profile"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/marketplace")}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Marketplace
      </Button>

      <section
        className="overflow-hidden rounded-[18px] border border-line bg-surface"
        aria-labelledby="vendor-profile-title"
      >
        <div className="relative h-48 bg-brand-panel sm:h-64 lg:h-72">
          {vendor.coverImageUrl ? (
            <Image
              src={String(vendor.coverImageUrl)}
              alt={`Coperta profilului ${String(vendor.headline)}`}
              fill
              unoptimized
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-end justify-end p-5 text-on-brand-panel/75">
              <span className="text-sm font-medium">Profil public Sarbato</span>
            </div>
          )}
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 lg:left-8">
            <div className="relative flex size-28 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-brand-soft text-3xl font-semibold text-brand shadow-card sm:size-32">
              {vendor.logoUrl ? (
                <Image
                  src={String(vendor.logoUrl)}
                  alt={`Sigla ${String(vendor.headline)}`}
                  fill
                  unoptimized
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <span aria-hidden>{initials}</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-16 sm:px-6 sm:pb-5 sm:pt-5 sm:pl-44 lg:px-8 lg:pl-48">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1
                  id="vendor-profile-title"
                  className="font-brand text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
                >
                  {String(vendor.headline)}
                </h1>
                {vendor.verificationStatus === "VERIFIED" ? (
                  <span
                    className="inline-flex items-center gap-1 text-sm font-medium text-success"
                    title="Identitate verificată de Sarbato"
                  >
                    <BadgeCheck className="size-5" aria-hidden />
                    Verificat
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
                {String(vendor.shortDescription ?? "Profil public Sarbato")}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted sm:justify-start">
                {reviewCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <Star
                      className="size-4 fill-accent text-accent"
                      aria-hidden
                    />
                    {rating.toFixed(1)} · {reviewCount}{" "}
                    {reviewCount === 1 ? "recenzie" : "recenzii"}
                  </span>
                ) : (
                  <span>Nicio evaluare publicată încă</span>
                )}
                <span>
                  {vendor.services.length}{" "}
                  {vendor.services.length === 1 ? "serviciu" : "servicii"}
                </span>
                {vendor.yearsExperience !== null &&
                vendor.yearsExperience !== undefined ? (
                  <span>{Number(vendor.yearsExperience)} ani experiență</span>
                ) : null}
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 min-[380px]:flex-row sm:w-auto sm:shrink-0">
              <Button
                className="flex-1 sm:flex-none"
                variant={saved ? "secondary" : "outline"}
                onClick={() => void toggleFavorite()}
              >
                <Heart
                  className={
                    saved ? "size-4 fill-current text-danger" : "size-4"
                  }
                  aria-hidden
                />
                {saved ? "Salvat" : "Salvează"}
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() =>
                  router.push(
                    `/requests?vendor=${encodeURIComponent(String(vendor.vendorOrganizationId))}`,
                  )
                }
              >
                Cere ofertă
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-line px-2 sm:px-5 lg:px-7">
          <Tabs defaultValue="overview">
            <TabsList
              className="w-full justify-start overflow-x-auto rounded-none border-0 bg-transparent p-0"
              aria-label="Secțiunile profilului furnizorului"
            >
              <TabsTrigger value="overview">Prezentare</TabsTrigger>
              <TabsTrigger value="services">Servicii</TabsTrigger>
              <TabsTrigger value="packages">Pachete</TabsTrigger>
              <TabsTrigger value="portfolio">Portofoliu</TabsTrigger>
              <TabsTrigger value="reviews">Recenzii</TabsTrigger>
            </TabsList>

            <div className="-mx-2 border-t border-line bg-background px-2 py-5 sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab
                  vendor={vendor}
                  regions={regions}
                  categories={categories}
                  languages={languages}
                  startingPrice={startingPrice}
                  reviews={reviews}
                />
              </TabsContent>
              <TabsContent value="services" className="mt-0">
                <ServicesTab services={vendor.services} />
              </TabsContent>
              <TabsContent value="packages" className="mt-0">
                <PackagesTab packages={vendor.packages} />
              </TabsContent>
              <TabsContent value="portfolio" className="mt-0">
                <PortfolioTab
                  items={vendor.portfolio}
                  vendorName={String(vendor.headline)}
                />
              </TabsContent>
              <TabsContent value="reviews" className="mt-0">
                <ReviewsTab
                  reviews={reviews}
                  currentWorkspace={Boolean(currentWorkspace)}
                  demoMode={demoMode}
                  onReport={(review) => {
                    setReportedReview(review);
                    setReportReason("INACCURATE_CONTENT");
                    setReportDetails("");
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </section>

      <Modal
        open={Boolean(reportedReview)}
        onClose={() => !reporting && setReportedReview(null)}
        title="Raportează recenzia"
        description="Raportul este privat și ajunge la Platform Trust; nu ascunde automat conținutul."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={reporting}
              onClick={() => setReportedReview(null)}
            >
              Renunță
            </Button>
            <Button disabled={reporting} onClick={() => void submitReport()}>
              <Flag className="size-4" aria-hidden />
              Trimite raportul
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motiv">
            <select
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
            >
              <option value="INACCURATE_CONTENT">Conținut inexact</option>
              <option value="PRIVATE_INFORMATION">Informații private</option>
              <option value="HARASSMENT">Hărțuire</option>
              <option value="SPAM">Spam</option>
              <option value="OTHER">Alt motiv</option>
            </select>
          </Field>
          <Field label="Detalii private" hint={`${reportDetails.length}/2000`}>
            <Textarea
              rows={5}
              maxLength={2000}
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function yearsFromDescription(description: string) {
  const match = description.match(/(\d+)\s+ani/i);
  return match ? Number(match[1]) : null;
}

function OverviewTab({
  vendor,
  regions,
  categories,
  languages,
  startingPrice,
  reviews,
}: {
  vendor: PublicVendor;
  regions: OperationResource[];
  categories: string[];
  languages: string[];
  startingPrice: number;
  reviews: OperationResource[];
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)]">
      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Despre</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {String(vendor.description)}
              </p>
            </div>
            <div className="space-y-3 border-t border-line pt-4 text-sm">
              {categories.length ? (
                <ProfileFact icon={BriefcaseBusiness}>
                  {categories.map(categoryLabel).join(" · ")}
                </ProfileFact>
              ) : null}
              {regions.length ? (
                <ProfileFact icon={MapPin}>
                  {regions
                    .map((region) =>
                      [region.city, region.region, region.country]
                        .filter(Boolean)
                        .join(", "),
                    )
                    .filter(Boolean)
                    .join(" · ")}
                </ProfileFact>
              ) : null}
              {languages.length ? (
                <ProfileFact icon={Languages}>
                  {languages.map(languageLabel).join(", ")}
                </ProfileFact>
              ) : null}
              {vendor.responseTimeLabel ? (
                <ProfileFact icon={Clock3}>
                  {String(vendor.responseTimeLabel)}
                </ProfileFact>
              ) : null}
              {vendor.publicEmail ? (
                <ProfileLink
                  icon={Mail}
                  href={`mailto:${String(vendor.publicEmail)}`}
                >
                  {String(vendor.publicEmail)}
                </ProfileLink>
              ) : null}
              {vendor.publicPhone ? (
                <ProfileLink
                  icon={Phone}
                  href={`tel:${String(vendor.publicPhone)}`}
                >
                  {String(vendor.publicPhone)}
                </ProfileLink>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted">Preț public</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {startingPrice
                ? `de la ${formatRON(startingPrice)}`
                : "Preț la cerere"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Prețul este orientativ. Oferta finală depinde de data, locația și
              serviciile selectate.
            </p>
          </CardContent>
        </Card>
      </aside>

      <main className="space-y-4">
        <ProfileFeedCard
          icon={BriefcaseBusiness}
          title="Servicii disponibile"
          description="Oferta publicată de furnizor"
        >
          {vendor.services.length ? (
            <div className="divide-y divide-line">
              {vendor.services.slice(0, 3).map((service) => (
                <div key={service.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-ink">
                        {String(service.name)}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {String(service.description)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-ink">
                      {service.startingPriceMinor
                        ? `de la ${formatRON(Number(service.startingPriceMinor) / 100)}`
                        : "La cerere"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Furnizorul nu a publicat încă servicii active.
            </p>
          )}
        </ProfileFeedCard>

        {vendor.portfolio.length ? (
          <ProfileFeedCard
            icon={ImageIcon}
            title="Portofoliu"
            description="Selecție publicată și verificată pentru afișare"
          >
            <PortfolioGrid
              items={vendor.portfolio.slice(0, 6)}
              vendorName={String(vendor.headline)}
            />
          </ProfileFeedCard>
        ) : null}

        {reviews.length ? (
          <ProfileFeedCard
            icon={Star}
            title="Ce spun clienții"
            description="Recenzii legate de rezervări finalizate"
          >
            <ReviewCard review={reviews[0]!} />
          </ProfileFeedCard>
        ) : null}
      </main>
    </div>
  );
}

function ServicesTab({ services }: { services: OperationResource[] }) {
  if (!services.length) {
    return (
      <EmptyState
        icon={BriefcaseBusiness}
        title="Fără servicii publicate"
        description="Furnizorul nu a publicat încă servicii active."
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {services.map((service) => (
        <Card key={service.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">{String(service.name)}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {String(service.description)}
                </p>
              </div>
              <Badge variant="neutral">
                {categoryLabel(String(service.category ?? "OTHER"))}
              </Badge>
            </div>
            <p className="mt-4 text-sm font-semibold text-ink">
              {service.startingPriceMinor
                ? `de la ${formatRON(Number(service.startingPriceMinor) / 100)}`
                : "Preț la cerere"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PackagesTab({ packages }: { packages: OperationResource[] }) {
  if (!packages.length) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Fără pachete publicate"
        description="Poți solicita o ofertă personalizată."
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {packages.map((item) => {
        const included = Array.isArray(item.includedItems)
          ? item.includedItems.map(String)
          : [];
        return (
          <Card key={item.id}>
            <CardContent className="flex h-full flex-col p-5">
              <p className="font-semibold text-ink">{String(item.name)}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                {String(item.description)}
              </p>
              {included.length ? (
                <ul className="mt-4 space-y-1.5 text-sm text-muted">
                  {included.slice(0, 5).map((entry) => (
                    <li key={entry} className="flex items-start gap-2">
                      <BadgeCheck
                        className="mt-0.5 size-4 shrink-0 text-success"
                        aria-hidden
                      />
                      {entry}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-5 text-xl font-semibold text-ink">
                {item.basePriceMinor
                  ? formatRON(Number(item.basePriceMinor) / 100)
                  : "La cerere"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PortfolioTab({
  items,
  vendorName,
}: {
  items: OperationResource[];
  vendorName: string;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="Fără portofoliu public"
        description="Nu sunt imagini publicate pentru acest profil."
      />
    );
  }
  return <PortfolioGrid items={items} vendorName={vendorName} />;
}

function PortfolioGrid({
  items,
  vendorName,
}: {
  items: OperationResource[];
  vendorName: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <a
          key={item.id}
          href={String(item.url)}
          target="_blank"
          rel="noreferrer"
          className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Deschide ${String(item.title ?? "imagine din portofoliu")}`}
        >
          <Image
            src={String(item.url)}
            alt={String(item.altText ?? `Portofoliu ${vendorName}`)}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/80 px-3 py-2 text-xs font-medium text-white">
            <span className="truncate">
              {String(item.title ?? "Referință")}
            </span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </span>
        </a>
      ))}
    </div>
  );
}

function ReviewsTab({
  reviews,
  currentWorkspace,
  demoMode,
  onReport,
}: {
  reviews: OperationResource[];
  currentWorkspace: boolean;
  demoMode: boolean;
  onReport: (review: OperationResource) => void;
}) {
  if (!reviews.length) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="Nicio evaluare încă"
        description="Ratingul apare numai după publicarea unei recenzii legate de o rezervare finalizată."
      />
    );
  }
  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="p-5">
            <ReviewCard review={review} />
            <Button
              className="mt-4"
              size="sm"
              variant="ghost"
              disabled={!currentWorkspace || demoMode}
              onClick={() => onReport(review)}
            >
              <Flag className="size-4" aria-hidden />
              Raportează
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: OperationResource }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">
            {String(review.publicDisplayName ?? "Cuplu verificat")}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-success">
            <BadgeCheck className="size-3.5" aria-hidden />
            Experiență verificată prin rezervare
          </p>
        </div>
        <span
          className="flex gap-0.5"
          aria-label={`${Number(review.overallRating)} stele`}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`size-4 text-accent ${star <= Number(review.overallRating) ? "fill-current" : ""}`}
              aria-hidden
            />
          ))}
        </span>
      </div>
      <h3 className="mt-4 font-medium text-ink">{String(review.title)}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
        {String(review.body)}
      </p>
      {review.reply && typeof review.reply === "object" ? (
        <div className="mt-4 rounded-lg bg-subtle p-4">
          <p className="text-xs font-semibold text-ink">
            Răspunsul furnizorului
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {String((review.reply as Record<string, unknown>).body)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ProfileFeedCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start gap-3 border-b border-line pb-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{description}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ProfileFact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2 text-muted">
      <Icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function ProfileLink({
  icon: Icon,
  href,
  children,
}: {
  icon: LucideIcon;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="flex min-h-11 items-center gap-2 text-brand underline-offset-4 hover:underline"
      href={href}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-all">{children}</span>
    </a>
  );
}

function initialsFor(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("ro-RO");
}

function languageLabel(value: string) {
  const labels: Record<string, string> = {
    ro: "Română",
    "ro-RO": "Română",
    en: "Engleză",
    "en-US": "Engleză",
    fr: "Franceză",
    de: "Germană",
    it: "Italiană",
  };
  return labels[value] ?? value;
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    VENUE: "Locație",
    PHOTOGRAPHY: "Fotografie",
    VIDEOGRAPHY: "Videografie",
    CATERING: "Catering",
    MUSIC: "Muzică",
    DECOR: "Decor",
    FLOWERS: "Flori",
    TRANSPORT: "Transport",
    ACCOMMODATION: "Cazare",
    CAKE: "Tort",
    OTHER: "Alt serviciu",
  };
  return labels[value] ?? value.toLocaleLowerCase("ro-RO").replaceAll("_", " ");
}
