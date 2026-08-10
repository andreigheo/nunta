import {
  AlertTriangle,
  Armchair,
  ArrowLeftRight,
  ArrowRight,
  BedDouble,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileCheck2,
  GripVertical,
  ImageIcon,
  LayoutTemplate,
  ListChecks,
  MailCheck,
  MapPin,
  MessageSquareText,
  Monitor,
  Palette,
  Plus,
  ScanLine,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SlidersHorizontal,
  Tablet,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import type { ProductStory } from "@/content/marketing/sarbato";
import { cn } from "@/lib/utils";

const toneClasses = {
  plain: "bg-background text-ink",
  coral: "bg-accent-soft text-ink",
  sun: "bg-sun-soft text-ink",
  plum: "bg-brand text-on-brand",
} as const;

/* The thread takes the color of the stage the information passes through. */
const threadColors = {
  plain: "bg-brand",
  coral: "bg-accent",
  sun: "bg-sun",
  plum: "bg-success",
} as const;

export function DomainStory({
  story,
  index,
}: {
  story: ProductStory;
  index: number;
}) {
  const dark = story.tone === "plum";

  return (
    <section
      id={story.id}
      className={cn(
        "relative scroll-mt-16 overflow-hidden py-14 sm:scroll-mt-[4.5rem] sm:py-24 lg:py-32",
        toneClasses[story.tone],
      )}
      aria-labelledby={`${story.id}-title`}
    >
      <span
        aria-hidden
        className={cn(
          "mkt-thread-rail hidden lg:block",
          threadColors[story.tone],
        )}
      />
      <span
        aria-hidden
        className={cn(
          "mkt-thread-node hidden lg:block",
          threadColors[story.tone],
        )}
      />
      <div
        className={cn(
          "marketing-safe-container mx-auto grid w-full max-w-[90rem] gap-8 px-4 sm:gap-12 sm:px-8 lg:items-center lg:gap-16 lg:px-10 xl:px-12",
          index % 2 === 1
            ? "lg:grid-cols-[minmax(0,1.28fr)_minmax(20rem,0.72fr)]"
            : "lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]",
        )}
      >
        <div className={cn("max-w-[36rem]", index % 2 === 1 && "lg:order-2")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p
              className={cn(
                "text-sm font-semibold",
                dark ? "text-warning-soft" : "text-accent-strong",
              )}
            >
              {story.navLabel}
            </p>
            <ol
              className="flex flex-wrap items-center gap-2"
              aria-label={`Etapele capitolului ${story.navLabel}`}
            >
              {story.stages.map((stage, stageIndex) => (
                <li
                  key={stage}
                  className={cn(
                    "flex items-center gap-2 text-xs font-semibold",
                    dark ? "text-white/70" : "text-muted",
                  )}
                >
                  {stageIndex > 0 ? (
                    <ArrowRight className="size-3" aria-hidden />
                  ) : null}
                  <span>{stage}</span>
                </li>
              ))}
            </ol>
          </div>
          <h2
            id={`${story.id}-title`}
            className={cn(
              "marketing-heading mt-3 text-[clamp(2.25rem,10.5vw,2.75rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-balance sm:mt-4 sm:text-[clamp(2.5rem,4vw,3.5rem)] sm:leading-[1.02] sm:tracking-[-0.035em]",
              dark ? "text-on-brand" : "text-brand",
            )}
          >
            {story.title}
          </h2>
          <p
            className={cn(
              "mt-4 max-w-[58ch] text-[1.0625rem] leading-7 sm:mt-6 sm:text-lg sm:leading-8",
              dark ? "text-on-brand" : "text-muted",
            )}
          >
            {story.lead}
          </p>

          <dl
            className={cn(
              "mt-5 grid grid-cols-1 items-start gap-2.5 border-y py-4 sm:mt-7 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3",
              dark ? "border-white/15" : "border-line-strong",
            )}
          >
            <div>
              <dt
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.08em]",
                  dark ? "text-white/60" : "text-faint",
                )}
              >
                Intră în etapă
              </dt>
              <dd
                className={cn(
                  "mt-1 text-sm font-semibold leading-5",
                  dark ? "text-white" : "text-ink",
                )}
              >
                {story.handoff.input}
              </dd>
            </div>
            <ArrowRight
              className={cn(
                "ml-1 block size-4 rotate-90 sm:ml-0 sm:size-5 sm:rotate-0",
                dark ? "text-warning-soft" : "text-accent-strong",
              )}
              aria-hidden
            />
            <div>
              <dt
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.08em]",
                  dark ? "text-white/60" : "text-faint",
                )}
              >
                Continuă ca
              </dt>
              <dd
                className={cn(
                  "mt-1 text-sm font-semibold leading-5",
                  dark ? "text-white" : "text-ink",
                )}
              >
                {story.handoff.output}
              </dd>
            </div>
          </dl>

          <ul className="mt-5 space-y-3 sm:mt-7 sm:space-y-4">
            {story.capabilities.map((capability) => (
              <li key={capability} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    dark
                      ? "bg-success text-on-success"
                      : "bg-success-soft text-success",
                  )}
                >
                  <Check className="size-3.5" strokeWidth={2.3} aria-hidden />
                </span>
                <span
                  className={cn(
                    "text-base font-semibold leading-6 sm:leading-7",
                    dark ? "text-on-brand" : "text-ink",
                  )}
                >
                  {capability}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("min-w-0", index % 2 === 1 && "lg:order-1")}>
          <ProductSurface type={story.surface} />
        </div>
      </div>
    </section>
  );
}

function ProductSurface({ type }: { type: ProductStory["surface"] }) {
  if (type === "planning") return <PlanningSurface />;
  if (type === "guests") return <GuestSurface />;
  if (type === "vendors") return <VendorSurface />;
  return <EventDaySurface />;
}

function SurfaceShell({
  title,
  description,
  children,
  dark = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      role="group"
      className={cn(
        "marketing-product-surface overflow-hidden",
        dark && "marketing-product-surface-dark text-white",
      )}
      aria-label={`${title}. ${description}`}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2.5 border-b px-4 py-3 sm:gap-3 sm:px-5",
          dark ? "border-white/15" : "border-line",
        )}
      >
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              dark ? "text-white" : "text-ink",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "mt-0.5 text-xs",
              dark ? "text-white/70" : "text-muted",
            )}
          >
            {description}
          </p>
        </div>
        <span
          data-testid="showcase-label"
          className={cn(
            "max-w-full rounded-full px-3 py-1.5 text-xs font-semibold leading-4",
            dark ? "bg-white/10 text-white" : "bg-subtle text-muted",
          )}
        >
          Exemplu de produs — nu reprezintă datele unui client.
        </span>
      </div>
      {children}
    </div>
  );
}

function PlanningSurface() {
  const views = ["Listă", "Panou", "Cronologie", "Calendar"] as const;
  const tasks = [
    {
      title: "Clarifică prioritățile",
      status: "Pregătit",
      owner: "Organizator",
      deadline: "Termen săptămâna aceasta",
    },
    {
      title: "Revizuiește dependențele",
      status: "De verificat",
      owner: "Organizator",
      deadline: "Blocată de o decizie",
    },
    {
      title: "Aprobă etapa următoare",
      status: "Acțiune",
      owner: "Coordonator",
      deadline: "Termen apropiat",
    },
  ] as const;

  return (
    <SurfaceShell
      title="Planul evenimentului"
      description="Propunere, responsabilități și riscuri înainte de aplicare"
    >
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(14rem,0.85fr)]">
        <div className="border-b border-line p-3.5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex flex-col items-start gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <ClipboardCheck className="size-5 text-brand" aria-hidden />
              <p className="text-base font-semibold text-ink">
                Etapa în revizuire
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
              Necesită aprobare
            </span>
          </div>

          <div className="mt-4 hidden flex-wrap items-center gap-2 sm:flex">
            <span className="text-xs font-semibold text-faint">
              Vizualizări:
            </span>
            <ul className="flex flex-wrap gap-1.5" aria-label="Vizualizări disponibile">
              {views.map((view) => (
                <li
                  key={view}
                  className="rounded-full bg-subtle px-2.5 py-1 text-xs font-semibold text-muted"
                >
                  {view}
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-4 divide-y divide-line">
            {tasks.map((task, index) => (
              <li
                key={task.title}
                className="flex min-h-16 items-center gap-3 py-3"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    index === 2
                      ? "bg-accent text-white"
                      : index === 1
                        ? "bg-warning-soft text-warning"
                        : "bg-success-soft text-success",
                  )}
                >
                  {index === 2 ? (
                    <ArrowRight className="size-4" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {task.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {task.status} · {task.owner} · {task.deadline}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3.5 sm:p-6">
          <p className="text-sm font-semibold text-muted">Următoarea acțiune</p>
          <p className="mt-2 text-xl font-semibold leading-tight text-brand">
            Aprobă etapa și publică termenele
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Calendarul și responsabilitățile vor folosi versiunea revizuită.
          </p>
          <div className="mt-6 bg-brand-softer p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand">
              <ShieldCheck className="size-4" aria-hidden />
              Plan B atașat
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              Riscul și decizia rămân lângă etapa care le folosește.
            </p>
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}

function GuestSurface() {
  const blocks = [
    [ImageIcon, "Imagine hero", "Adăugat"],
    [LayoutTemplate, "Text și poveste", "Adăugat"],
    [CalendarCheck2, "Program", "Adăugat"],
    [ImageIcon, "Galerie", "Ascuns"],
    [MailCheck, "RSVP", "Adăugat"],
  ] as const;
  const logistics = [
    [UtensilsCrossed, "Preferință meniu", "Salvată"],
    [Armchair, "Plan de mese", "De alocat"],
    [MapPin, "Transport", "Cerere primită"],
    [BedDouble, "Cazare", "De verificat"],
  ] as const;

  return (
    <SurfaceShell
      title="Invitație și RSVP"
      description="Blocuri, design, previzualizare și răspunsuri conectate"
    >
      <div className="flex flex-col items-start gap-3 border-b border-line px-4 py-3 min-[430px]:flex-row min-[430px]:flex-wrap min-[430px]:items-center min-[430px]:justify-between sm:px-5">
        <div>
          <p className="text-sm font-semibold text-ink">Editor invitație</p>
          <p className="mt-0.5 text-xs text-muted">
            Structură, canvas și inspector vizual
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-subtle p-1" aria-label="Previzualizare responsive">
            {[
              { Icon: Monitor, label: "Desktop" },
              { Icon: Tablet, label: "Tabletă" },
              { Icon: Smartphone, label: "Mobil" },
            ].map(({ Icon, label }, index) => (
              <span
                key={label}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  index === 0 ? "bg-elevated text-brand" : "text-muted",
                )}
                title={label}
              >
                <Icon className="size-4" aria-hidden />
                <span className="sr-only">{label}</span>
              </span>
            ))}
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
            <MailCheck className="size-3.5" aria-hidden />
            Salvată
          </span>
        </div>
      </div>

      <div className="grid min-w-0 min-[1120px]:grid-cols-[10.5rem_minmax(16rem,1fr)_12rem]">
        <div className="border-b border-line p-3.5 sm:p-4 min-[1120px]:border-r min-[1120px]:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Blocuri</p>
            <span className="text-xs font-semibold text-faint">14 tipuri</span>
          </div>
          <ul
            className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 min-[1120px]:block min-[1120px]:space-y-2"
            aria-label="Exemple de blocuri disponibile"
          >
            {blocks.map(([Icon, name, status], index) => (
              <li
                key={name}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-2.5",
                  index === 0 ? "bg-brand text-on-brand" : "bg-subtle text-muted",
                )}
              >
                <GripVertical className="size-3.5 shrink-0" aria-hidden />
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-xs font-semibold leading-4">
                  {name}
                </span>
                {status === "Ascuns" ? (
                  <EyeOff className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <Eye className="size-3.5 shrink-0" aria-hidden />
                )}
              </li>
            ))}
          </ul>
          <span className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line text-xs font-semibold text-brand">
            <Plus className="size-3.5" aria-hidden />
            Adaugă bloc
          </span>
        </div>

        <div className="min-w-0 border-b border-line bg-subtle p-4 sm:p-5 min-[1120px]:border-r min-[1120px]:border-b-0">
          <div className="mx-auto max-w-[25rem] overflow-hidden border border-line bg-elevated shadow-card">
            <div className="relative min-h-36 bg-accent-soft px-5 py-6 text-center">
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-elevated px-2 py-1 text-xs font-semibold text-brand">
                <ImageIcon className="size-3" aria-hidden />
                Imagine hero
              </span>
              <span className="mx-auto mt-5 flex size-11 items-center justify-center rounded-full bg-brand text-on-brand">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="marketing-heading mt-3 text-xl font-semibold text-brand">
                Evenimentul nostru
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Povestea, programul și detaliile importante.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 p-3.5 sm:p-4">
              {["Poveste", "Program", "Locație"].map((item) => (
                <span
                  key={item}
                  className="flex min-h-10 items-center justify-center bg-subtle px-2 text-xs font-semibold text-muted"
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="border-t border-line p-4 text-center">
              <p className="text-xs leading-5 text-muted">
                Confirmarea și preferințele merg direct în RSVP.
              </p>
              <span className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand">
                Confirmă participarea
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-4 p-3.5 min-[430px]:grid-cols-2 sm:p-4 min-[1120px]:block">
          <div className="flex items-center gap-2 min-[430px]:col-span-2 min-[1120px]:col-span-1">
            <SlidersHorizontal className="size-4 text-brand" aria-hidden />
            <p className="text-sm font-semibold text-ink">Inspector</p>
          </div>
          <div className="mt-4 border-b border-line pb-4 lg:mt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <Palette className="size-3.5" aria-hidden />
              Paletă
            </div>
            <div
              className="mt-3 flex gap-2"
              role="img"
              aria-label="Paletă configurabilă cu plum, coral, galben și verde"
            >
              {["bg-brand", "bg-accent", "bg-sun", "bg-success"].map((tone) => (
                <span
                  key={tone}
                  className={cn("size-7 rounded-full border-2 border-elevated shadow-card", tone)}
                  aria-hidden
                />
              ))}
            </div>
          </div>
          <div className="border-b border-line py-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <LayoutTemplate className="size-3.5" aria-hidden />
              Layout hero
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="flex min-h-9 items-center justify-center rounded-lg bg-brand text-xs font-semibold text-on-brand">
                Centrat
              </span>
              <span className="flex min-h-9 items-center justify-center rounded-lg bg-subtle text-xs font-semibold text-muted">
                Împărțit
              </span>
            </div>
          </div>
          <div className="pt-4 min-[430px]:col-span-2 min-[1120px]:col-span-1">
            <p className="text-xs font-semibold text-muted">Imagine hero</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Focalizare</dt>
                <dd className="font-semibold text-ink">Centru</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Overlay</dt>
                <dd className="font-semibold text-ink">Ușor</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-subtle p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <UsersRound className="size-5 text-accent-strong" aria-hidden />
          <p className="text-sm font-semibold text-ink">
            Răspunsul continuă în logistică
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-px bg-line min-[430px]:grid-cols-2 xl:grid-cols-4">
          {logistics.map(([Icon, title, status]) => (
            <li key={title} className="flex min-h-16 items-center gap-3 bg-elevated p-3">
              <Icon className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink">{title}</span>
                <span className="mt-0.5 block text-xs text-muted">{status}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SurfaceShell>
  );
}

function VendorSurface() {
  const steps = [
    { Icon: Send, label: "Cerere trimisă" },
    { Icon: MessageSquareText, label: "Ofertă primită" },
    { Icon: ArrowLeftRight, label: "Comparare" },
    { Icon: CalendarCheck2, label: "Rezervare" },
    { Icon: FileCheck2, label: "Contract pregătit" },
    { Icon: WalletCards, label: "Buget urmărit" },
  ] as const;

  return (
    <SurfaceShell
      title="Furnizori și buget"
      description="Urma deciziei de la cerere până la angajament"
    >
      <div className="p-3.5 sm:p-6">
        <ol
          className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 sm:gap-3 lg:grid-cols-3"
          aria-label="Fluxul comercial: cerere, ofertă, comparare, rezervare, contract, buget"
        >
          {steps.map(({ Icon, label }, index) => (
            <li
              key={label}
              className={cn(
                "relative flex min-h-[4.5rem] min-w-0 items-center gap-2.5 p-2.5 sm:min-h-20 sm:gap-3 sm:p-3",
                index === 1 ? "bg-brand text-on-brand" : "bg-subtle text-ink",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  index === 1
                    ? "bg-white/10 text-white"
                    : index % 4 === 0
                    ? "bg-brand-softer text-brand"
                    : index % 4 === 1
                      ? "bg-accent-soft text-accent-strong"
                      : index % 4 === 2
                        ? "bg-sun-soft text-sun-strong"
                        : "bg-success-soft text-success",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs font-semibold uppercase tracking-[0.08em]",
                    index === 1 ? "text-white/60" : "text-faint",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-5">
                  {label}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(14rem,0.9fr)]">
          <div className="border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-base font-semibold text-ink">
                Ofertă revizuită
              </p>
              <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                Decizie necesară
              </span>
            </div>
            <dl className="mt-4 divide-y divide-line">
              {[
                ["Cerințe", "Aliniate cu cererea"],
                ["Versiune", "Păstrată pentru comparație"],
                ["Rezervare", "Pregătită după acceptare"],
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="flex min-h-12 flex-col items-start justify-center gap-1 py-2 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between min-[430px]:gap-4"
                >
                  <dt className="text-sm text-muted">{term}</dt>
                  <dd className="text-left text-sm font-semibold text-ink min-[430px]:text-right">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-brand p-4 text-on-brand">
            <p className="text-sm font-semibold">Bugetul păstrează contextul</p>
            <p className="mt-3 text-sm leading-6 text-on-brand">
              Sarbato nu colectează și nu transferă plățile dintre organizatori
              și furnizori. Platforma păstrează evidența operațională; plățile
              se fac direct, prin metoda agreată de părți.
            </p>
            <span className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-elevated px-3 text-sm font-semibold text-brand">
              <ShieldCheck className="size-4" aria-hidden />
              Plată directă între părți
            </span>
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}

function EventDaySurface() {
  return (
    <SurfaceShell
      title="Centrul operațional"
      description="Acum, Urmează, echipă și incidente"
      dark
    >
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)]">
        <div className="border-b border-white/15 p-3.5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-2 sm:gap-3">
            <div className="bg-white/10 p-3 sm:p-4">
              <p className="text-xs font-semibold text-warning-soft">ACUM</p>
              <p className="mt-2 text-base font-semibold leading-5 text-white sm:text-lg sm:leading-normal">
                Moment în desfășurare
              </p>
              <p className="mt-2 text-xs leading-5 text-white/70 sm:text-sm sm:leading-6">
                Checklistul și starea momentului sunt vizibile echipei.
              </p>
            </div>
            <div className="bg-white p-3 text-ink sm:p-4">
              <p className="text-xs font-semibold text-accent-strong">
                URMEAZĂ
              </p>
              <p className="mt-2 text-base font-semibold leading-5 text-brand sm:text-lg sm:leading-normal">
                Pregătește tranziția
              </p>
              <p className="mt-2 text-xs leading-5 text-muted sm:text-sm sm:leading-6">
                Următoarea acțiune păstrează contextul din plan.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 bg-white/5 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-white/85">
              <ScanLine className="size-4 text-success-soft" aria-hidden />
              Check-in: sosiri în curs
            </span>
            <span className="flex items-center gap-2 text-sm font-medium text-white/85">
              <ListChecks className="size-4 text-sun-soft" aria-hidden />
              Checklist: elemente deschise
            </span>
          </div>

          <ol className="mt-5 divide-y divide-white/15">
            {[
              ["Moment confirmat", "Finalizat"],
              ["Tranziție în pregătire", "Acum"],
              ["Verificare echipă", "Urmează"],
            ].map(([title, state], index) => (
              <li
                key={title}
                className="flex min-h-14 items-center gap-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    index === 0
                      ? "bg-success text-on-success"
                      : index === 1
                        ? "bg-accent text-white"
                        : "bg-white/10 text-white",
                  )}
                >
                  {index === 0 ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <CalendarCheck2 className="size-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/65">
                    {state}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="p-3.5 sm:p-6">
          <div className="flex items-center gap-2 text-warning-soft">
            <AlertTriangle className="size-5" aria-hidden />
            <p className="text-base font-semibold">Incident controlat</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Tipul, severitatea și starea rămân în aceeași vedere operațională.
          </p>
          <div className="mt-5 bg-white/10 p-4">
            <p className="text-xs font-semibold text-white/65">STARE</p>
            <p className="mt-2 text-lg font-semibold text-white">
              Plan B confirmat
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-success-soft">
              <CheckCircle2 className="size-4" aria-hidden />
              Echipa poate continua
            </div>
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}
