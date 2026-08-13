"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Flower2,
  GitCompareArrows,
  ImagePlus,
  Lamp,
  Leaf,
  Palette,
  Wand2,
  Save,
  Trash2,
} from "lucide-react";
import type { WorkspaceCreativeState } from "@weddingos/contracts";
import { cn, formatRON } from "@/lib/utils";
import { useWorkspace } from "@/lib/api/workspace-context";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  ErrorState,
  Modal,
  PageHeader,
  Progress,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

const palette = [
  { name: "Verde salvie", hex: "#91A899" },
  { name: "Ivoriu cald", hex: "#F7F4EE" },
  { name: "Cupru mat", hex: "#B4774B" },
  { name: "Verde pin închis", hex: "#21483A" },
  { name: "Șampanie", hex: "#D9B98A" },
];

const boards = [
  {
    id: "mb-1",
    name: "Grădină de seară",
    items: 34,
    updated: "ieri",
    main: true,
  },
  {
    id: "mb-2",
    name: "Ceremonie — arc & alei",
    items: 18,
    updated: "acum 3 zile",
    main: false,
  },
  {
    id: "mb-3",
    name: "Mese & lumini",
    items: 22,
    updated: "săptămâna trecută",
    main: false,
  },
];

const briefs = [
  {
    id: "br-1",
    title: "Brief florar",
    status: "Trimis",
    to: "Atelier Floral Iris",
    icon: Flower2,
  },
  {
    id: "br-2",
    title: "Brief decorator / iluminat",
    status: "Ciornă",
    to: "Lumina Events",
    icon: Lamp,
  },
];

export default function DesignStudioPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [aiOpen, setAiOpen] = React.useState(false);
  const [briefOpen, setBriefOpen] = React.useState<string | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  if (!demoMode) {
    return currentWorkspace ? (
      <ConnectedDesignStudio
        workspaceId={currentWorkspace.id}
        canWrite={
          bootstrap?.membership.capabilities.includes("invitation.write") ??
          false
        }
      />
    ) : null;
  }

  const copyHex = (hex: string, name: string) => {
    navigator.clipboard?.writeText(hex).catch(() => undefined);
    setCopied(hex);
    toast({ title: `${name} copiat`, description: hex, variant: "success" });
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Studio de design"
        description="Identitatea vizuală a evenimentului — de la paletă la materialele trimise furnizorilor."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Încărcare inspirație",
                  description:
                    "Până la 10 imagini — Copilotul extrage automat paleta.",
                  variant: "info",
                })
              }
            >
              <ImagePlus className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Inspirație</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompareOpen(true)}
            >
              <GitCompareArrows className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Compară stiluri</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAiOpen(true)}
            >
              <Wand2 className="size-3.5 text-accent" aria-hidden />
              Generează concept
            </Button>
            <Button size="sm" onClick={() => router.push("/moodboards")}>
              <Palette className="size-4" aria-hidden />
              Moodboard nou
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main concept */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Conceptul principal</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted">
                Aprobat de voi doi pe 10 iulie
              </p>
            </div>
            <Badge variant="success" dot>
              Stabilit
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-xl bg-gradient-to-br from-brand to-sage p-6 text-on-brand">
              <p className="flex items-center gap-2 font-brand text-2xl font-semibold tracking-tight">
                <Leaf className="size-6" aria-hidden />
                Grădină de seară elegantă
              </p>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-on-brand/85">
                Natură întâlnește rafinamentul: verde salvie și frunze
                proaspete, accente de cupru mat, lumini calde în copaci, textile
                naturale (in, iută fină) și flori de sezon în tonuri de șampanie
                și ivoriu.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["grădină", "romantic", "elegant", "cald", "natural"].map(
                  (t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium"
                    >
                      {t}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Palette */}
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Paleta de culori
            </p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {palette.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => copyHex(c.hex, c.name)}
                  className="group cursor-pointer text-left"
                  aria-label={`Copiază ${c.name} ${c.hex}`}
                >
                  <span
                    className="block h-14 rounded-lg border border-line transition-transform group-hover:scale-[1.03]"
                    style={{ backgroundColor: c.hex }}
                    aria-hidden
                  />
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                    {copied === c.hex ? (
                      <Check className="size-3 text-success" aria-hidden />
                    ) : (
                      <Copy className="size-3 text-faint" aria-hidden />
                    )}
                    {c.name}
                  </span>
                  <span className="block text-[10px] text-faint">{c.hex}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Budget alignment */}
        <Card>
          <CardHeader>
            <CardTitle>Aliniere cu bugetul</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[13px] text-muted">
              Decor & flori: estimare curentă vs. concept
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink tabular-nums">
              {formatRON(17_500)}
            </p>
            <p className="text-xs text-faint">
              alocat: {formatRON(16_000)} · depășire {formatRON(1_500)}
            </p>
            <Progress
              value={17_500}
              max={16_000}
              tone="warning"
              className="mt-3"
              aria-label="Depășire buget decor"
            />
            <div className="mt-4 rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-[13px] leading-relaxed text-muted dark:bg-accent-soft/20">
              <span className="font-semibold text-ink">Copilot:</span>{" "}
              ghirlandele în copaci (+2.100 lei) sunt principala depășire.
              Varianta cu lumini doar pe alei reduce costul sub buget.
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => router.push("/budget")}
            >
              Ajustează în buget
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Boards + briefs */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Moodboarduri salvate</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push("/moodboards")}
            >
              Vezi toate
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-line">
              {boards.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => router.push("/moodboards")}
                    className="flex w-full cursor-pointer items-center gap-3 py-3 text-left transition-colors hover:bg-subtle/50"
                  >
                    <span className="grid size-12 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
                      {[
                        "var(--sage)",
                        "var(--sand)",
                        "var(--accent)",
                        "var(--brand)",
                      ].map((c, i) => (
                        <span
                          key={i}
                          style={{ backgroundColor: c }}
                          aria-hidden
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        {b.name}
                        {b.main && <Badge variant="brand">principal</Badge>}
                      </span>
                      <span className="text-xs text-faint">
                        {b.items} elemente · actualizat {b.updated}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brief-uri pentru furnizori</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-line">
              {briefs.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:text-brand">
                    <b.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{b.title}</p>
                    <p className="text-xs text-faint">{b.to}</p>
                  </div>
                  <Badge
                    variant={b.status === "Trimis" ? "success" : "warning"}
                    dot
                  >
                    {b.status}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => setBriefOpen(b.title)}
                  >
                    {b.status === "Trimis" ? "Vezi" : "Editează"}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBriefOpen("Brief florar")}
              >
                <Flower2 className="size-3.5" aria-hidden /> Brief florar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBriefOpen("Brief decorator")}
              >
                <Lamp className="size-3.5" aria-hidden /> Brief decorator
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI concept modal */}
      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="Concept generat de AI"
        description="Pe baza stilurilor alese: grădină, romantic, elegant"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>
              Renunță
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast({ title: "Variantă nouă generată", variant: "info" })
              }
            >
              Altă variantă
            </Button>
            <Button
              onClick={() => {
                setAiOpen(false);
                toast({
                  title: "Concept aplicat",
                  description: "Paleta și brief-urile au fost actualizate.",
                  variant: "success",
                });
              }}
            >
              Aplică conceptul
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <p className="font-display text-lg font-semibold text-ink">
              „Seră de vară în grădina conacului”
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Un fir narativ coerent: invitații încep seara sub copaci iluminați
              cald, mesele lungi din lemn deschis cu căi de in spălat,
              aranjamente florale joase (bujori șampanie, eucalipt, trandafiri
              de grădină), detalii din cupru mat la meniuri și numere de masă.
              Tort: crem de vanilie cu flori naturale.
            </p>
          </div>
          <div className="flex gap-2">
            {["#21483A", "#91A899", "#F7F4EE", "#B4774B", "#D9B98A"].map(
              (c) => (
                <span
                  key={c}
                  className="h-10 flex-1 rounded-lg border border-line"
                  style={{ backgroundColor: c }}
                  aria-hidden
                />
              ),
            )}
          </div>
          <p className="text-xs text-faint">
            Estimare Copilot pentru acest concept: 15.800–17.200 lei (decor +
            flori + iluminat).
          </p>
        </div>
      </Modal>

      {/* Brief modal */}
      <Modal
        open={!!briefOpen}
        onClose={() => setBriefOpen(null)}
        title={briefOpen ?? ""}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBriefOpen(null)}>
              Închide
            </Button>
            <Button
              onClick={() => {
                setBriefOpen(null);
                toast({
                  title: "Brief trimis furnizorului",
                  variant: "success",
                });
              }}
            >
              Trimite brief-ul
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Către">
            <Select>
              <option>Atelier Floral Iris</option>
              <option>Blooming Days</option>
              <option>Lumina Events</option>
            </Select>
          </Field>
          <Field label="Conținutul brief-ului">
            <Textarea
              className="min-h-[180px]"
              defaultValue={
                "Context: nuntă în grădină, 160 invitați, 12 septembrie 2027.\nConcept: grădină de seară elegantă — salvie, ivoriu, cupru mat.\nCerințe: arc ceremonial, 12 aranjamente mese joase, buchet mireasă (bujori șampanie), cocarde.\nConstrângeri: flori de sezon, fără floral foam, montaj până la 14:00.\nBuget orientativ: 13.000–15.000 lei."
              }
            />
          </Field>
        </div>
      </Modal>

      {/* Compare styles */}
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Compară stilurile"
        size="lg"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              name: "Grădină de seară",
              cost: "16–18k",
              feel: "cald, natural",
              current: true,
            },
            {
              name: "Editorial modern",
              cost: "14–16k",
              feel: "grafic, sobru",
              current: false,
            },
            {
              name: "Clasic opulent",
              cost: "22–28k",
              feel: "grandios, formal",
              current: false,
            },
          ].map((s) => (
            <div
              key={s.name}
              className={cn(
                "rounded-xl border p-4",
                s.current ? "border-brand bg-brand-softer/50" : "border-line",
              )}
            >
              <p className="font-brand text-[15px] font-semibold text-ink">
                {s.name}
              </p>
              <p className="mt-1 text-xs text-muted">Decor estimat: {s.cost}</p>
              <p className="text-xs text-muted">Atmosferă: {s.feel}</p>
              {s.current ? (
                <Badge variant="brand" className="mt-3">
                  Concept curent
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-7 px-2.5 text-xs"
                  onClick={() => {
                    setCompareOpen(false);
                    toast({
                      title: `Stilul „${s.name}” aplicat ca draft`,
                      variant: "info",
                    });
                  }}
                >
                  Încearcă
                </Button>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function ConnectedDesignStudio({
  workspaceId,
  canWrite,
}: {
  workspaceId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = React.useState<WorkspaceCreativeState | null>(null);
  const [draft, setDraft] = React.useState<WorkspaceCreativeState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const value = await weddingOsApi.creativeState(workspaceId);
      setState(value);
      setDraft(value);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async () => {
    if (!canWrite || !draft || !state) return;
    setSaving(true);
    try {
      const value = await weddingOsApi.updateCreativeState(
        workspaceId,
        state.version,
        {
          conceptTitle: draft.conceptTitle,
          conceptDescription: draft.conceptDescription,
          palette: draft.palette,
          boards: draft.boards,
        },
      );
      setState(value);
      setDraft(value);
      toast({
        title: "Concept salvat",
        description:
          "Paleta și direcția creativă sunt persistente în spațiul vostru.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Conceptul nu a fost salvat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (error)
    return (
      <ErrorState
        title="Studio-ul nu poate fi încărcat"
        description={error}
        onRetry={() => void load()}
      />
    );
  if (loading || !draft || !state)
    return <div className="h-72 animate-pulse rounded-xl bg-subtle" />;

  const itemCount = draft.boards.reduce(
    (total, board) => total + board.items.length,
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Studio de design"
        description="Direcția creativă reală a evenimentului, folosită împreună cu moodboardurile și invitația."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={state.version > 0 ? "success" : "neutral"}>
              {state.version > 0
                ? `salvat · v${state.version}`
                : "neconfigurat"}
            </Badge>
            {!canWrite ? <Badge variant="neutral">doar citire</Badge> : null}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => router.push("/moodboards")}
            >
              <Palette className="size-4" aria-hidden />
              Moodboarduri
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/invitations/editor")}
            >
              <Wand2 className="size-4" aria-hidden />
              Aplică în invitație
            </Button>
            <Button
              disabled={!canWrite || saving}
              onClick={() => void save()}
            >
              <Save className="size-4" aria-hidden />
              {saving ? "Se salvează…" : "Salvează conceptul"}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Direcția principală</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Numele conceptului" htmlFor="creative-concept-title">
              <Input
                id="creative-concept-title"
                maxLength={180}
                disabled={!canWrite}
                value={draft.conceptTitle}
                placeholder="Ex. Grădină de seară elegantă"
                onChange={(event) =>
                  setDraft({ ...draft, conceptTitle: event.target.value })
                }
              />
            </Field>
            <Field
              label="Descrierea direcției"
              htmlFor="creative-concept-description"
              hint={`${draft.conceptDescription.length}/4000`}
            >
              <Textarea
                id="creative-concept-description"
                rows={8}
                maxLength={4000}
                disabled={!canWrite}
                value={draft.conceptDescription}
                placeholder="Materiale, atmosferă, lumină, flori și orice regulă vizuală importantă…"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    conceptDescription: event.target.value,
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Legături creative</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-subtle p-4">
              <p className="font-semibold text-ink">
                {draft.boards.length} moodboarduri · {itemCount} repere
              </p>
              <p className="mt-1 text-muted">
                Imaginile, notițele, culorile și furnizorii sunt păstrați în
                backend.
              </p>
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => router.push("/moodboards")}
            >
              Deschide moodboardurile
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => router.push("/invitations/editor")}
            >
              Deschide editorul invitației
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Paleta de culori</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Culorile sunt valori reale și pot fi copiate direct în editorul
              invitației.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!canWrite || draft.palette.length >= 20}
            onClick={() =>
              setDraft({
                ...draft,
                palette: [
                  ...draft.palette,
                  {
                    id: crypto.randomUUID(),
                    name: "Culoare nouă",
                    hex: "#6F4B73",
                  },
                ],
              })
            }
          >
            <Palette className="size-4" aria-hidden />
            Adaugă o culoare
          </Button>
        </CardHeader>
        <CardContent>
          {draft.palette.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {draft.palette.map((color, index) => (
                <div
                  key={color.id}
                  className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border border-line p-3"
                >
                  <input
                    aria-label={`Culoarea ${color.name}`}
                    className="size-12 cursor-pointer rounded-lg border border-line bg-transparent p-1"
                    type="color"
                    disabled={!canWrite}
                    value={color.hex}
                    onChange={(event) => {
                      const palette = [...draft.palette];
                      palette[index] = {
                        ...color,
                        hex: event.target.value.toUpperCase(),
                      };
                      setDraft({ ...draft, palette });
                    }}
                  />
                  <div className="min-w-0 space-y-1">
                    <Input
                      aria-label={`Numele culorii ${index + 1}`}
                      value={color.name}
                      disabled={!canWrite}
                      maxLength={80}
                      onChange={(event) => {
                        const palette = [...draft.palette];
                        palette[index] = { ...color, name: event.target.value };
                        setDraft({ ...draft, palette });
                      }}
                    />
                    <p className="text-xs font-medium text-muted">
                      {color.hex}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Șterge culoarea ${color.name}`}
                    disabled={!canWrite}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        palette: draft.palette.filter(
                          (entry) => entry.id !== color.id,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nu ai adăugat încă nicio culoare. Pornește cu nuanțele pe care
              vrei să le păstrezi consecvent.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
