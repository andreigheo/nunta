"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarCheck,
  GitCompareArrows,
  Heart,
  List,
  Map,
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
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
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
  SegmentedControl,
  Textarea,
  useToast,
} from "@/components/ui";

const categories = ["Toate categoriile", "Fotograf", "Videograf", "DJ & Muzică", "Florist", "Catering", "Locație", "Decor", "Tort & Dulciuri", "Foto cabină", "Transport"];

const filterDefs = [
  { id: "available", label: "Disponibil pe 12 sept 2027" },
  { id: "verified", label: "Verificat" },
  { id: "top", label: "Cu recenzii publice" },
  { id: "fast", label: "Răspunde rapid" },
  { id: "budget", label: "În bugetul meu" },
] as const;

type FilterId = (typeof filterDefs)[number]["id"];

const gradients = [
  "from-[#21483A] to-[#5c7a6b]",
  "from-[#B4774B] to-[#d9b98a]",
  "from-[#91A899] to-[#c9d6cd]",
  "from-[#3d6a8a] to-[#82a9c6]",
  "from-[#8a5a83] to-[#c49dbd]",
  "from-[#6b5537] to-[#b39b6d]",
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
  return Object.entries(categoryLabels).find(([, value]) => value === label)?.[0] ?? "OTHER";
}

function toMarketplaceVendor(item: OperationResource): MarketplaceVendor {
  const regions = Array.isArray(item.serviceRegions) ? item.serviceRegions as OperationResource[] : [];
  const categories = Array.isArray(item.categories) ? item.categories.map(String) : [];
  const availabilityStatus = ["AVAILABLE", "TENTATIVE", "UNAVAILABLE", "UNKNOWN"].includes(String(item.availabilityStatus))
    ? String(item.availabilityStatus) as NonNullable<Vendor["availabilityStatus"]>
    : "UNKNOWN";
  return {
    id: String(item.vendorOrganizationId),
    slug: String(item.slug),
    name: String(item.headline ?? "Furnizor Sarbato"),
    category: categoryLabels[categories[0] ?? "OTHER"] ?? "Decor",
    city: String(regions[0]?.city ?? regions[0]?.region ?? regions[0]?.country ?? "România"),
    verified: item.verificationStatus === "VERIFIED",
    rating: 0,
    reviews: 0,
    startingPrice: Number(item.startingPriceMinor ?? 0) / 100,
    availableOnDate: availabilityStatus === "AVAILABLE",
    availabilityStatus,
    responseTime: String(item.responseTimeLabel ?? "Timp de răspuns nespecificat"),
    styles: categories.slice(0, 3).map((value) => categoryLabels[value] ?? value),
    description: String(item.shortDescription ?? item.description ?? ""),
  };
}

export default function MarketplacePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, demoMode } = useWorkspace();
  const [view, setView] = React.useState<"list" | "map">("list");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("Toate categoriile");
  const [filters, setFilters] = React.useState<FilterId[]>(["available"]);
  const [vendors, setVendors] = React.useState<MarketplaceVendor[]>([]);
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [compare, setCompare] = React.useState<string[]>([]);
  const [quoteVendor, setQuoteVendor] = React.useState<Vendor | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!currentWorkspace || demoMode) {
        setVendors(
          demoMode
            ? demoVendors.map((vendor, index) => ({
                ...vendor,
                id: `demo-vendor-${index + 1}`,
                slug: `demo-${vendor.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
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
          category: category === "Toate categoriile" ? undefined : categoryCode(category),
          date: filters.includes("available") ? "2027-09-12" : undefined,
          verified: filters.includes("verified") || undefined,
          priceMax: filters.includes("budget") ? 1_500_000 : undefined,
        }),
        weddingOsApi.vendorFavorites(currentWorkspace.id),
      ])
        .then(([result, saved]) => {
          setVendors(result.items.map((item) => toMarketplaceVendor(item)));
          setFavorites(saved.items.map((item) => String(item.vendorOrganizationId)));
        })
        .catch((error) => toast({ title: "Marketplace-ul nu a putut fi încărcat", description: apiErrorMessage(error), variant: "error" }))
        .finally(() => setLoading(false));
    }, !currentWorkspace || demoMode ? 0 : 200);
    return () => window.clearTimeout(timer);
  }, [category, currentWorkspace, demoMode, filters, query, toast]);

  const toggleFilter = (f: FilterId) =>
    setFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));

  const filtered = vendors.filter((v) => {
    if (category !== "Toate categoriile" && v.category !== category) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!`${v.name} ${v.category} ${v.city} ${v.styles.join(" ")}`.toLowerCase().includes(q)) return false;
    }
    if (filters.includes("available") && !v.availableOnDate) return false;
    if (filters.includes("verified") && !v.verified) return false;
    if (filters.includes("top") && v.reviews === 0) return false;
    if (filters.includes("fast") && !v.responseTime.includes("oră") && !v.responseTime.includes("ore")) return false;
    if (filters.includes("budget") && v.startingPrice > 15000) return false;
    return true;
  });

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast({ title: "Maximum 3 furnizori în comparație", variant: "warning" });
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleFavorite = async (vendorId: string) => {
    if (!currentWorkspace) return;
    const active = !favorites.includes(vendorId);
    setFavorites((current) => active ? [...current, vendorId] : current.filter((id) => id !== vendorId));
    if (demoMode) {
      toast({ title: active ? "Favorit demo salvat local" : "Favorit demo eliminat", description: "Starea demo nu produce mutații API.", variant: "info" });
      return;
    }
    try {
      await weddingOsApi.setVendorFavorite(currentWorkspace.id, vendorId, active);
    } catch (error) {
      setFavorites((current) => active ? current.filter((id) => id !== vendorId) : [...current, vendorId]);
      toast({ title: "Favoritul nu a fost salvat", description: apiErrorMessage(error), variant: "error" });
    }
  };

  const sendQuoteRequest = async () => {
    if (!currentWorkspace || !quoteVendor || demoMode) return;
    try {
      const created = await weddingOsApi.createRfq(currentWorkspace.id, {
        title: `Cerere ofertă — ${quoteVendor.name}`,
        category: categoryCode(quoteVendor.category),
        description: `Solicităm o ofertă structurată pentru serviciile ${quoteVendor.name}.`,
        eventDate: "2027-09-12",
        guestCount: 160,
        locationSnapshot: {},
        currency: "RON",
        responseDeadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        requirements: [],
        questions: [],
      });
      const recipients = await weddingOsApi.replaceRfqRecipients(currentWorkspace.id, created.id, created.version, [quoteVendor.id]);
      const ready = await weddingOsApi.transitionRfq(currentWorkspace.id, created.id, Number(recipients.version), "MARK_READY");
      await weddingOsApi.transitionRfq(currentWorkspace.id, created.id, ready.version, "SEND");
      setQuoteVendor(null);
      toast({ title: "Cerere pusă în coadă", description: "Starea RFQ și intenția durabilă de livrare au fost salvate.", variant: "success" });
    } catch (error) {
      toast({ title: "Cererea nu a fost trimisă", description: apiErrorMessage(error), variant: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Marketplace furnizori"
        description="Profiluri publicate de furnizori, filtrate după categorie, zonă și disponibilitate."
        actions={
          <>
            <SegmentedControl
              ariaLabel="Vizualizare"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "Listă", icon: <List className="size-4" /> },
                { value: "map", label: "Hartă", icon: <Map className="size-4" /> },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => router.push("/favorites")}>
              <Heart className="size-3.5" aria-hidden />
              Salvate ({favorites.length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/requests")}>
              Cererile mele
            </Button>
          </>
        }
      />

      {/* Search + filters */}
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <div className="col-span-2">
            <Input icon={<Search className="size-4" />} placeholder="Caută furnizori, stiluri…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Caută în marketplace" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categorie">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select defaultValue="Brasov" aria-label="Locație">
            <option value="Brasov">Brașov + 30 km</option>
            <option>Sibiu</option>
            <option>București</option>
            <option>Oriunde în țară</option>
          </Select>
          <Input type="date" defaultValue="2027-09-12" aria-label="Data nunții" />
          <Select defaultValue="any" aria-label="Buget">
            <option value="any">Orice buget</option>
            <option>Sub 5.000 lei</option>
            <option>5.000–10.000 lei</option>
            <option>Peste 10.000 lei</option>
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
                "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filters.includes(f.id) ? "border-brand bg-brand-soft text-brand-strong dark:text-brand" : "border-line bg-surface text-muted hover:border-line-strong",
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-faint">{filtered.length} rezultate</span>
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">Se încarcă furnizorii publicați…</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Niciun furnizor nu corespunde"
          description="Încearcă să lărgești filtrele sau bugetul."
          action={{ label: "Resetează filtrele", onClick: () => { setFilters([]); setQuery(""); setCategory("Toate categoriile"); } }}
        />
      ) : view === "map" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-line bg-sage-soft">
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, var(--sage) 0, transparent 30%), radial-gradient(circle at 70% 60%, var(--sand) 0, transparent 35%)" }} aria-hidden />
            <span className="absolute left-4 top-4 rounded-lg bg-elevated px-3 py-1.5 text-xs font-medium text-muted shadow-card">Brașov și împrejurimi</span>
            {filtered.slice(0, 8).map((v, i) => (
              <button
                key={v.id}
                onClick={() => router.push(`/marketplace/${v.slug}`)}
                className="group absolute cursor-pointer"
                style={{ left: `${12 + (i * 11) % 72}%`, top: `${18 + (i * 17) % 62}%` }}
                aria-label={v.name}
              >
                <span className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-brand text-[11px] font-bold text-on-brand shadow-pop transition-transform group-hover:scale-110 dark:border-line">
                  {v.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
              </button>
            ))}
          </div>
          <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {filtered.map((v) => (
              <VendorListRow key={v.id} vendor={v} favorite={favorites.includes(v.id)} onFavorite={() => void toggleFavorite(v.id)} onOpen={() => router.push(`/marketplace/${v.slug}`)} />
            ))}
          </div>
        </div>
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
              onQuote={() => setQuoteVendor(v)}
              onCompare={() => toggleCompare(v.id)}
              onMessage={() => toast({ title: "Mesaj direct planificat", description: "Folosește o cerere de ofertă pentru comunicarea comercială din acest slice.", variant: "info" })}
            />
          ))}
        </div>
      )}

      {/* Compare tray */}
      {compare.length > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-xl animate-slide-up rounded-2xl border border-line bg-elevated p-3 shadow-overlay lg:bottom-6">
          <div className="flex items-center gap-3">
            <GitCompareArrows className="size-5 shrink-0 text-brand" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm text-muted">
              <span className="font-semibold text-ink">{compare.length}</span> în comparație: {compare.map((id) => vendors.find((v) => v.id === id)?.name).join(", ")}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setCompare([])}>Golește</Button>
            <Button size="sm" onClick={() => router.push("/shortlists")} disabled={compare.length < 2}>
              Compară
            </Button>
          </div>
        </div>
      )}

      {/* Quote request modal */}
      <Modal
        open={!!quoteVendor}
        onClose={() => setQuoteVendor(null)}
        title={`Cerere de ofertă — ${quoteVendor?.name}`}
        description="Furnizorul primește detaliile evenimentului și răspunde în medie în 24h"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuoteVendor(null)}>Renunță</Button>
            <Button onClick={() => void sendQuoteRequest()}>
              Trimite cererea
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data evenimentului">
            <Input type="date" defaultValue="2027-09-12" />
          </Field>
          <Field label="Număr invitați">
            <Input inputMode="numeric" defaultValue="160" />
          </Field>
          <Field label="Buget țintă (RON)">
            <Input inputMode="numeric" placeholder={quoteVendor ? `de la ${quoteVendor.startingPrice}` : ""} />
          </Field>
          <Field label="Stil dorit">
            <Select>
              <option>Grădină / romantic</option>
              <option>Modern</option>
              <option>Clasic</option>
            </Select>
          </Field>
          <Field label="Mesaj pentru furnizor" className="sm:col-span-2">
            <Textarea defaultValue={`Bună ziua! Organizăm nunta pe 12 septembrie 2027 la Conacul Ambient (Cristian), ~160 invitați, ceremonie în grădină. Am dori o ofertă detaliată pentru serviciile dumneavoastră. Mulțumim!`} />
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
      <button onClick={onOpen} className={cn("relative block h-32 w-full cursor-pointer bg-gradient-to-br", gradient)} aria-label={`Profilul ${v.name}`}>
        <span className="absolute inset-0 flex items-center justify-center font-brand text-4xl font-semibold text-white/90">
          {v.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <span className="absolute left-3 top-3">
          <Badge variant="neutral" className="bg-white/85 text-ink">{v.category}</Badge>
        </span>
      </button>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button onClick={onOpen} className="cursor-pointer text-left">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink hover:underline">
                {v.name}
                {v.verified && <BadgeCheck className="size-4 shrink-0 text-brand" aria-label="Furnizor verificat" />}
              </span>
            </button>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
              <MapPin className="size-3" aria-hidden />{v.city}
            </p>
          </div>
          <button
            onClick={onFavorite}
            aria-label={favorite ? "Elimină din favorite" : "Adaugă la favorite"}
            aria-pressed={favorite}
            className={cn("cursor-pointer rounded-lg p-1.5 transition-colors", favorite ? "text-danger" : "text-faint hover:text-danger")}
          >
            <Heart className={cn("size-5", favorite && "fill-current")} aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <Star className="size-3.5 text-faint" aria-hidden />
            {v.reviews > 0 ? `${v.rating.toLocaleString("ro-RO")} (${v.reviews})` : "Fără recenzii publice"}
          </span>
          <span className="inline-flex items-center gap-1"><Timer className="size-3.5" aria-hidden />{v.responseTime}</span>
          <AvailabilityLabel status={v.availabilityStatus ?? (v.availableOnDate ? "AVAILABLE" : "UNKNOWN")} />
        </div>

        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">{v.description}</p>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {v.styles.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <p className="text-[13px] text-faint">de la <span className="text-[15px] font-semibold text-ink tabular-nums">{formatRON(v.startingPrice)}</span></p>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Button size="sm" onClick={onQuote}>Cere ofertă</Button>
          <Button size="sm" variant="outline" onClick={onOpen}>Profil</Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant={inCompare ? "secondary" : "outline"} className="flex-1 px-1" onClick={onCompare} aria-label="Adaugă la comparație">
              <GitCompareArrows className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" className="flex-1 px-1" onClick={onMessage} aria-label="Mesaj">
              <MessageSquare className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VendorListRow({
  vendor: v,
  favorite,
  onFavorite,
  onOpen,
}: {
  vendor: MarketplaceVendor;
  favorite: boolean;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  return (
    <Card interactive onClick={onOpen}>
      <CardContent className="flex items-center gap-3 p-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft font-brand text-sm font-semibold text-brand-strong dark:text-brand">
          {v.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {v.name}
            {v.verified && <BadgeCheck className="size-3.5 text-brand" aria-hidden />}
          </span>
          <span className="block truncate text-xs text-faint">{v.category} · {v.city} · {v.reviews ? `★ ${v.rating.toLocaleString("ro-RO")} (${v.reviews})` : "fără recenzii publice"}</span>
          <AvailabilityLabel status={v.availabilityStatus ?? (v.availableOnDate ? "AVAILABLE" : "UNKNOWN")} />
        </span>
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatRON(v.startingPrice)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavorite();
          }}
          aria-label="Favorite"
          className={cn("shrink-0 cursor-pointer rounded-lg p-1.5", favorite ? "text-danger" : "text-faint hover:text-danger")}
        >
          <Heart className={cn("size-4.5", favorite && "fill-current")} aria-hidden />
        </button>
      </CardContent>
    </Card>
  );
}

function AvailabilityLabel({ status }: { status: NonNullable<Vendor["availabilityStatus"]> }) {
  const labels = {
    AVAILABLE: { text: "Disponibil confirmat", className: "text-success" },
    TENTATIVE: { text: "Disponibilitate provizorie", className: "text-warning" },
    UNAVAILABLE: { text: "Indisponibil", className: "text-danger" },
    UNKNOWN: { text: "Disponibilitate neconfirmată", className: "text-faint" },
  } as const;
  const label = labels[status];
  return <span className={cn("inline-flex items-center gap-1 text-xs", label.className)}><CalendarCheck className="size-3.5" aria-hidden />{label.text}</span>;
}
