"use client";

import * as React from "react";
import { FolderPlus, Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, Checkbox, EmptyState, Field, Input, Modal, PageHeader, useToast } from "@/components/ui";

export default function FavoritesPage() {
  const router = useRouter();
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [shortlists, setShortlists] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const load = React.useCallback(async () => { if (!currentWorkspace || demoMode) return; try { const [favorites, lists] = await Promise.all([weddingOsApi.vendorFavorites(currentWorkspace.id), weddingOsApi.vendorShortlists(currentWorkspace.id)]); setItems(favorites.items); setShortlists(lists.items); } catch (error) { toast({ title: "Favoritele nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); } }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);
  const remove = async (vendorId: string) => { if (!currentWorkspace) return; try { await weddingOsApi.setVendorFavorite(currentWorkspace.id, vendorId, false); await load(); } catch (error) { toast({ title: "Favoritul nu a fost eliminat", description: apiErrorMessage(error), variant: "error" }); } };
  const create = async () => { if (!currentWorkspace) return; try { const list = await weddingOsApi.createVendorShortlist(currentWorkspace.id, { name, category: null }); for (const vendorId of selected) await weddingOsApi.setShortlistVendor(currentWorkspace.id, list.id, vendorId, true); setOpen(false); setName(""); setSelected([]); await load(); toast({ title: "Lista scurtă a fost creată", variant: "success" }); } catch (error) { toast({ title: "Lista nu a fost creată", description: apiErrorMessage(error), variant: "error" }); } };
  return <div className="mx-auto max-w-7xl space-y-4"><PageHeader title="Favorite" description="Furnizori salvați persistent în workspace." actions={<Button size="sm" disabled={!selected.length} onClick={() => setOpen(true)}><FolderPlus className="size-4" />Listă scurtă ({selected.length})</Button>} />{items.length === 0 ? <EmptyState icon={Heart} title="Niciun favorit" description="Salvează profiluri publicate din marketplace." action={{ label: "Explorează marketplace", onClick: () => router.push("/marketplace") }} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id}><CardContent className="p-4"><div className="flex items-start gap-3"><Checkbox checked={selected.includes(String(item.vendorOrganizationId))} onCheckedChange={() => setSelected((current) => current.includes(String(item.vendorOrganizationId)) ? current.filter((id) => id !== item.vendorOrganizationId) : [...current, String(item.vendorOrganizationId)])} /><div className="min-w-0 flex-1"><p className="font-semibold text-ink">{String(item.headline)}</p><p className="text-xs text-muted">{Array.isArray(item.categories) ? item.categories.map(String).join(", ") : "Furnizor"}</p><p className="mt-2 text-sm font-medium text-ink">{item.startingPriceMinor ? `de la ${formatRON(Number(item.startingPriceMinor) / 100)}` : "Preț la cerere"}</p>{item.verificationStatus === "VERIFIED" ? <Badge className="mt-2" variant="success">Verificat</Badge> : <Badge className="mt-2" variant="neutral">Neverificat</Badge>}</div></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => router.push(`/marketplace/${String(item.slug)}`)}>Profil</Button><Button size="sm" variant="ghost" onClick={() => void remove(String(item.vendorOrganizationId))}>Elimină</Button></div></CardContent></Card>)}</div>}<Modal open={open} onClose={() => setOpen(false)} title="Listă scurtă nouă" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Renunță</Button><Button disabled={name.trim().length < 2} onClick={() => void create()}>Creează și adaugă</Button></>}><Field label="Nume"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><p className="mt-3 text-xs text-muted">Vor fi adăugați {selected.length} furnizori. Există deja {shortlists.length} liste persistente.</p></Modal></div>;
}
