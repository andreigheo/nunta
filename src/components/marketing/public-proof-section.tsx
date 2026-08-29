import { BarChart3, ShieldCheck } from "lucide-react";
import type { MarketingProductProof } from "@/lib/marketing/product-proof";
import { hasPublishablePublicProof } from "@/lib/marketing/product-proof-normalizer";

export function PublicProofSection({
  proof,
}: {
  proof: MarketingProductProof;
}) {
  if (!hasPublishablePublicProof(proof)) return null;

  return (
    <section
      className="border-y border-line bg-ink py-16 text-white sm:py-20"
      aria-labelledby="public-proof-title"
      data-testid="public-proof-metrics"
    >
      <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)] lg:items-end lg:gap-16 lg:px-10 xl:px-12">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-warning-soft">
            <ShieldCheck className="size-4" aria-hidden />
            Date agregate și anonimizate
          </p>
          <p className="mt-2 text-xs font-medium text-white/65">
            {proof.state === "fresh"
              ? "Date agregate · actualizare verificată"
              : "Date agregate · ultimul snapshot valid"}
          </p>
          <h2
            id="public-proof-title"
            className="marketing-heading mt-4 text-[clamp(2.35rem,3.7vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white text-balance"
          >
            Produsul poate fi măsurat fără să expună evenimentele.
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-7 text-white/75">
            Publicăm numai procente rotunjite, din cohorte care trec pragul de
            confidențialitate.
          </p>
        </div>

        <ul
          className="grid gap-px bg-white/15 sm:grid-cols-2"
          aria-label="Indicatori publici agregați"
        >
          {proof.metrics.map((metric) => (
            <li key={metric.key} className="min-w-0 bg-ink p-5 sm:p-6">
              <BarChart3 className="size-5 text-accent" aria-hidden />
              <p
                className={
                  metric.state === "published"
                    ? "mt-6 marketing-heading text-4xl font-semibold text-white tabular-nums"
                    : "mt-6 text-base font-semibold leading-6 text-white"
                }
              >
                {metric.value ?? "Cohortă insuficientă"}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-white">
                {metric.label}
              </p>
              <p className="mt-2 text-xs leading-5 text-white/65">
                {metric.cohort ??
                  "Pragul public de confidențialitate nu a fost atins."}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
