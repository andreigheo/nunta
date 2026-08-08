"use client";

import * as React from "react";
import { CheckCircle2, MessageSquareHeart, Pencil, ShieldCheck, Star, Undo2 } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, Modal, PageHeader, Textarea, useToast } from "@/components/ui";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { cn } from "@/lib/utils";

type Eligibility = OperationResource & { booking?: OperationResource; review?: OperationResource | null };
const criterionKeys = ["QUALITY", "COMMUNICATION", "RELIABILITY", "VALUE", "PROFESSIONALISM", "FLEXIBILITY"] as const;
const criterionLabels: Record<(typeof criterionKeys)[number], string> = { QUALITY: "Calitate", COMMUNICATION: "Comunicare", RELIABILITY: "Fiabilitate", VALUE: "Raport calitate-preț", PROFESSIONALISM: "Profesionalism", FLEXIBILITY: "Flexibilitate" };

export default function ReviewsPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<Eligibility[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Eligibility | null>(null);
  const [review, setReview] = React.useState<OperationResource | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [overall, setOverall] = React.useState(5);
  const [ratings, setRatings] = React.useState<Record<string, number>>(Object.fromEntries(criterionKeys.map((key) => [key, 5])));

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try { setItems((await weddingOsApi.reviewEligibilities(currentWorkspace.id)).items as Eligibility[]); }
    catch (error) { toast({ title: "Recenziile nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); }
    finally { setLoading(false); }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const open = async (item: Eligibility) => {
    setEditing(item); setReview(null); setTitle(""); setBody(""); setOverall(5); setRatings(Object.fromEntries(criterionKeys.map((key) => [key, 5])));
    const summary = item.review;
    if (!summary?.id || !currentWorkspace) return;
    try {
      const detail = await weddingOsApi.review(currentWorkspace.id, summary.id);
      setReview(detail);
      const versions = Array.isArray(detail.versions) ? detail.versions as OperationResource[] : [];
      const currentVersion = versions.at(-1);
      setTitle(String(currentVersion?.title ?? detail.title ?? ""));
      setBody(String(currentVersion?.body ?? ""));
      setOverall(Number(currentVersion?.overallRating ?? detail.overallRating ?? 5));
      const criteria = Array.isArray(detail.criteria) ? detail.criteria as OperationResource[] : [];
      setRatings(Object.fromEntries(criterionKeys.map((key) => [key, Number(criteria.filter((row) => row.criterion === key).at(-1)?.rating ?? 5)])));
    } catch (error) { toast({ title: "Recenzia nu a putut fi deschisă", description: apiErrorMessage(error), variant: "error" }); }
  };

  const save = async (publish: boolean) => {
    if (!editing || !currentWorkspace) return;
    setSaving(true);
    try {
      const payload = { eligibilityId: editing.id, title, body, overallRating: overall, criteria: ratings, authenticityConfirmed: true };
      const saved = review?.id
        ? await weddingOsApi.updateReviewDraft(currentWorkspace.id, review.id, review.version, payload)
        : await weddingOsApi.createReview(currentWorkspace.id, payload);
      if (publish) await weddingOsApi.publishReview(currentWorkspace.id, saved.id, saved.version);
      setEditing(null); setReview(null); await load();
      toast({ title: publish ? "Recenzie verificată publicată" : "Ciornă salvată", description: publish ? "Ratingul public a fost recalculat din date persistente." : "Poți reveni înainte de publicare.", variant: "success" });
    } catch (error) { toast({ title: publish ? "Recenzia nu a fost publicată" : "Ciorna nu a fost salvată", description: apiErrorMessage(error), variant: "error" }); }
    finally { setSaving(false); }
  };

  const withdraw = async () => {
    if (!review?.id || !currentWorkspace) return;
    setSaving(true);
    try {
      await weddingOsApi.withdrawReview(currentWorkspace.id, review.id, review.version);
      setEditing(null); setReview(null); await load();
      toast({ title: "Recenzie retrasă", description: "Conținutul și ratingul nu mai sunt publice.", variant: "success" });
    } catch (error) {
      toast({ title: "Recenzia nu a fost retrasă", description: apiErrorMessage(error), variant: "error" });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardContent className="p-8 text-center text-sm text-muted">Se verifică bookingurile eligibile…</CardContent></Card>;
  const published = items.filter((item) => item.review?.status === "PUBLISHED").length;
  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="Recenzii verificate" description="Poți evalua numai colaborări finalizate dintr-o rezervare Sarbato reală." actions={items.some((item) => !item.review) ? <Button size="sm" onClick={() => void open(items.find((item) => !item.review)!)}><Pencil className="size-3.5" />Scrie o recenzie</Button> : undefined} />
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <Card className="border-brand/35 bg-brand text-on-brand"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-on-brand/65">Feedback verificabil</p><h2 className="mt-2 font-brand text-2xl font-semibold">{published} recenzii publicate din {items.length} colaborări eligibile</h2><p className="mt-2 text-sm text-on-brand/75">Publicarea confirmă că experiența descrisă este autentică și legată de booking.</p></CardContent></Card>
      <Card><CardContent className="flex h-full items-center gap-3 p-5"><span className="rounded-xl bg-success-soft p-3 text-success"><ShieldCheck className="size-5" /></span><div><p className="font-semibold text-ink">Review verificat</p><p className="text-xs text-muted">Ciornele nu influențează ratingul public.</p></div></CardContent></Card>
    </div>
    {demoMode ? <EmptyState icon={ShieldCheck} title="Recenziile reale sunt oprite în demo" description="Modul demo nu trimite mutații către API." /> : items.length === 0 ? <EmptyState icon={MessageSquareHeart} title="Nicio colaborare eligibilă" description="După finalizarea unui booking, posibilitatea de review va apărea automat aici." /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => {
      const booking: Partial<OperationResource> = item.booking ?? {}; const current = item.review; const state = String(current?.status ?? "ELIGIBLE");
      return <Card key={item.id}><CardContent className="flex min-h-56 flex-col p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{String(booking.title ?? "Colaborare finalizată")}</p><p className="mt-1 text-xs text-faint">Booking verificat · {String(item.eligibilityType ?? "COMPLETED_BOOKING").toLowerCase().replaceAll("_", " ")}</p></div><Badge variant={state === "PUBLISHED" ? "success" : current ? "warning" : "neutral"}>{state === "PUBLISHED" ? "Publicată" : current ? "Ciornă" : "De scris"}</Badge></div>{current?.overallRating ? <div className="mt-5"><Stars value={Number(current.overallRating)} /></div> : <Star className="mx-auto my-7 size-8 text-line-strong" />}<Button className="mt-auto" variant={current ? "outline" : "primary"} onClick={() => void open(item)}>{current ? "Deschide recenzia" : "Scrie recenzia"}</Button></CardContent></Card>;
    })}</div>}
    <Modal open={Boolean(editing)} onClose={() => !saving && setEditing(null)} title={`Recenzie · ${String(editing?.booking?.title ?? "booking verificat")}`} description="Toate cele șase criterii sunt obligatorii; conținutul public nu trebuie să includă date private." footer={<>{review?.status === "PUBLISHED" ? <Button variant="outline" disabled={saving} onClick={() => void withdraw()}><Undo2 className="size-4" />Retrage recenzia</Button> : null}<Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>Renunță</Button>{review?.status !== "PUBLISHED" ? <><Button variant="outline" disabled={saving || body.trim().length < 20 || !title.trim()} onClick={() => void save(false)}>Salvează ciorna</Button><Button disabled={saving || body.trim().length < 20 || !title.trim()} onClick={() => void save(true)}><CheckCircle2 className="size-4" />Confirmă și publică</Button></> : null}</>}>
      <div className="space-y-4"><Field label="Titlu" required><Input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="Evaluare generală" required><Stars value={overall} onChange={setOverall} /></Field><div className="grid gap-3 sm:grid-cols-2">{criterionKeys.map((key) => <Field key={key} label={criterionLabels[key]} required><Stars value={ratings[key] ?? 5} onChange={(value) => setRatings((current) => ({ ...current, [key]: value }))} /></Field>)}</div><Field label="Experiența publică" required hint={`${body.length}/4000`}><Textarea rows={6} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} /></Field></div>
    </Modal>
  </div>;
}

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) { return <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((star) => onChange ? <button type="button" aria-label={`${star} stele`} key={star} onClick={() => onChange(star)} className="rounded p-0.5 text-accent"><Star className={cn("size-5", star <= value && "fill-current")} /></button> : <Star key={star} className={cn("size-4 text-accent", star <= value && "fill-current")} />)}</div>; }
