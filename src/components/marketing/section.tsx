import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Cta } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

const ctaVariants = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-strong active:bg-brand-strong",
  outline:
    "border border-line-strong bg-surface text-brand hover:border-brand hover:bg-brand-softer active:bg-sunken",
  ghost: "text-muted hover:bg-subtle hover:text-ink active:bg-sunken",
} as const;

export function CtaLink({
  cta,
  variant = "primary",
  withArrow = false,
  className,
}: {
  cta: Cta;
  variant?: keyof typeof ctaVariants;
  withArrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={cta.href}
      className={cn(
        "inline-flex min-h-11 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 text-base font-semibold transition-[background-color,color,border-color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2",
        ctaVariants[variant],
        className,
      )}
    >
      {cta.label}
      {withArrow ? <ArrowRight className="size-4" aria-hidden /> : null}
    </Link>
  );
}

export function SectionHeading({
  title,
  lead,
  className,
}: {
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-[68ch]", className)}>
      <h2 className="marketing-heading text-[clamp(2.5rem,4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-brand text-balance">
        {title}
      </h2>
      {lead ? (
        <p className="mt-5 max-w-[62ch] text-lg leading-8 text-muted">{lead}</p>
      ) : null}
    </div>
  );
}

export function Section({
  id,
  children,
  className,
  containerClassName,
  spacing = "standard",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  spacing?: "compact" | "standard" | "major";
}) {
  const spacingClasses = {
    compact: "py-14 sm:py-16",
    standard: "py-20 sm:py-24 lg:py-28",
    major: "py-20 sm:py-24 lg:py-32",
  };
  return (
    <section id={id} className={cn(spacingClasses[spacing], className)}>
      <div
        className={cn(
          "mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-10 xl:px-12",
          containerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
