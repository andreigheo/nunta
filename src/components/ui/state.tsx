import * as React from "react";
import { WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(100deg,var(--subtle)_40%,var(--elevated)_50%,var(--subtle)_60%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <Skeleton className="h-4 w-1/3" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  headingLevel = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  secondaryAction?: { label: string; onClick: () => void };
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const headings = { 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;
  const Heading = headings[headingLevel];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong dark:text-brand">
        <Icon className="size-6" aria-hidden />
      </div>
      <Heading className="mt-4 font-brand text-lg font-semibold tracking-tight text-ink">{title}</Heading>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button onClick={action.onClick} size="md">
              {action.icon}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline" size="md">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error state                                                        */
/* ------------------------------------------------------------------ */

export function ErrorState({
  title = "Ceva nu a funcționat",
  description = "Nu am putut încărca datele. Verifică conexiunea și încearcă din nou.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-danger/30 bg-danger-soft/40 px-6 py-10 text-center dark:bg-danger-soft/20",
        className,
      )}
    >
      <WifiOff className="size-7 text-danger" aria-hidden />
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-4">
          Încearcă din nou
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Offline indicator                                                  */
/* ------------------------------------------------------------------ */

export function OfflineBanner({ className }: { className?: string }) {
  const [offline, setOffline] = React.useState(false);
  React.useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 bg-warning px-4 py-2 text-[13px] font-medium text-on-warning",
        className,
      )}
    >
      <WifiOff className="size-4" aria-hidden />
      Ești offline. Modificările se vor sincroniza când revii online.
    </div>
  );
}
