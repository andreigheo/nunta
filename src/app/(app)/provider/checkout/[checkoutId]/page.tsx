"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, XCircle } from "lucide-react";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { Badge, Button, Card, CardContent, PageHeader, useToast } from "@/components/ui";

export default function FakeHostedCheckoutPage() {
  const { checkoutId } = useParams<{ checkoutId: string }>();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const act = async (action: "CAPTURE" | "FAIL") => {
    if (!currentWorkspace) return;
    setBusy(true);
    try {
      await weddingOsApi.fakePaymentAction(currentWorkspace.id, checkoutId, action);
      toast({ title: action === "CAPTURE" ? "Providerul a confirmat plata" : "Providerul a respins plata", description: action === "CAPTURE" ? "Ledgerul a fost actualizat de evenimentul providerului local." : "Nu a fost creată nicio plată în ledger.", variant: action === "CAPTURE" ? "success" : "error" });
      router.replace(`/payments?checkout=${action === "CAPTURE" ? "success" : "failed"}`);
    } catch (error) { toast({ title: "Evenimentul providerului a eșuat", description: apiErrorMessage(error), variant: "error" }); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-xl space-y-5 py-8"><PageHeader title="Checkout securizat" description="Provider local de test. Nu folosește bani reali." /><Card><CardContent className="space-y-5 p-6"><div className="flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><CreditCard className="size-6" /></span><div><p className="font-semibold text-ink">Sarbato Fake Payment Provider</p><Badge variant="warning">TEST MODE</Badge></div></div><p className="text-sm text-muted">Acest ecran simulează pagina găzduită de provider. Redirectul singur nu confirmă plata; butonul de mai jos emite evenimentul provider care actualizează ledgerul.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void act("CAPTURE")}><CheckCircle2 className="size-4" />Simulează plată reușită</Button><Button disabled={busy} variant="destructive-outline" onClick={() => void act("FAIL")}><XCircle className="size-4" />Simulează eșec</Button><Button disabled={busy} variant="ghost" onClick={() => router.replace("/payments?checkout=cancelled")}>Anulează</Button></div></CardContent></Card></div>;
}
