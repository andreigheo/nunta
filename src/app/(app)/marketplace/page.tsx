"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarCheck,
  GitCompareArrows,
  Heart,
  MapPin,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Star,
  Timer,
} from "lucide-react";
import { cn, formatRON } from "@/lib/utils";
import type { Vendor } from "@/lib/types";
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
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

const categories = [
  "Toate categoriile",
  "Fotograf",
  "Videograf",
  "DJ & Muzică",
  "Florist",
  "Catering",
  "Locație",
  "Decor",
  "Tort & Dulciuri",
  "Foto cabină",
  "Transport",
];

const filterDefs = [
  { id: "available", label: "Disponibil la data evenimentului" },
  { id: "verified", label: "Verificat" },
  { id: "top", label: "Cu recenzii publice" },
  { id: "fast", label: "Răspunde rapid" },
  { id: "budget", label: "În bugetul meu" },
] as const;

type FilterId = (typeof filterDefs)[number]["id"];

const gradients = [
  "from-brand to-brand-strong",
  "from-accent-strong to-accent",
  "from-success to-brand",
  "from-info to-brand",
  "from-brand to-accent-strong",
  "from-warning to-brand",
];

type MarketplaceVendor = Vendor & { slug: string };

const categoryLabels: Record<string, Vendor["category"]> = {
  VENUE: "Locație",
  PHOTOGRAPHY: "Fotograf",
  VIDEOGRAPHY: "Videograf",
  CATERING: "Catering",
  ENTERTAINMENT: "DJ & Muzică",
  MUSIC: "DJ & Muzică",
  DECOR: "Decor",
  FLOWERS: "Florist",
  TRANSPORT: "Transport",
  CAKE: "Tort & Dulciuri",
  OTHER: "Decor",
};

function categoryCode(label: string) {
  return (
    Object.entries(categoryLabels).find(([, value]) => value === label)?.[0] ??
    "OTHER"
  );
}

function ratingFromSummary(item: OperationResource) {
  const summary =
    item.ratingSummary &&
    typeof item.ratingSummary === "object" &&
    !Array.isArray(item.ratingSummary)
      ? (item.ratingSummary as {
          publishedReviewCount?: unknown;
          overallAverageScaled?: unknown;
        })
      : null;
  const reviews = Number(summary?.publishedReviewCount ?? 0);
  const scaled = Number(summary?.overallAverageScaled ?? 0);
  return {
    reviews: Number.isFinite(reviews) ? reviews : 0,
    rating: Number.isFinite(scaled) && scaled > 0 ? scaled / 100 : 0,
  };
}

function toMarketplaceVendor(item: OperationResource): MarketplaceVendor {
  const regions = Array.isArray(item.serviceRegions)
    ? (item.serviceRegions as OperationResource[])
    : [];
  const categories = Array.isArray(item.categories)
    ? item.categories.map(String)
    : [];
  const availabilityStatus = [
    "AVAILABLE",
    "TENTATIVE",
    "UNAVAILABLE",
    "UNKNOWN",
  ].includes(String(item.availabilityStatus))
    ? (String(item.availabilityStatus) as NonNullable<
        Vendor["availabilityStatus"]
      >)
    : "UNKNOWN";
  const { rating, reviews } = ratingFromSummary(item);
  return {
    id: String(item.vendorOrganizationId),
    slug: String(item.slug),
    name: String(item.headline ?? "Furnizor Sarbato"),
    category: categoryLabels[categories[0] ?? "OTHER"] ?? "Decor",
    city: String(
      regions[0]?.city ??
        regions[0]?.region ??
        regions[0]?.country ??
        "România",
    ),
    verified: item.verificationStatus === "VERIFIED",
    rating,
    reviews,
    startingPrice: Number(item.startingPriceMinor ?? 0) / 100,
    availableOnDate: availabilityStatus === "AVAILABLE",
    availabilityStatus,
    responseTime: String(
      item.responseTimeLabel ?? "Timp de răspuns nespecificat",
    ),
    styles: categories
      .slice(0, 3)
      .map((value) => categoryLabels[value] ?? value),
    description: String(item.shortDescription ?? item.description ?? ""),
  };
}

export default function MarketplacePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("Toate categoriile");
  const [filters, setFilters] = React.useState<FilterId[]>([]);
  const [vendors, setVendors] = React.useState<MarketplaceVendor[]>([]);
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [compare, setCompare] = React.useState<string[]>([]);
  const [quoteVendor, setQuoteVendor] = React.useState<Vendor | null>(null);
  const workspaceEventDate = currentWorkspace?.eventDate?.slice(0, 10) ?? "";
  const [quoteDate, setQuoteDate] = React.useState("");
  const [quoteGuestCount, setQuoteGuestCount] = React.useState("");
  const [quoteBudget, setQuoteBudget] = React.useState("");
  const [quoteMessage, setQuoteMessage] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(
      () => {
        if (!currentWorkspace || demoMode) {
          setVendors(
            demoMode
              ? demoVendors.map((vendor, index) => ({
                  ...vendor,
                  id: `demo-vendor-${index + 1}`,
                  slug: `demo-${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                  availabilityStatus:
                    vendor.availabilityStatus ??
                    (vendor.availableOnDate ? "AVAILABLE" : "UNAVAILABLE"),
                }))
              : [],
          );
          setLoading(false);
          return;
        }
        setLoading(true);
        void Promise.all([
          weddingOsApi.marketplaceVendors({
            search: query || undefined,
            category:
              category === "Toate categoriile"
                ? undefined
                : categoryCode(category),
            date:
              filters.includes("available") && workspaceEventDate
                ? workspaceEventDate
                : undefined,
            verified: filters.includes("verified") || undefined,
            priceMax: filters.includes("budget") ? 1_500_000 : undefined,
          }),
          weddingOsApi.vendorFavorites(currentWorkspace.id),
        ])
          .then(([result, saved]) => {
            setVendors(result.items.map((item) => toMarketplaceVendor(item)));
            setFavorites(
              saved.items.map((item) => String(item.vendorOrganizationId)),
            );
          })
          .catch((error) =>
            toast({
              title: "Marketplace-ul nu a putut fi încărcat",
              description: apiErrorMessage(error),
              variant: "error",
            }),
          )
          .finally(() => setLoading(false));
      },
      !currentWorkspace || demoMode ? 0 : 200,
    );
    return () => window.clearTimeout(timer);
  }, [
    category,
    currentWorkspace,
    demoMode,
    filters,
    query,
    toast,
    workspaceEventDate,
  ]);

  const toggleFilter = (f: FilterId) =>
    setFilters((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );

  const filtered = vendors.filter((v) => {
    if (category !== "Toate categoriile" && v.category !== category)
      return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (
        !`${v.name} ${v.category} ${v.city} ${v.styles.join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
    }
    if (
      filters.includes("available") &&
      v.availabilityStatus === "UNAVAILABLE"
    )
      return false;
    if (filters.includes("verified") && !v.verified) return false;
    if (filters.includes("top") && v.reviews === 0) return false;
    if (
      filters.includes("fast") &&
      !v.responseTime.includes("oră") &&
      !v.responseTime.includes("ore")
    )
      return false;
    if (filters.includes("budget") && v.startingPrice > 15000) return false;
    return true;
  });

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast({
          title: "Maximum 3 furnizori în comparație",
          variant: "warning",
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleFavorite = async (vendorId: string) => {
    if (!currentWorkspace) return;
    const active = !favorites.includes(vendorId);
    setFavorites((current) =>
      active ? [...current, vendorId] : current.filter((id) => id !== vendorId),
    );
    if (demoMode) {
      toast({
        title: active ? "Favorit demo salvat local" : "Favorit demo eliminat",
        description: "Starea demo nu produce mutații API.",
        variant: "info",
      });
      return;
    }
    try {
      await weddingOsApi.setVendorFavorite(
        currentWorkspace.id,
        vendorId,
        active,
      );
    } catch (error) {
      setFavorites((current) =>
        active
          ? current.filter((id) => id !== vendorId)
          : [...current, vendorId],
      );
      toast({
        title: "Favoritul nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const sendQuoteRequest = async () => {
    if (!currentWorkspace || !quoteVendor || demoMode) return;
    if (!quoteDate) {
      toast({ title: "Completează data evenimentului", variant: "warning" });
      return;
    }
    try {
      const created = await weddingOsApi.createRfq(currentWorkspace.id, {
        title: `Cerere ofertă: ${quoteVendor.name}`,
        category: categoryCode(quoteVendor.category),
        description:
          quoteMessage.trim() ||
          `Solicităm o ofertă structurată pentru serviciile ${quoteVendor.name}.`,
        eventDate: quoteDate,
        guestCount: quoteGuestCount ? Number(quoteGuestCount) : null,
        locationSnapshot: currentWorkspace.location
          ? { location: currentWorkspace.location }
          : {},
        budgetRangeMaxMinor: quoteBudget
          ? Math.round(Number(quoteBudget) * 100)
          : null,
        currency: bootstrap?.workspace.currency ?? "RON",
        responseDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        requirements: [],
        questions: [],
      });
      const recipients = await weddingOsApi.replaceRfqRecipients(
        currentWorkspace.id,
        created.id,
        created.version,
        [quoteVendor.id],
      );
      const ready = await weddingOsApi.transitionRfq(
        currentWorkspace.id,
        created.id,
        Number(recipients.version),
        "MARK_READY",
      );
      await weddingOsApi.transitionRfq(
        currentWorkspace.id,
        created.id,
        ready.version,
        "SEND",
      );
      setQuoteVendor(null);
      setQuoteGuestCount("");
      setQuoteBudget("");
      setQuoteMessage("");
      toast({
        title: "Cerere pusă în coadă",
        description:
          "Starea RFQ și intenția durabilă de livrare au fost salvate.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Cererea nu a fost trimisă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Marketplace furnizori"
        description="Profiluri publicate de furnizori, filtrate după categorie, zonă și disponibilitate."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/favorites")}
            >
              <Heart className="size-3.5" aria-hidden />
              Salvate ({favorites.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/requests")}
            >
              Cererile mele
            </Button>
          </>
        }
      />

      {/* Search + filters */}
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <Input
              icon={<Search className="size-4" />}
              placeholder="Caută furnizori, stiluri…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Caută în marketplace"
            />
          </div>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Categorie"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="size-4 text-faint" aria-hidden />
          {filterDefs.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleFilter(f.id)}
              aria-pressed={filters.includes(f.id)}
              className={cn(
                "min-h-11 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filters.includes(f.id)
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-line bg-surface text-muted hover:border-line-strong",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-faint">
            {filtered.length} rezultate
          </span>
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">
          Se încarcă furnizorii publicați…
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Niciun furnizor nu corespunde"
          description="Încearcă să lărgești filtrele sau bugetul."
          action={{
            label: "Resetează filtrele",
            onClick: () => {
              setFilters([]);
              setQuery("");
              setCategory("Toate categoriile");
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v, i) => (
            <VendorCard
              key={v.id}
              vendor={v}
              gradient={gradients[i % gradients.length]}
              favorite={favorites.includes(v.id)}
              inCompare={compare.includes(v.id)}
              onFavorite={() => void toggleFavorite(v.id)}
              onOpen={() => router.push(`/marketplace/${v.slug}`)}
              onQuote={() => {
                setQuoteDate(workspaceEventDate);
                setQuoteVendor(v);
              }}
              onCompare={() => toggleCompare(v.id)}
              onMessage={() =>
                toast({
                  title: "Mesaj direct planificat",
                  description:
                    "Folosește o cerere de ofertă pentru comunicarea comercială din acest slice.",
                  variant: "info",
                })
              }
            />
          ))}
        </div>
      )}

      {/* Compare tray */}
      {compare.length > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-xl animate-slide-up rounded-2xl border border-line bg-elevated p-3 shadow-overlay lg:bottom-6">
          <div className="flex items-center gap-3">
            <GitCompareArrows
              className="size-5 shrink-0 text-brand"
              aria-hidden
            />
            <p className="min-w-0 flex-1 truncate text-sm text-muted">
              <span className="font-semibold text-ink">{compare.length}</span>{" "}
              în comparație:{" "}
              {compare
                .map((id) => vendors.find((v) => v.id === id)?.name)
                .join(", ")}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setCompare([])}>
              Golește
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/shortlists")}
              disabled={compare.length < 2}
            >
              Compară
            </Button>
          </div>
        </div>
      )}

      {/* Quote request modal */}
      <Modal
        open={!!quoteVendor}
        onClose={() => setQuoteVendor(null)}
        title={`Cerere de ofertă: ${quoteVendor?.name}`}
        description="Furnizorul primește detaliile evenimentului și răspunde în medie în 24h"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuoteVendor(null)}>
              Renunță
            </Button>
            <Button
              disabled={demoMode || !quoteDate}
              title={
                demoMode
                  ? "Trimiterea este dezactivată în mediul demo local"
                  : undefined
              }
              onClick={() => void sendQuoteRequest()}
            >
              Trimite cererea
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data evenimentului">
            <Input
              type="date"
              value={quoteDate}
              onChange={(event) => setQuoteDate(event.target.value)}
            />
          </Field>
          <Field label="Număr invitați">
            <Input
              inputMode="numeric"
              value={quoteGuestCount}
              onChange={(event) => setQuoteGuestCount(event.target.value)}
            />
          </Field>
          <Field label="Buget țintă (RON)">
            <Input
              inputMode="numeric"
              value={quoteBudget}
              onChange={(event) => setQuoteBudget(event.target.value)}
              placeholder={
                quoteVendor ? `de la ${quoteVendor.startingPrice}` : ""
              }
            />
          </Field>
          <Field label="Mesaj pentru furnizor" className="sm:col-span-2">
            <Textarea
              value={quoteMessage}
              onChange={(event) => setQuoteMessage(event.target.value)}
              placeholder="Descrie pe scurt serviciul, programul și detaliile importante pentru ofertă."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function VendorCard({
  vendor: v,
  gradient,
  favorite,
  inCompare,
  onFavorite,
  onOpen,
  onQuote,
  onCompare,
  onMessage,
}: {
  vendor: Vendor;
  gradient: string;
  favorite: boolean;
  inCompare: boolean;
  onFavorite: () => void;
  onOpen: () => void;
  onQuote: () => void;
  onCompare: () => void;
  onMessage: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      {/* Cover */}
      <button
        onClick={onOpen}
        className={cn(
          "relative block h-32 w-full cursor-pointer bg-gradient-to-br",
          gradient,
        )}
        aria-label={`Profilul ${v.name}`}
      >
        <span className="absolute inset-0 flex items-center justify-center font-brand text-4xl font-semibold text-on-brand-panel/90">
          {v.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span className="absolute left-3 top-3">
          <Badge variant="neutral" className="bg-surface/90 text-ink">
            {v.category}
          </Badge>
        </span>
      </button>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              onClick={onOpen}
              className="flex min-h-11 cursor-pointer items-center text-left"
            >
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink hover:underline">
                {v.name}
                {v.verified && (
                  <BadgeCheck
                    className="size-4 shrink-0 text-brand"
                    aria-label="Furnizor verificat"
                  />
                )}
              </span>
            </button>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
              <MapPin className="size-3" aria-hidden />
              {v.city}
            </p>
          </div>
          <button
            onClick={onFavorite}
            aria-label={
              favorite ? "Elimină din favorite" : "Adaugă la favorite"
            }
            aria-pressed={favorite}
            className={cn(
              "inline-flex size-11 cursor-pointer items-center justify-center rounded-lg transition-colors",
              favorite ? "text-danger" : "text-faint hover:text-danger",
            )}
          >
            <Heart
              className={cn("size-5", favorite && "fill-current")}
              aria-hidden
            />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <Star className="size-3.5 text-faint" aria-hidden />
            {v.reviews > 0
              ? `${v.rating.toLocaleString("ro-RO")} (${v.reviews})`
              : "Fără recenzii publice"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" aria-hidden />
            {v.responseTime}
          </span>
          <AvailabilityLabel
            status={
              v.availabilityStatus ??
              (v.availableOnDate ? "AVAILABLE" : "UNKNOWN")
            }
          />
        </div>

        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">
          {v.description}
        </p>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {v.styles.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <p className="text-[13px] text-faint">
            de la{" "}
            <span className="text-[15px] font-semibold text-ink tabular-nums">
              {formatRON(v.startingPrice)}
            </span>
          </p>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Button size="sm" onClick={onQuote}>
            Cere ofertă
          </Button>
          <Button size="sm" variant="outline" onClick={onOpen}>
            Profil
          </Button>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant={inCompare ? "secondary" : "outline"}
              className="flex-1 px-1"
              onClick={onCompare}
              aria-label="Adaugă la comparație"
            >
              <GitCompareArrows className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 px-1"
              onClick={onMessage}
              aria-label="Mesaj"
            >
              <MessageSquare className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AvailabilityLabel({
  status,
}: {
  status: NonNullable<Vendor["availabilityStatus"]>;
}) {
  const labels = {
    AVAILABLE: { text: "Disponibil confirmat", className: "text-success" },
    TENTATIVE: {
      text: "Disponibilitate provizorie",
      className: "text-warning",
    },
    UNAVAILABLE: { text: "Indisponibil", className: "text-danger" },
    UNKNOWN: { text: "Disponibilitate neconfirmată", className: "text-faint" },
  } as const;
  const label = labels[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs", label.className)}
    >
      <CalendarCheck className="size-3.5" aria-hidden />
      {label.text}
    </span>
  );
}
