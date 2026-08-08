"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  Check,
  ClipboardCopy,
  FileSignature,
  GlassWater,
  LayoutTemplate,
  ReceiptText,
  Route,
  Users,
  WalletCards,
} from "lucide-react";
import { wedding } from "@/lib/data/wedding";
import { daysUntil, formatNumber, formatRON } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Progress,
  useToast,
} from "@/components/ui";

const shortcuts = [
  { title: "Listă invitați", description: "Importă, segmentează și urmărește RSVP-urile.", href: "/guests", icon: Users },
  { title: "Plan de mese", description: "Așază invitații și verifică rapid capacitatea.", href: "/seating", icon: LayoutTemplate },
  { title: "Comparație oferte", description: "Evaluează prețul și condițiile furnizorilor.", href: "/offers", icon: ReceiptText },
  { title: "Contracte", description: "Urmărește semnăturile, termenele și avansurile.", href: "/contracts", icon: FileSignature },
  { title: "Transport", description: "Grupează traseele și necesarul de locuri.", href: "/transport", icon: Route },
];

export default function ToolsPage() {
  const { toast } = useToast();
  const [guests, setGuests] = React.useState(wedding.estimatedGuests);
  const [budget, setBudget] = React.useState(wedding.targetBudget);
  const [reservePercent, setReservePercent] = React.useState(10);

  const safeGuests = Math.max(0, Number.isFinite(guests) ? guests : 0);
  const safeBudget = Math.max(0, Number.isFinite(budget) ? budget : 0);
  const safeReserve = Math.min(30, Math.max(0, Number.isFinite(reservePercent) ? reservePercent : 0));

  const waterBottles = Math.ceil(safeGuests * 1.5);
  const wineBottles = Math.ceil(safeGuests * 0.45);
  const sparklingBottles = Math.ceil(safeGuests / 7);
  const softDrinkLitres = Math.ceil(safeGuests * 0.8);
  const reserve = Math.round((safeBudget * safeReserve) / 100);
  const available = Math.max(0, safeBudget - reserve);
  const days = daysUntil(wedding.date);

  const copyDrinks = async () => {
    const summary = `Necesar estimativ pentru ${safeGuests} invitați: ${waterBottles} sticle apă, ${wineBottles} sticle vin, ${sparklingBottles} sticle spumant și ${softDrinkLitres} litri băuturi răcoritoare.`;
    try {
      await navigator.clipboard.writeText(summary);
      toast({ title: "Estimare copiată", description: "O poți trimite acum locației sau furnizorului de băuturi.", variant: "success" });
    } catch {
      toast({ title: "Nu am putut copia", description: "Browserul a blocat accesul la clipboard.", variant: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Unelte"
        description="Calcule rapide și scurtături practice pentru deciziile de zi cu zi."
        meta={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock className="size-3.5 text-brand" aria-hidden />
            {formatNumber(days)} zile până la {wedding.title}
          </span>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <GlassWater className="size-4.5 text-info" aria-hidden />
                Estimator băuturi
              </CardTitle>
              <CardDescription>Un punct de pornire pentru o petrecere de 8–10 ore.</CardDescription>
            </div>
            <Badge variant="info">Estimativ</Badge>
          </CardHeader>
          <CardContent>
            <Field label="Număr de invitați" htmlFor="tool-guests" hint="Ajustează după confirmările RSVP și pachetul locației.">
              <Input
                id="tool-guests"
                type="number"
                min={0}
                max={1000}
                inputMode="numeric"
                value={guests}
                onChange={(event) => setGuests(event.target.valueAsNumber || 0)}
              />
            </Field>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
              <ToolResult value={waterBottles} label="sticle apă" note="0,75 L" />
              <ToolResult value={wineBottles} label="sticle vin" note="0,75 L" />
              <ToolResult value={sparklingBottles} label="sticle spumant" note="6–7 pahare" />
              <ToolResult value={softDrinkLitres} label="litri răcoritoare" note="mix variat" />
            </dl>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-relaxed text-faint">
                Estimarea nu include cafea, cocktailuri sau băuturile deja incluse în meniul locației.
              </p>
              <Button variant="outline" size="sm" onClick={copyDrinks}>
                <ClipboardCopy className="size-3.5" aria-hidden />
                Copiază lista
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="size-4.5 text-success" aria-hidden />
                Rezervă de siguranță
              </CardTitle>
              <CardDescription>Separă neprevăzutele înainte de alocarea bugetului.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Buget total" htmlFor="tool-budget">
                <Input
                  id="tool-budget"
                  type="number"
                  min={0}
                  step={1000}
                  inputMode="numeric"
                  value={budget}
                  onChange={(event) => setBudget(event.target.valueAsNumber || 0)}
                />
              </Field>
              <Field label="Rezervă (%)" htmlFor="tool-reserve">
                <Input
                  id="tool-reserve"
                  type="number"
                  min={0}
                  max={30}
                  value={reservePercent}
                  onChange={(event) => setReservePercent(event.target.valueAsNumber || 0)}
                />
              </Field>
            </div>

            <div className="rounded-xl bg-subtle p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-muted">Păstrează separat</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatRON(reserve)}</p>
                </div>
                <Badge variant={safeReserve >= 10 ? "success" : "warning"}>{safeReserve}%</Badge>
              </div>
              <Progress value={safeReserve} max={30} tone={safeReserve >= 10 ? "success" : "warning"} className="mt-4" aria-label="Procent rezervă" />
            </div>

            <div className="flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">Disponibil pentru planificare</span>
              <span className="font-semibold tabular-nums text-ink">{formatRON(available)}</span>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-faint">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
              Recomandarea uzuală este 10–15%; ajustați după câte contracte au deja preț fix.
            </p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="shortcuts-title">
        <div className="mb-3 flex items-center gap-2">
          <Calculator className="size-4.5 text-faint" aria-hidden />
          <h2 id="shortcuts-title" className="text-base font-semibold text-ink">Deschide unealta potrivită</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="divide-y divide-line sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="group flex min-h-36 flex-col p-4 transition-colors hover:bg-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-line xl:[&:nth-child(n+3)]:border-t-0"
              >
                <shortcut.icon className="size-5 text-brand" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold text-ink">{shortcut.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{shortcut.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                  Deschide
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ToolResult({ value, label, note }: { value: number; label: string; note: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{formatNumber(value)}</dd>
      <p className="mt-0.5 text-[11px] text-faint">{note}</p>
    </div>
  );
}
