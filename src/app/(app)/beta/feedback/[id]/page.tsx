"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageSquare, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSkeleton,
  CardTitle,
  Field,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type BetaFeedbackResource,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";

type Detail = BetaFeedbackResource & {
  messages: OperationResource[];
  history: OperationResource[];
};

export default function BetaFeedbackDetailPage() {
  const { toast } = useToast();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await weddingOsApi.betaFeedbackDetail(params.id));
      setError(null);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const send = async () => {
    if (!detail || !body.trim()) return;
    setLoading(true);
    try {
      await weddingOsApi.addBetaFeedbackMessage(detail.id, detail.version, body.trim());
      setBody("");
      await load();
      toast({ title: "Mesaj adăugat", description: "Echipa beta poate continua investigația în același fir.", variant: "success" });
    } catch (caught) {
      toast({ title: "Mesajul nu a fost adăugat", description: apiErrorMessage(caught), variant: "error" });
      await load();
    }
  };

  if (loading && !detail) return <CardSkeleton lines={7} />;
  if (error || !detail) return <Card><CardContent className="p-6"><p className="font-semibold text-ink">Feedback indisponibil</p><p className="mt-1 text-sm text-muted">{error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" /> Reîncearcă</Button></CardContent></Card>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink" href="/beta"><ArrowLeft className="size-4" /> Centrul Beta</Link>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-faint">Feedback {detail.id.slice(0, 8)}</p><h2 className="mt-1 font-brand text-2xl font-semibold text-ink">{detail.type.replaceAll("_", " ")}</h2></div><div className="flex gap-2"><Badge variant={detail.severity === "CRITICAL" ? "danger" : detail.severity === "HIGH" ? "warning" : "neutral"}>{detail.severity}</Badge><Badge variant="info">{detail.status.replaceAll("_", " ")}</Badge></div></div>
      <Card><CardContent className="space-y-4 p-5"><section><p className="text-xs font-medium text-faint">Descriere</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{detail.description}</p></section><div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2"><section><p className="text-xs font-medium text-faint">Rezultat așteptat</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{detail.expectedBehavior}</p></section><section><p className="text-xs font-medium text-faint">Rezultat observat</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{detail.actualBehavior}</p></section></div><p className="border-t border-line pt-3 text-xs text-faint">Ruta {detail.currentRoute} · release {detail.releaseVersion}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Conversație</CardTitle><MessageSquare className="size-4 text-faint" /></CardHeader><CardContent className="space-y-3">{detail.messages.length ? detail.messages.map((message) => <div key={message.id} className="rounded-lg bg-subtle p-3"><p className="whitespace-pre-wrap text-sm text-ink">{String(message.body)}</p><p className="mt-2 text-xs text-faint">{String(message.createdAt ?? "")}</p></div>) : <p className="py-4 text-center text-sm text-muted">Nu există mesaje încă.</p>}<Field label="Adaugă informații"><Textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder="Detalii suplimentare, fără parole sau tokenuri…" /></Field><div className="flex justify-end"><Button disabled={!body.trim()} loading={loading} onClick={() => void send()}>Trimite mesajul</Button></div></CardContent></Card>
      {detail.history.length ? <Card><CardHeader><CardTitle>Istoric stare</CardTitle></CardHeader><CardContent className="space-y-2">{detail.history.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-sm last:border-0"><span className="text-ink">{String(item.fromStatus ?? "NEW")} → {String(item.toStatus)}</span><span className="text-xs text-faint">{String(item.createdAt ?? "")}</span></div>)}</CardContent></Card> : null}
    </div>
  );
}
