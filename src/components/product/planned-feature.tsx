import Link from "next/link";
import { ArrowRight, ShieldCheck, type LucideIcon } from "lucide-react";
import { Badge, Card, CardContent, PageHeader } from "@/components/ui";

export function PlannedFeature({
  icon: Icon,
  title,
  description,
  availableHref,
  availableLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  availableHref: string;
  availableLabel: string;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={title}
        description={description}
        meta={<Badge variant="neutral">În pregătire</Badge>}
      />

      <section className="relative overflow-hidden rounded-2xl border border-brand/30 bg-brand px-6 py-8 text-on-brand sm:px-8 sm:py-10">
        <div
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--brand)_0_25%,var(--accent)_25%_50%,var(--sun)_50%_75%,var(--success)_75%)]"
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-on-brand/10">
            <Icon className="size-6" aria-hidden />
          </span>
          <h2 className="mt-5 font-brand text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
            Fără date inventate și fără acțiuni care doar par funcționale.
          </h2>
          <p className="mt-3 text-sm leading-6 text-on-brand/75 sm:text-[15px]">
            Ecranul va fi activat când are contract backend, stări de încărcare
            și erori, persistență și permisiuni verificate. Până atunci, Sarbato
            te trimite spre fluxul disponibil acum.
          </p>
          <Link
            href={availableHref}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand-softer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-brand"
          >
            {availableLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      <Card>
        <CardContent className="flex gap-3 p-5 sm:p-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-brand text-lg font-semibold text-ink">
              Aceeași regulă în tot produsul
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Modulele active folosesc date persistente. Funcțiile care nu au
              încă suport real nu sunt prezentate drept finalizate.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
