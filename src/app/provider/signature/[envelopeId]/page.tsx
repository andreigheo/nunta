"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FileSignature, PenLine, XCircle } from "lucide-react";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { Badge, Button, Card, CardContent, PageHeader, useToast } from "@/components/ui";

export default function FakeSignatureProviderPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>();
  const signerId = useSearchParams().get("signer") ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (signerId) void weddingOsApi.signerFakeAction(envelopeId, signerId, "VIEW").catch(() => undefined);
  }, [envelopeId, signerId]);

  const act = async (action: "SIGN" | "DECLINE") => {
    if (!signerId) return;
    setBusy(true);
    try {
      await weddingOsApi.signerFakeAction(envelopeId, signerId, action);
      toast({
        title: action === "SIGN" ? "Semnătură de test înregistrată" : "Semnarea a fost refuzată",
        variant: action === "SIGN" ? "success" : "error",
      });
      router.replace("/");
    } catch (error) {
      toast({ title: "Acțiunea de semnare a eșuat", description: apiErrorMessage(error), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto max-w-xl space-y-5">
        <PageHeader title="Semnare electronică" description="Provider local controlat pentru testarea fluxului complet." />
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><FileSignature className="size-6" /></span>
              <div><p className="font-semibold text-ink">Sarbato Fake Signature Provider</p><Badge variant="warning">TEST SIGNATURE</Badge></div>
            </div>
            <p className="text-sm text-muted">Semnătura de test este legată de hash-ul PDF-ului imutabil și este etichetată separat de semnăturile avansate sau calificate.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !signerId} onClick={() => void act("SIGN")}><PenLine className="size-4" />Semnează documentul</Button>
              <Button disabled={busy || !signerId} variant="destructive-outline" onClick={() => void act("DECLINE")}><XCircle className="size-4" />Refuză</Button>
              <Button variant="ghost" onClick={() => router.replace("/")}>Înapoi</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
