"use client";

import * as React from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Flag, Heart, MapPin, Phone, Star, Timer } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { Badge, Button, Card, CardContent, EmptyState, Field, Modal, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, useToast } from "@/components/ui";

export default function VendorProfilePage() {
  const { id: slug } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, demoMode } = useWorkspace();
  const [vendor, setVendor] = React.useState<(OperationResource & { services: OperationResource[]; packages: OperationResource[]; serviceRegions: OperationResource[]; portfolio: OperationResource[] }) | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [reviews, setReviews] = React.useState<OperationResource[]>([]);
  const [ratingSummary, setRatingSummary] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(true);
  const [reportedReview, setReportedReview] = React.useState<OperationResource | null>(null);
  const [reportReason, setReportReason] = React.useState("INACCURATE_CONTENT");
  const [reportDetails, setReportDetails] = React.useState("");
  const [reporting, setReporting] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!slug || demoMode) {
        setLoading(false);
        return;
      }
      void Promise.all([
        weddingOsApi.marketplaceVendor(slug),
        currentWorkspace ? weddingOsApi.vendorFavorites(currentWorkspace.id) : Promise.resolve({ items: [] }),
        weddingOsApi.marketplaceReviews(slug),
      ])
        .then(([profile, favorites, reviewResult]) => {
          setVendor(profile);
          setSaved(favorites.items.some((item) => item.vendorOrganizationId === profile.vendorOrganizationId));
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
      await weddingOsApi.setVendorFavorite(currentWorkspace.id, String(vendor.vendorOrganizationId), next);
    } catch (error) {
      setSaved(!next);
      toast({ title: "Favoritul nu a fost salvat", description: apiErrorMessage(error), variant: "error" });
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
      setReportedReview(null); setReportDetails("");
      toast({ title: "Raport trimis", description: "Cazul a intrat în coada reală de moderare.", variant: "success" });
    } catch (error) {
      toast({ title: "Raportul nu a fost trimis", description: apiErrorMessage(error), variant: "error" });
    } finally { setReporting(false); }
  };

  if (loading) return <Card className="mx-auto max-w-3xl p-10 text-center text-sm text-muted">Se încarcă profilul public…</Card>;
  if (!vendor) return <div className="mx-auto max-w-3xl pt-16"><EmptyState icon={MapPin} title="Furnizor negăsit" description="Profilul nu există, nu este publicat sau modul demo este activ." action={{ label: "Înapoi la marketplace", onClick: () => router.push("/marketplace") }} /></div>;

  const regions = vendor.serviceRegions ?? [];
  const categories = Array.isArray(vendor.categories) ? vendor.categories.map(String) : [];
  const startingPrice = Number(vendor.startingPriceMinor ?? 0) / 100;
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-20">
      <Button variant="ghost" size="sm" onClick={() => router.push("/marketplace")}><ArrowLeft className="size-4" />Marketplace</Button>
      <div className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-br from-brand to-sage sm:h-60">
        {vendor.coverImageUrl ? <Image src={String(vendor.coverImageUrl)} alt="" fill unoptimized sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover" /> : <span className="flex h-full items-center justify-center font-brand text-6xl font-semibold text-white/60">{String(vendor.headline).split(" ").map((word) => word[0]).slice(0, 2).join("")}</span>}
      </div>
      <PageHeader title={String(vendor.headline)} description={String(vendor.shortDescription ?? "Profil public Sarbato")} actions={<><Button variant={saved ? "secondary" : "outline"} size="sm" onClick={() => void toggleFavorite()}><Heart className={saved ? "size-4 fill-current text-danger" : "size-4"} />{saved ? "Salvat" : "Salvează"}</Button><Button size="sm" onClick={() => router.push(`/requests?vendor=${encodeURIComponent(String(vendor.vendorOrganizationId))}`)}>Cere ofertă</Button></>} />
      <div className="flex flex-wrap gap-2 text-sm text-muted">
        {categories.map((category) => <Badge key={category} variant="brand">{label(category)}</Badge>)}
        {regions.map((region) => <span key={region.id} className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{[region.city, region.region, region.country].filter(Boolean).join(", ")}</span>)}
        {vendor.responseTimeLabel ? <span className="inline-flex items-center gap-1"><Timer className="size-3.5" />{String(vendor.responseTimeLabel)}</span> : null}
        {vendor.verificationStatus === "VERIFIED" ? <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="size-4" />Verificat</span> : <Badge variant="neutral">Neverificat</Badge>}
        {Number(ratingSummary.publishedReviewCount ?? 0) > 0 ? <span className="inline-flex items-center gap-1 font-medium text-ink"><Star className="size-4 fill-accent text-accent" />{(Number(ratingSummary.overallAverageScaled) / 100).toFixed(1)} · {Number(ratingSummary.publishedReviewCount)} recenzii</span> : <span>Nicio evaluare încă</span>}
      </div>
      <Tabs defaultValue="overview">
        <TabsList><TabsTrigger value="overview">Prezentare</TabsTrigger><TabsTrigger value="services">Servicii</TabsTrigger><TabsTrigger value="packages">Pachete</TabsTrigger><TabsTrigger value="portfolio">Portofoliu</TabsTrigger><TabsTrigger value="reviews">Recenzii</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-4"><Card><CardContent className="space-y-4 p-5"><div><h2 className="font-semibold text-ink">Despre</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{String(vendor.description)}</p></div><div><p className="text-xs text-faint">Preț public</p><p className="text-xl font-semibold text-ink">{startingPrice ? `de la ${formatRON(startingPrice)}` : "Preț la cerere"}</p></div>{vendor.publicPhone ? <Button variant="outline" onClick={() => window.open(`tel:${String(vendor.publicPhone)}`)}><Phone className="size-4" />Sună la numărul public</Button> : null}</CardContent></Card></TabsContent>
        <TabsContent value="services" className="mt-4 grid gap-3 md:grid-cols-2">{vendor.services.length ? vendor.services.map((service) => <Card key={service.id}><CardContent className="p-4"><p className="font-semibold text-ink">{String(service.name)}</p><p className="mt-1 text-sm text-muted">{String(service.description)}</p><p className="mt-3 text-sm font-medium text-ink">{service.startingPriceMinor ? `de la ${formatRON(Number(service.startingPriceMinor) / 100)}` : "Preț la cerere"}</p></CardContent></Card>) : <EmptyState icon={MapPin} title="Fără servicii publicate" description="Furnizorul nu a publicat încă servicii active." />}</TabsContent>
        <TabsContent value="packages" className="mt-4 grid gap-3 md:grid-cols-3">{vendor.packages.length ? vendor.packages.map((item) => <Card key={item.id}><CardContent className="p-4"><p className="font-semibold text-ink">{String(item.name)}</p><p className="mt-1 text-sm text-muted">{String(item.description)}</p><p className="mt-3 text-lg font-semibold text-ink">{item.basePriceMinor ? formatRON(Number(item.basePriceMinor) / 100) : "La cerere"}</p></CardContent></Card>) : <EmptyState icon={MapPin} title="Fără pachete publicate" description="Poți solicita o ofertă personalizată." />}</TabsContent>
        <TabsContent value="portfolio" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{vendor.portfolio.length ? vendor.portfolio.map((item) => <Card key={item.id}><CardContent className="p-3"><p className="font-medium text-ink">{String(item.title ?? "Referință")}</p>{item.url ? <a className="mt-2 block text-sm text-brand underline" href={String(item.url)} target="_blank" rel="noreferrer">Deschide referința publică</a> : null}</CardContent></Card>) : <EmptyState icon={MapPin} title="Fără portofoliu public" description="Nu sunt referințe publicate pentru acest profil." />}</TabsContent>
        <TabsContent value="reviews" className="mt-4">{reviews.length ? <div className="space-y-3">{reviews.map((review) => <Card key={review.id}><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-ink">{String(review.publicDisplayName ?? "Cuplu verificat")}</p><p className="mt-0.5 text-xs text-success"><BadgeCheck className="mr-1 inline size-3.5" />Experiență verificată prin booking</p></div><span className="flex gap-0.5" aria-label={`${Number(review.overallRating)} stele`}>{[1,2,3,4,5].map((star) => <Star key={star} className={`size-4 text-accent ${star <= Number(review.overallRating) ? "fill-current" : ""}`} />)}</span></div><h3 className="mt-4 font-medium text-ink">{String(review.title)}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{String(review.body)}</p>{review.reply && typeof review.reply === "object" ? <div className="mt-4 rounded-lg bg-subtle p-3"><p className="text-xs font-semibold text-ink">Răspunsul furnizorului</p><p className="mt-1 text-sm text-muted">{String((review.reply as Record<string, unknown>).body)}</p></div> : null}<Button className="mt-3" size="sm" variant="ghost" disabled={!currentWorkspace || demoMode} onClick={() => { setReportedReview(review); setReportReason("INACCURATE_CONTENT"); setReportDetails(""); }}><Flag className="size-3.5" />Raportează</Button></CardContent></Card>)}</div> : <EmptyState icon={BadgeCheck} title="Nicio evaluare încă" description="Ratingul va apărea numai după publicarea unei recenzii legate de un booking finalizat." />}</TabsContent>
      </Tabs>
      <Modal open={Boolean(reportedReview)} onClose={() => !reporting && setReportedReview(null)} title="Raportează recenzia" description="Raportul este privat și ajunge la Platform Trust; nu ascunde automat conținutul." footer={<><Button variant="ghost" disabled={reporting} onClick={() => setReportedReview(null)}>Renunță</Button><Button disabled={reporting} onClick={() => void submitReport()}><Flag className="size-4" />Trimite raportul</Button></>}>
        <div className="space-y-4"><Field label="Motiv"><select className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="INACCURATE_CONTENT">Conținut inexact</option><option value="PRIVATE_INFORMATION">Informații private</option><option value="HARASSMENT">Hărțuire</option><option value="SPAM">Spam</option><option value="OTHER">Alt motiv</option></select></Field><Field label="Detalii private" hint={`${reportDetails.length}/2000`}><Textarea rows={5} maxLength={2000} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></Field></div>
      </Modal>
    </div>
  );
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
