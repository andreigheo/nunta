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
  ListChecks,
  MailCheck,
  MapPin,
  MessageSquareText,
  Monitor,
  ScanLine,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
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
        "relative overflow-hidden py-20 sm:py-24 lg:py-32",
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
          "mx-auto grid w-full max-w-[90rem] gap-12 px-5 sm:px-8 lg:items-center lg:gap-16 lg:px-10 xl:px-12",
          index % 2 === 1
            ? "lg:grid-cols-[minmax(0,1.28fr)_minmax(20rem,0.72fr)]"
            : "lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]",
        )}
      >
        <div className={cn("max-w-[36rem]", index % 2 === 1 && "lg:order-2")}>
          <p
            className={cn(
              "text-sm font-semibold",
              dark ? "text-warning-soft" : "text-accent-strong",
            )}
          >
            {story.navLabel}
          </p>
          <h2
            id={`${story.id}-title`}
            className={cn(
              "marketing-heading mt-4 text-[clamp(2.65rem,4.5vw,4.75rem)] font-semibold leading-[0.99] tracking-[-0.04em] text-balance",
              dark ? "text-on-brand" : "text-brand",
            )}
          >
            {story.title}
          </h2>
          <p
            className={cn(
              "mt-6 max-w-[58ch] text-lg leading-8",
              dark ? "text-on-brand" : "text-muted",
            )}
          >
            {story.lead}
          </p>

          <ul className="mt-8 space-y-4">
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
                    "text-base font-semibold leading-7",
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
          "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5",
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
            "rounded-full px-3 py-1.5 text-xs font-semibold",
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
        <div className="border-b border-line p-4 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-brand" aria-hidden />
              <p className="text-base font-semibold text-ink">
                Etapa în revizuire
              </p>
            </div>
            <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
              Necesită aprobare
            </span>
          </div>

          <div className="mt-4 inline-flex rounded-lg bg-subtle p-1">
            {views.map((view, index) => (
              <span
                key={view}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                  index === 0 ? "bg-elevated text-brand" : "text-muted",
                )}
              >
                {view}
              </span>
            ))}
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

        <div className="p-4 sm:p-6">
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
  const logistics = [
    [UtensilsCrossed, "Preferință meniu", "Salvată"],
    [Armchair, "Plan de mese", "De alocat"],
    [MapPin, "Transport", "Cerere primită"],
    [BedDouble, "Cazare", "De verificat"],
  ] as const;

  return (
    <SurfaceShell
      title="Invitație și RSVP"
      description="Editorul publică, răspunsurile alimentează logistica"
    >
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
        <div className="border-b border-line p-4 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">
                Editor invitație
              </p>
              <p className="mt-1 text-xs text-muted">
                Șablon „Grădină de seară” · ciornă salvată
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex min-h-9 items-center rounded-lg bg-subtle px-3 text-xs font-semibold text-muted">
                Salvează
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                <MailCheck className="size-3.5" aria-hidden />
                Publicată
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {["Grădină de seară", "Editorial", "Minimal"].map(
                (template, index) => (
                  <span
                    key={template}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      index === 0
                        ? "bg-brand text-on-brand"
                        : "bg-subtle text-muted",
                    )}
                  >
                    {template}
                  </span>
                ),
              )}
            </div>
            <div className="inline-flex rounded-lg bg-subtle p-1">
              {[
                { Icon: Monitor, label: "Desktop" },
                { Icon: Tablet, label: "Tabletă" },
                { Icon: Smartphone, label: "Mobil" },
              ].map(({ Icon, label }, index) => (
                <span
                  key={label}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md",
                    index === 2 ? "bg-elevated text-brand" : "text-muted",
                  )}
                  title={label}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="sr-only">{label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <ul className="space-y-2" aria-label="Secțiuni reordonabile">
              {[
                { name: "Antet", visible: true },
                { name: "Program", visible: true },
                { name: "Galerie", visible: false },
                { name: "RSVP", visible: true },
              ].map((section, index) => (
                <li
                  key={section.name}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold",
                    index === 0
                      ? "bg-brand text-on-brand"
                      : "bg-subtle text-muted",
                  )}
                >
                  <GripVertical className="size-4 shrink-0" aria-hidden />
                  <span
                    className={cn("flex-1", !section.visible && "line-through")}
                  >
                    {section.name}
                  </span>
                  {section.visible ? (
                    <Eye className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <EyeOff className="size-3.5 shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ul>

            <div className="min-w-0 border border-line bg-elevated p-4 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-lg font-semibold text-brand">
                Evenimentul nostru
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                Detaliile importante și confirmarea, într-un singur loc.
              </p>
              <span className="mt-4 flex min-h-10 items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand">
                Confirmă participarea
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <UsersRound className="size-5 text-accent-strong" aria-hidden />
            <p className="text-base font-semibold text-ink">
              Răspunsul devine logistică
            </p>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {logistics.map(([Icon, title, status]) => (
              <li
                key={title}
                className="flex min-h-14 items-center gap-3 py-2.5"
              >
                <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
      <div className="p-4 sm:p-6">
        <ol
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Fluxul comercial: cerere, ofertă, comparare, rezervare, contract, buget"
        >
          {steps.map(({ Icon, label }, index) => (
            <li
              key={label}
              className="flex min-h-20 items-center gap-3 bg-subtle p-3"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  index % 4 === 0
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
              <span className="text-sm font-semibold leading-5 text-ink">
                {label}
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
                  className="flex min-h-12 items-center justify-between gap-4 py-2"
                >
                  <dt className="text-sm text-muted">{term}</dt>
                  <dd className="text-right text-sm font-semibold text-ink">
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
        <div className="border-b border-white/15 p-4 sm:p-6 lg:border-r lg:border-b-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-white/10 p-4">
              <p className="text-xs font-semibold text-warning-soft">ACUM</p>
              <p className="mt-2 text-lg font-semibold text-white">
                Moment în desfășurare
              </p>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Checklistul și starea momentului sunt vizibile echipei.
              </p>
            </div>
            <div className="bg-white p-4 text-ink">
              <p className="text-xs font-semibold text-accent-strong">
                URMEAZĂ
              </p>
              <p className="mt-2 text-lg font-semibold text-brand">
                Pregătește tranziția
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
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

        <div className="p-4 sm:p-6">
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
