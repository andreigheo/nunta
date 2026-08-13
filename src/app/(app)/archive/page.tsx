"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  CalendarDays,
  Download,
  FileArchive,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SegmentedControl,
  useToast,
} from "@/components/ui";

type ArchiveKind = "memories" | "documents" | "people";
type ArchiveItem = {
  id: string;
  title: string;
  detail: string;
  kind: ArchiveKind;
  count: string;
  updated: string;
  protected?: boolean;
};

const seedItems: ArchiveItem[] = [
  {
    id: "ar-1",
    title: "Galeria zilei",
    detail: "Selecția finală foto și favoritele voastre",
    kind: "memories",
    count: "684 fotografii",
    updated: "18 oct. 2027",
    protected: true,
  },
  {
    id: "ar-2",
    title: "Filmele nunții",
    detail: "Teaser, film lung și înregistrările discursurilor",
    kind: "memories",
    count: "6 fișiere · 18,4 GB",
    updated: "2 nov. 2027",
    protected: true,
  },
  {
    id: "ar-3",
    title: "Mesaje de la invitați",
    detail: "Urări RSVP, mesaje din seara nunții și cartea digitală",
    kind: "memories",
    count: "132 mesaje",
    updated: "14 sept. 2027",
  },
  {
    id: "ar-4",
    title: "Contracte semnate",
    detail: "Versiunile finale și anexele furnizorilor",
    kind: "documents",
    count: "11 documente",
    updated: "30 sept. 2027",
    protected: true,
  },
  {
    id: "ar-5",
    title: "Facturi și dovezi de plată",
    detail: "Dosarul financiar complet al evenimentului",
    kind: "documents",
    count: "27 documente",
    updated: "3 oct. 2027",
    protected: true,
  },
  {
    id: "ar-6",
    title: "Design & papetărie",
    detail: "Invitația, meniurile și fișierele pregătite pentru tipar",
    kind: "documents",
    count: "18 fișiere",
    updated: "12 sept. 2027",
  },
  {
    id: "ar-7",
    title: "Lista finală de invitați",
    detail: "Răspunsuri, meniuri și așezarea la mese",
    kind: "people",
    count: "146 persoane",
    updated: "12 sept. 2027",
    protected: true,
  },
  {
    id: "ar-8",
    title: "Echipa evenimentului",
    detail: "Furnizori, contacte și responsabilități din ziua nunții",
    kind: "people",
    count: "23 contacte",
    updated: "12 sept. 2027",
  },
];

const kindCopy = {
  memories: {
    label: "Amintiri",
    icon: ImageIcon,
    surface: "bg-accent-soft",
    tone: "text-accent-strong",
  },
  documents: {
    label: "Documente",
    icon: FileText,
    surface: "bg-brand-soft",
    tone: "text-brand",
  },
  people: {
    label: "Persoane",
    icon: Users,
    surface: "bg-info-soft",
    tone: "text-info",
  },
};

export default function ArchivePage() {
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [kind, setKind] = React.useState<"all" | ArchiveKind>("all");
  const [query, setQuery] = React.useState("");
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [restored, setRestored] = React.useState(false);

  if (!demoMode) {
    return currentWorkspace ? (
      <ConnectedArchive
        workspaceId={currentWorkspace.id}
        title={currentWorkspace.title}
        weddingDate={currentWorkspace.weddingDate}
        capabilities={bootstrap?.membership.capabilities ?? []}
      />
    ) : null;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("ro-RO");
  const visible = seedItems.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    return (
      !normalizedQuery ||
      `${item.title} ${item.detail} ${item.count}`
        .toLocaleLowerCase("ro-RO")
        .includes(normalizedQuery)
    );
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Arhivă"
        description="Capsula privată a nunții Ana & Mihai — amintiri, documente și oamenii care au făcut parte din poveste."
        meta={
          <>
            <Badge variant="success" dot>
              Arhivă completă
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-faint">
              <CalendarDays className="size-3.5" aria-hidden />
              Închisă la 4 octombrie 2027
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Export pornit",
                  description:
                    "Pregătim arhiva completă. Vei primi un link valabil 48 de ore.",
                  variant: "info",
                })
              }
            >
              <Download className="size-3.5" aria-hidden />
              Exportă arhiva
            </Button>
            <Button
              size="sm"
              variant={restored ? "secondary" : "primary"}
              disabled={restored}
              onClick={() => setRestoreOpen(true)}
            >
              <RefreshCcw className="size-3.5" aria-hidden />
              {restored ? "Restaurată" : "Restaurează spațiul"}
            </Button>
          </>
        }
      />

      <Card className="relative overflow-hidden border-brand/35 bg-brand text-on-brand">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          aria-hidden
        >
          <span className="absolute -right-12 -top-20 size-56 rounded-full border border-white/40" />
          <span className="absolute -right-2 -top-10 size-40 rounded-full border border-white/40" />
          <span className="absolute -left-16 bottom-[-7rem] size-52 rounded-full border border-white/30" />
        </div>
        <CardContent className="relative grid gap-7 p-6 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-on-brand/65">
              <Sparkles className="size-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                12 septembrie 2027 · Brașov
              </span>
            </div>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Ana & Mihai
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-on-brand/75">
              O grădină, 146 de oameni și o zi păstrată cu tot ce a făcut-o a
              voastră.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-5 rounded-xl bg-white/10 px-5 py-4 text-center backdrop-blur-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-on-brand/55">
                Fișiere
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold">746</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-on-brand/55">
                Documente
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold">56</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-on-brand/55">
                Mesaje
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold">132</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: LockKeyhole,
            title: "Acces privat",
            text: "Doar membrii spațiului pot vedea arhiva.",
          },
          {
            icon: ShieldCheck,
            title: "Păstrată în siguranță",
            text: "Fișierele marcate sunt incluse în copia protejată.",
          },
          {
            icon: FileArchive,
            title: "Export portabil",
            text: "Descarcă oricând o copie completă, organizată.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <CardContent className="flex gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {text}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          ariaLabel="Filtrează arhiva"
          value={kind}
          onChange={setKind}
          className="max-w-full overflow-x-auto"
          options={[
            { value: "all", label: "Tot" },
            { value: "memories", label: "Amintiri" },
            { value: "documents", label: "Documente" },
            { value: "people", label: "Persoane" },
          ]}
        />
        <Input
          className="md:w-80"
          icon={<Search className="size-4" />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Caută în arhivă…"
          aria-label="Caută în arhivă"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Niciun rezultat în arhivă"
          description="Încearcă un termen mai scurt sau caută în toate categoriile."
          action={{
            label: "Resetează căutarea",
            onClick: () => {
              setQuery("");
              setKind("all");
            },
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const config = kindCopy[item.kind];
            const Icon = config.icon;
            return (
              <Card key={item.id} interactive role="group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl",
                        config.surface,
                        config.tone,
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="flex items-center gap-1.5">
                      {item.protected && (
                        <LockKeyhole
                          className="size-3.5 text-faint"
                          aria-label="Inclus în copia protejată"
                        />
                      )}
                      <Badge variant="outline">{config.label}</Badge>
                    </div>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-1 min-h-10 text-[13px] leading-relaxed text-muted">
                    {item.detail}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
                    <div>
                      <p className="text-xs font-medium text-ink">
                        {item.count}
                      </p>
                      <p className="mt-0.5 text-[11px] text-faint">
                        Actualizat {item.updated}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Descarcă ${item.title}`}
                      onClick={() =>
                        toast({
                          title: "Descărcare pregătită",
                          description: item.title,
                          variant: "success",
                        })
                      }
                    >
                      <Download className="size-4" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onConfirm={() => {
          setRestored(true);
          setRestoreOpen(false);
          toast({
            title: "Spațiu restaurat",
            description: "Planificarea și editarea sunt din nou disponibile.",
            variant: "success",
          });
        }}
        title="Restaurezi spațiul de lucru?"
        description="Toate modulele redevin editabile. Arhiva și fișierele protejate rămân neschimbate."
        confirmLabel="Restaurează"
      />
    </div>
  );
}

function ConnectedArchive({
  workspaceId,
  title,
  weddingDate,
  capabilities,
}: {
  workspaceId: string;
  title: string;
  weddingDate: string | null;
  capabilities: string[];
}) {
  const [documents, setDocuments] = React.useState<OperationResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const canReadDocuments = capabilities.includes("document.read");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    if (!canReadDocuments) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    try {
      setDocuments((await weddingOsApi.documents(workspaceId)).items);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [canReadDocuments, workspaceId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading)
    return <div className="h-72 animate-pulse rounded-xl bg-subtle" />;
  if (error)
    return (
      <ErrorState
        title="Arhiva nu poate fi încărcată"
        description={error}
        onRetry={() => void load()}
      />
    );

  const available = documents.filter((item) => item.status === "AVAILABLE");
  const processing = documents.filter((item) => item.status === "PROCESSING");
  const quarantined = documents.filter((item) => item.status === "QUARANTINED");
  const can = (capability: string) => capabilities.includes(capability);
  const sections = [
    {
      title: "Documente și fișiere",
      description:
        "Documente private, scanate antivirus și disponibile prin download securizat.",
      count: `${available.length} disponibile`,
      href: "/documents",
      icon: FileText,
      visible: can("document.read"),
    },
    {
      title: "Contracte",
      description:
        "Versiuni, semnături și dovezi păstrate în registrul comercial.",
      count: "Deschide registrul",
      href: "/contracts",
      icon: ShieldCheck,
      visible: can("contract.read"),
    },
    {
      title: "Galeria invitaților",
      description:
        "Fotografii aprobate, respinse și în curs de moderare din ziua evenimentului.",
      count: "Deschide galeria",
      href: "/moments",
      icon: ImageIcon,
      visible: can("gallery.read"),
    },
    {
      title: "Invitați și RSVP",
      description:
        "Lista curentă, răspunsurile, meniurile și nevoile logistice persistente.",
      count: "Deschide evidența",
      href: "/guests",
      icon: Users,
      visible: can("guest.read"),
    },
  ].filter((section) => section.visible);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Arhivă"
        description={`Evidențele persistente pentru ${title}. Nimic din această pagină nu este demonstrativ.`}
        meta={
          weddingDate ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <CalendarDays className="size-3.5" aria-hidden />
              Eveniment:{" "}
              {new Intl.DateTimeFormat("ro-RO", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(`${weddingDate}T00:00:00.000Z`))}
            </span>
          ) : null
        }
        actions={canReadDocuments ? (
          <Link
            href="/documents"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Download className="size-4" aria-hidden />
            Deschide downloadurile securizate
          </Link>
        ) : null}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted">Fișiere disponibile</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {available.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted">În procesare</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {processing.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted">Blocate de securitate</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {quarantined.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {sections.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Card key={section.href}>
              <CardContent className="flex h-full flex-col p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <section.icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-ink">
                  {section.title}
                </h2>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">
                  {section.description}
                </p>
                <Link
                  href={section.href}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-brand hover:underline"
                >
                  {section.count}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Archive}
          title="Acces limitat la arhivă"
          description="Rolul curent nu include alte categorii de evidențe."
        />
      )}
    </div>
  );
}
