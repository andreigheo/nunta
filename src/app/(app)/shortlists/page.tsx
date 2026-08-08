"use client";

import * as React from "react";
import { GitCompareArrows, ListChecks } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

export default function ShortlistsPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [lists, setLists] = React.useState<OperationResource[]>([]);
  const [profiles, setProfiles] = React.useState<OperationResource[]>([]);
  const [active, setActive] = React.useState<string | null>(null);
  const load = React.useCallback(async () => { if (!currentWorkspace || demoMode) return; try { const [shortlists, marketplace] = await Promise.all([weddingOsApi.vendorShortlists(currentWorkspace.id), weddingOsApi.marketplaceVendors({ limit: 50 })]); setLists(shortlists.items); setProfiles(marketplace.items); setActive((current) => current ?? shortlists.items[0]?.id ?? null); } catch (error) { toast({ title: "Listele scurte nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); } }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);
  const list = lists.find((item) => item.id === active) ?? null;
  const vendorIds = new Set((Array.isArray(list?.vendors) ? list.vendors as OperationResource[] : []).map((item) => String(item.vendorOrganizationId)));
  const compared = profiles.filter((profile) => vendorIds.has(String(profile.vendorOrganizationId)));
  const remove = async (vendorId: string) => { if (!currentWorkspace || !list) return; try { await weddingOsApi.setShortlistVendor(currentWorkspace.id, list.id, vendorId, false); await load(); toast({ title: "Furnizor eliminat din listă", variant: "success" }); } catch (error) { toast({ title: "Lista nu a fost actualizată", description: apiErrorMessage(error), variant: "error" }); } };
  return <div className="mx-auto max-w-7xl space-y-4"><PageHeader title="Liste scurte & comparații" description="Comparație factuală a profilurilor publice, fără scoring sau recomandări AI inventate." actions={<Button variant="outline" size="sm" disabled title="Analiza AI nu are contract în acest slice">Analiză AI · planificată</Button>} />{lists.length === 0 ? <EmptyState icon={ListChecks} title="Nicio listă scurtă" description="Selectează favorite și creează o listă scurtă persistentă." action={{ label: "Deschide favorite", onClick: () => window.location.assign("/favorites") }} /> : <><div className="flex flex-wrap gap-2">{lists.map((item) => <Button key={item.id} size="sm" variant={item.id === active ? "primary" : "outline"} onClick={() => setActive(item.id)}>{String(item.name)} <Badge variant="neutral">{Array.isArray(item.vendors) ? item.vendors.length : 0}</Badge></Button>)}</div>{compared.length === 0 ? <EmptyState icon={GitCompareArrows} title="Lista este goală" description="Adaugă furnizori din favorite sau marketplace." /> : <Card><CardContent className="p-0"><Table minWidth="760px"><THead><TR><TH>Criteriu</TH>{compared.map((vendor) => <TH key={vendor.id}>{String(vendor.headline)}</TH>)}</TR></THead><TBody><TR><TD className="font-medium">Categorii</TD>{compared.map((vendor) => <TD key={vendor.id}>{Array.isArray(vendor.categories) ? vendor.categories.map(String).join(", ") : "—"}</TD>)}</TR><TR><TD className="font-medium">Preț public</TD>{compared.map((vendor) => <TD key={vendor.id}>{vendor.startingPriceMinor ? formatRON(Number(vendor.startingPriceMinor) / 100) : "La cerere"}</TD>)}</TR><TR><TD className="font-medium">Verificare</TD>{compared.map((vendor) => <TD key={vendor.id}><Badge variant={vendor.verificationStatus === "VERIFIED" ? "success" : "neutral"}>{vendor.verificationStatus === "VERIFIED" ? "Verificat" : "Neverificat"}</Badge></TD>)}</TR><TR><TD className="font-medium">Timp răspuns public</TD>{compared.map((vendor) => <TD key={vendor.id}>{String(vendor.responseTimeLabel ?? "Nespecificat")}</TD>)}</TR><TR><TD className="font-medium">Acțiuni</TD>{compared.map((vendor) => <TD key={vendor.id}><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => window.location.assign(`/marketplace/${String(vendor.slug)}`)}>Profil</Button><Button size="sm" variant="ghost" onClick={() => void remove(String(vendor.vendorOrganizationId))}>Elimină</Button></div></TD>)}</TR></TBody></Table></CardContent></Card>}<p className="text-xs text-muted">Voturile și comentariile pe shortlist nu au un model persistent în Slice 5 și rămân dezactivate; nu se simulează salvarea lor locală.</p></>}</div>;
}
