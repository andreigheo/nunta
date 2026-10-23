import * as React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge, Button } from "@/components/ui";

type SetupStep = {
  label: string;
  description: string;
  complete: boolean;
  href: string;
  action: string;
};

export function SetupGuide({
  steps,
  nextStep,
  onNavigate,
}: {
  steps: SetupStep[];
  nextStep: SetupStep;
  onNavigate: (href: string) => void;
}) {
  const completed = steps.filter((step) => step.complete).length;
  return (
    <section
      className="rounded-2xl border border-brand/20 bg-surface p-4 shadow-card sm:p-6"
      aria-labelledby="guided-start-title"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="brand">Următorul pas</Badge>
        <span className="text-xs font-medium text-muted">
          {completed} din {steps.length} repere pregătite
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2
            id="guided-start-title"
            className="font-brand text-2xl font-semibold text-ink"
          >
            {nextStep.label}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {nextStep.description}
          </p>
        </div>
        <Button
          className="w-full shrink-0 sm:w-auto"
          onClick={() => onNavigate(nextStep.href)}
        >
          {nextStep.action}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer rounded-md py-1 text-sm font-medium text-brand focus-visible:outline-2 focus-visible:outline-brand">
          Vezi pașii organizării
        </summary>
        <ol
          className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
          aria-label="Pașii de pornire ai organizării"
        >
          {steps.map((step, index) => (
            <li
              key={step.href}
              className="flex items-start gap-2 rounded-lg bg-subtle/60 p-3"
            >
              <span className="mt-0.5 text-brand">
                {step.complete ? (
                  <CheckCircle2
                    className="size-4 text-success"
                    aria-label="Pregătit"
                  />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
