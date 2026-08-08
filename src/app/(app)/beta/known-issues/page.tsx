import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FlaskConical } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const limitations = [
  {
    title: "Plăți și payouts în sandbox",
    detail: "Nu folosi date reale de card sau cont bancar. Confirmările providerilor sunt pentru testare controlată.",
    tone: "warning" as const,
  },
  {
    title: "Livrarea emailurilor depinde de mediul beta",
    detail: "Invitațiile sunt valide numai când operatorul confirmă providerul și domeniul mediului curent.",
    tone: "warning" as const,
  },
  {
    title: "Feedback-ul critic necesită descriere reproductibilă",
    detail: "Include pașii, rezultatul așteptat și rezultatul real. Nu include parole, tokenuri sau date de plată.",
    tone: "neutral" as const,
  },
  {
    title: "Datele sunt izolate prin grantul programului",
    detail: "Operatorul poate revoca accesul; feedback-ul și evenimentele au reguli explicite de retenție.",
    tone: "success" as const,
  },
];

export default function BetaKnownIssuesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink" href="/beta"><ArrowLeft className="size-4" /> Centrul Beta</Link>
        <div className="mt-4 flex items-center gap-3"><FlaskConical className="size-6 text-warning" /><div><h2 className="font-brand text-2xl font-semibold text-ink">Limitări și probleme cunoscute</h2><p className="mt-1 text-sm text-muted">Informații operaționale pentru participanții din mediul controlat.</p></div></div>
      </div>
      <Card className="border-warning/30"><CardContent className="flex gap-3 p-4.5"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" /><p className="text-sm leading-relaxed text-ink">Această versiune nu este lansare publică. Dacă o funcție nu este marcată explicit ca disponibilă, verifică înainte cu operatorul beta.</p></CardContent></Card>
      <div className="space-y-3">
        {limitations.map((item) => <Card key={item.title}><CardHeader><CardTitle>{item.title}</CardTitle><Badge variant={item.tone}>{item.tone === "success" ? <CheckCircle2 className="size-3" /> : null}{item.tone === "warning" ? "Limitare" : item.tone === "success" ? "Control activ" : "Ghid"}</Badge></CardHeader><CardContent><p className="text-sm leading-relaxed text-muted">{item.detail}</p></CardContent></Card>)}
      </div>
      <p className="text-xs text-faint">Actualizat pentru release-ul afișat în Centrul Beta. Lista nu înlocuiește condițiile beta sau notificarea de confidențialitate.</p>
    </div>
  );
}
