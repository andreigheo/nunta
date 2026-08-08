import Link from "next/link";
import { cn } from "@/lib/utils";

export function SarbatoMark({
  className,
  compact = false,
  href = "/",
  inverse = false,
}: {
  className?: string;
  compact?: boolean;
  href?: string;
  inverse?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Sarbato"
      className={cn(
        "group inline-flex min-h-11 shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4",
        className,
      )}
    >
      <span className="relative inline-flex pb-1">
        <span
          className={cn(
            "font-brand font-semibold leading-none tracking-[-0.035em]",
            compact ? "text-2xl" : "text-3xl",
            inverse ? "text-on-brand" : "text-brand",
          )}
        >
          Sarbato
        </span>
        <span
          aria-hidden
          className="absolute bottom-0 left-[0.08em] h-[3px] w-[44%] rounded-full bg-accent transition-[width] duration-200 ease-out group-hover:w-[58%]"
        />
        <span
          aria-hidden
          className="absolute bottom-0 left-[44%] h-[3px] w-[28%] rounded-full bg-warning"
        />
        <span
          aria-hidden
          className="absolute bottom-0 left-[72%] h-[3px] w-[18%] rounded-full bg-success"
        />
      </span>
    </Link>
  );
}
