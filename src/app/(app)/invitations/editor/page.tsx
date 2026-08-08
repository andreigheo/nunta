"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarHeart,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Heart,
  Images,
  Info,
  LayoutTemplate,
  MapPin,
  Maximize2,
  Monitor,
  Music,
  Pencil,
  Plus,
  Redo2,
  Shirt,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  UtensilsCrossed,
  BedDouble,
  Bus,
  Gift,
  MessageCircleQuestion,
  Save,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import type { InvitationSiteResource } from "@weddingos/contracts";
import { Badge, Button, ConfirmDialog, Modal, SegmentedControl, Tooltip, useToast } from "@/components/ui";

interface Section {
  id: string;
  type: string;
  label: string;
  icon: React.ElementType;
  visible: boolean;
}

const initialSections: Section[] = [
  { id: "s-1", type: "header", label: "Antet", icon: LayoutTemplate, visible: true },
  { id: "s-2", type: "story", label: "Povestea cuplului", icon: Heart, visible: true },
  { id: "s-3", type: "countdown", label: "Numărătoare inversă", icon: Clock, visible: true },
  { id: "s-4", type: "schedule", label: "Program", icon: CalendarHeart, visible: true },
  { id: "s-5", type: "locations", label: "Locații", icon: MapPin, visible: true },
  { id: "s-6", type: "rsvp", label: "RSVP", icon: Pencil, visible: true },
  { id: "s-7", type: "dresscode", label: "Dress code", icon: Shirt, visible: true },
  { id: "s-8", type: "transport", label: "Transport", icon: Bus, visible: false },
  { id: "s-9", type: "accommodation", label: "Cazare", icon: BedDouble, visible: false },
  { id: "s-10", type: "gallery", label: "Galerie", icon: Images, visible: true },
  { id: "s-11", type: "faq", label: "Întrebări frecvente", icon: MessageCircleQuestion, visible: true },
  { id: "s-12", type: "registry", label: "Liste cadouri", icon: Gift, visible: false },
];

const addable = [
  { type: "menu", label: "Meniu", icon: UtensilsCrossed },
  { type: "music", label: "Muzică", icon: Music },
  { type: "contact", label: "Contact", icon: Info },
  { type: "custom", label: "Secțiune personalizată", icon: Plus },
];

const templates = [
  { id: "garden", name: "Grădină de seară", accent: "#21483A", bg: "bg-brand-softer" },
  { id: "editorial", name: "Editorial", accent: "#20211F", bg: "bg-subtle" },
  { id: "minimal", name: "Minimal", accent: "#91A899", bg: "bg-sage-soft" },
  { id: "classic", name: "Tradițional", accent: "#B4774B", bg: "bg-accent-soft" },
];

export default function InvitationEditorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [sections, setSections] = React.useState<Section[]>(initialSections);
  const [history, setHistory] = React.useState<Section[][]>([]);
  const [future, setFuture] = React.useState<Section[][]>([]);
  const [device, setDevice] = React.useState<"desktop" | "tablet" | "mobile">("desktop");
  const [template, setTemplate] = React.useState(templates[0]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [site, setSite] = React.useState<InvitationSiteResource | null>(null);
  const [saving, setSaving] = React.useState(false);
  const canWrite = bootstrap?.membership.capabilities.includes("invitation.write") ?? false;
  const canPublish = bootstrap?.membership.capabilities.includes("invitation.publish") ?? false;

  React.useEffect(() => {
    if (!currentWorkspace || demoMode) return;
    void weddingOsApi.invitationSite(currentWorkspace.id).then((value) => {
      setSite(value);
      const persisted = value?.draft?.document.sections;
      if (persisted?.length) {
        setSections(persisted.map((item, index) => sectionFromDocument(item, index)));
        const persistedTemplate = value?.draft?.settings.template;
        const selectedTemplate = templates.find((item) => item.id === persistedTemplate);
        if (selectedTemplate) setTemplate(selectedTemplate);
      }
    }).catch((caught) => toast({ title: "Ciorna nu a putut fi încărcată", description: apiErrorMessage(caught), variant: "error" }));
  }, [currentWorkspace, demoMode, toast]);

  const saveDraft = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return site;
    setSaving(true);
    try {
      const updated = await weddingOsApi.saveInvitationDraft(currentWorkspace.id, site?.version ?? null, {
        slug: site?.slug ?? invitationSlug(currentWorkspace.title, currentWorkspace.id),
        defaultLanguage: site?.defaultLanguage ?? "ro",
        availableLanguages: site?.availableLanguages ?? ["ro"],
        accessPolicy: site?.accessPolicy === "token_or_access_code" ? "TOKEN_OR_ACCESS_CODE" : "TOKEN_ONLY",
        document: { sections: sections.map((section) => ({ id: section.id, type: documentType(section.type), title: section.label, visible: section.visible, content: { label: section.label } })) },
        settings: { colors: { accent: template.accent }, typography: {}, spacing: "comfortable", template: template.id },
      });
      setSite(updated); setDirty(false); toast({ title: "Ciornă salvată", description: `Versiunea ${updated.draft?.versionNumber ?? "nouă"} este persistentă.`, variant: "success" }); return updated;
    } catch (caught) { toast({ title: "Ciorna nu a fost salvată", description: apiErrorMessage(caught), variant: "error" }); return null; }
    finally { setSaving(false); }
  }, [currentWorkspace, demoMode, site, sections, template, toast]);

  const publish = async () => {
    if (!currentWorkspace || demoMode) return;
    const latest = dirty || !site?.draft ? await saveDraft() : site;
    if (!latest) return;
    setSaving(true);
    try { const published = await weddingOsApi.publishInvitation(currentWorkspace.id, latest.version); setSite(published); setPublishOpen(false); toast({ title: "Invitația a fost publicată", description: "Versiunea validată este vizibilă numai destinatarilor autorizați.", variant: "success" }); }
    catch (caught) { toast({ title: "Publicarea a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const commit = (next: Section[]) => {
    setHistory((h) => [...h.slice(-19), sections]);
    setFuture([]);
    setSections(next);
    setDirty(true);
  };

  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [sections, ...f]);
    setSections(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, sections]);
    setSections(future[0]);
    setFuture((f) => f.slice(1));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    commit(next);
  };

  const patch = (id: string, p: Partial<Section>) =>
    commit(sections.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const remove = (id: string) => {
    commit(sections.filter((s) => s.id !== id));
    toast({ title: "Secțiune ștearsă", action: { label: "Anulează", onClick: undo } });
  };

  const duplicate = (id: string) => {
    const idx = sections.findIndex((s) => s.id === id);
    const copy = { ...sections[idx], id: `s-${Date.now()}` };
    commit([...sections.slice(0, idx + 1), copy, ...sections.slice(idx + 1)]);
  };

  const widths = { desktop: "max-w-2xl", tablet: "max-w-md", mobile: "max-w-[300px]" };

  return (
    <div className="-mx-4 -mt-5 flex h-[calc(100dvh-4rem)] flex-col sm:-mx-6">
      {/* Editor toolbar */}
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/invitations")}>
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Invitații</span>
        </Button>
        <span className="hidden items-center gap-2 text-sm text-muted md:flex">
          Editor invitație {dirty && <Badge variant="warning" dot>Nesalvat</Badge>}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip content="Anulează"><span>
            <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!history.length} aria-label="Anulează"><Undo2 className="size-4" aria-hidden /></Button>
          </span></Tooltip>
          <Tooltip content="Refă"><span>
            <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!future.length} aria-label="Refă"><Redo2 className="size-4" aria-hidden /></Button>
          </span></Tooltip>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(true)}>
            <LayoutTemplate className="size-3.5" aria-hidden />
            <span className="hidden lg:inline">Șablon</span>
          </Button>
          <Button variant="ghost" size="sm" disabled title="Planificat pentru un slice ulterior; nu există succes simulat.">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            <span className="hidden lg:inline">Scrie cu AI</span>
          </Button>
          <Button variant="outline" size="sm" disabled={!canWrite || demoMode || saving} onClick={() => void saveDraft()}>
            <Save className="size-3.5" aria-hidden />
            Salvează
          </Button>
          <Button size="sm" disabled={!canPublish || demoMode || saving} onClick={() => setPublishOpen(true)}>Publică</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: sections */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
          <p className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Secțiuni</p>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <div
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] transition-colors",
                    selected === s.id ? "bg-brand-soft dark:bg-brand-softer" : "hover:bg-subtle",
                  )}
                >
                  <button onClick={() => setSelected(s.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                    <s.icon className={cn("size-4 shrink-0", s.visible ? "text-brand-strong dark:text-brand" : "text-faint")} aria-hidden />
                    <span className={cn("truncate font-medium", s.visible ? "text-ink" : "text-faint line-through")}>{s.label}</span>
                  </button>
                  <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Mută sus" className="cursor-pointer p-0.5 text-faint hover:text-ink disabled:opacity-30"><ChevronUp className="size-3.5" aria-hidden /></button>
                    <button onClick={() => move(s.id, 1)} disabled={i === sections.length - 1} aria-label="Mută jos" className="cursor-pointer p-0.5 text-faint hover:text-ink disabled:opacity-30"><ChevronDown className="size-3.5" aria-hidden /></button>
                    <button onClick={() => patch(s.id, { visible: !s.visible })} aria-label={s.visible ? "Ascunde" : "Afișează"} className="cursor-pointer p-0.5 text-faint hover:text-ink">
                      {s.visible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                    </button>
                    <button onClick={() => duplicate(s.id)} aria-label="Duplică" className="cursor-pointer p-0.5 text-faint hover:text-ink"><Copy className="size-3.5" aria-hidden /></button>
                    <button onClick={() => remove(s.id)} aria-label="Șterge" className="cursor-pointer p-0.5 text-faint hover:text-danger"><Trash2 className="size-3.5" aria-hidden /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-2">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Adaugă</p>
            <div className="grid grid-cols-2 gap-1">
              {addable.map((a) => (
                <button
                  key={a.type}
                  onClick={() => commit([...sections, { id: `s-${Date.now()}`, type: a.type, label: a.label, icon: a.icon, visible: true }])}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-muted transition-colors hover:bg-subtle hover:text-ink"
                >
                  <a.icon className="size-3.5" aria-hidden />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: canvas */}
        <div className="flex min-w-0 flex-1 flex-col bg-subtle/50">
          <div className="flex items-center justify-center gap-2 border-b border-line bg-surface px-3 py-2">
            <SegmentedControl
              ariaLabel="Dispozitiv previzualizare"
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "Desktop", icon: <Monitor className="size-3.5" /> },
                { value: "tablet", label: "Tabletă", icon: <Tablet className="size-3.5" /> },
                { value: "mobile", label: "Mobil", icon: <Smartphone className="size-3.5" /> },
              ]}
              size="sm"
            />
            <Button variant="ghost" size="icon-sm" aria-label="Tot ecranul" onClick={() => router.push("/guest")}>
              <Maximize2 className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
            <div className={cn("mx-auto overflow-hidden rounded-xl border border-line bg-surface shadow-pop transition-all", widths[device])}>
              {sections.filter((s) => s.visible).map((s) => (
                <PreviewSection key={s.id} type={s.type} template={template} selected={selected === s.id} onSelect={() => setSelected(s.id)} />
              ))}
              {sections.every((s) => !s.visible) && (
                <p className="p-10 text-center text-sm text-faint">Toate secțiunile sunt ascunse.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: design settings */}
        <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-4 lg:flex">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Culoare de accent</p>
            <div className="mt-2 flex gap-2">
              {["#21483A", "#B4774B", "#91A899", "#20211F", "#8a5a83"].map((c) => (
                <button
                  key={c}
                  onClick={() => { setTemplate({ ...template, accent: c }); setDirty(true); }}
                  aria-label={`Accent ${c}`}
                  className={cn("size-8 cursor-pointer rounded-full border-2 transition-transform hover:scale-110", template.accent === c ? "border-ink" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Tipografie</p>
            <select
              className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm text-ink"
              defaultValue="fraunces"
              onChange={() => setDirty(true)}
              aria-label="Familia de fonturi"
            >
              <option value="fraunces">Fraunces — editorial</option>
              <option value="classic">Cormorant — clasic</option>
              <option value="moderna">Inter — modern</option>
            </select>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Spațiere secțiuni</p>
            <input type="range" min={0} max={100} defaultValue={55} className="mt-3 w-full accent-[var(--brand)]" aria-label="Spațiere" onChange={() => setDirty(true)} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Fundal</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {["Uni", "Textură", "Foto"].map((b) => (
                <button key={b} onClick={() => setDirty(true)} className="cursor-pointer rounded-lg border border-line px-2 py-1.5 text-xs text-muted transition-colors hover:border-brand hover:text-ink">
                  {b}
                </button>
              ))}
            </div>
          </div>
          {[
            ["Imagine de copertă", "Înlocuiește"],
            ["Video de fundal", "Adaugă"],
            ["Muzică de fond", "Oprit"],
            ["Animații la derulare", "Pornit"],
          ].map(([label, action]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted">{label}</span>
              <button onClick={() => { setDirty(true); toast({ title: label, description: "Setarea a fost actualizată.", variant: "success" }); }} className="cursor-pointer text-[13px] font-medium text-brand hover:underline">
                {action}
              </button>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Limbă</p>
            <select className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm text-ink" defaultValue="ro" aria-label="Limba invitației">
              <option value="ro">Română</option>
              <option value="en">Engleză</option>
              <option value="both">Română + Engleză</option>
            </select>
          </div>
        </aside>
      </div>

      {/* Template modal */}
      <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="Alege șablonul" size="lg">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTemplate(t); setDirty(true); setTemplateOpen(false); }}
              className={cn(
                "cursor-pointer overflow-hidden rounded-xl border-2 text-left transition-all",
                template.id === t.id ? "border-brand shadow-pop" : "border-line hover:border-line-strong",
              )}
            >
              <div className={cn("flex h-24 items-center justify-center", t.bg)}>
                <span className="font-display text-lg font-semibold" style={{ color: t.accent }}>A&M</span>
              </div>
              <p className="px-3 py-2 text-[13px] font-medium text-ink">{t.name}</p>
            </button>
          ))}
        </div>
      </Modal>

      {/* AI writer modal */}
      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="Scrie cu AI"
        description="Text generat în tonul nunții voastre — grădină, elegant, cald"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>Renunță</Button>
            <Button variant="outline" onClick={() => toast({ title: "Variantă nouă generată", variant: "info" })}>Regenerează</Button>
            <Button onClick={() => { setAiOpen(false); setDirty(true); toast({ title: "Text aplicat în invitație", variant: "success" }); }}>
              Folosește textul
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-subtle/50 p-4 font-display text-[15px] leading-relaxed text-ink">
          <p className="italic">„Ne-am cunoscut într-o seară de septembrie, la Brașov — și tot în septembrie am ales să spunem «da».</p>
          <p className="mt-3 italic">Vă invităm să ne fiți alături pe 12 septembrie 2027, în grădina Conacului Ambient din Cristian, pentru o zi despre care sperăm să povestim la fel de mult ca voi: cu muzică bună, mâncare aleasă cu grijă și oameni dragi.”</p>
        </div>
        <p className="mt-3 text-xs text-faint">Copilotul a folosit: stilul ales (grădină, elegant), orașul și povestea din profilul vostru.</p>
      </Modal>

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
        title="Publici modificările?"
        description="Versiunea curentă devine imediat vizibilă pentru invitați."
        confirmLabel="Publică"
      />
    </div>
  );
}

type InvitationDocumentType = "hero" | "story" | "countdown" | "schedule" | "locations" | "rsvp" | "dress_code" | "transport" | "accommodation" | "faq" | "contact" | "registry" | "custom";

function documentType(type: string): InvitationDocumentType {
  const mapped: Record<string, InvitationDocumentType> = {
    header: "hero", story: "story", countdown: "countdown", schedule: "schedule",
    locations: "locations", rsvp: "rsvp", dresscode: "dress_code", transport: "transport",
    accommodation: "accommodation", faq: "faq", contact: "contact", registry: "registry",
  };
  return mapped[type] ?? "custom";
}

function sectionFromDocument(item: { id: string; type: string; title?: string; visible: boolean }, index: number): Section {
  const editorType: Record<string, string> = { hero: "header", dress_code: "dresscode" };
  const type = editorType[item.type] ?? item.type;
  const known = [...initialSections, ...addable].find((section) => section.type === type);
  return { id: item.id || `section-${index + 1}`, type, label: item.title || known?.label || "Secțiune", icon: known?.icon ?? Plus, visible: item.visible };
}

function invitationSlug(title: string, workspaceId: string) {
  const base = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "nunta";
  return `${base}-${workspaceId.slice(0, 8)}`;
}

function PreviewSection({
  type,
  template,
  selected,
  onSelect,
}: {
  type: string;
  template: { accent: string; bg: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const content: Record<string, React.ReactNode> = {
    header: (
      <div className={cn("px-6 py-10 text-center", template.bg)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-faint">Ne căsătorim</p>
        <p className="mt-2 font-display text-3xl font-semibold tracking-tight" style={{ color: template.accent }}>Ana & Mihai</p>
        <p className="mt-1.5 text-xs text-muted">12 Septembrie 2027 · Conacul Ambient, Cristian</p>
        <div className="mx-auto mt-3 h-px w-14" style={{ backgroundColor: template.accent }} aria-hidden />
      </div>
    ),
    story: (
      <div className="px-6 py-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">Povestea noastră</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] italic leading-relaxed text-muted">
          Ne-am cunoscut într-o seară de septembrie la Brașov — și tot în septembrie am ales să spunem „da”.
        </p>
      </div>
    ),
    countdown: (
      <div className="grid grid-cols-4 divide-x divide-line bg-subtle/50 py-4 text-center">
        {[["422", "zile"], ["07", "ore"], ["31", "min"], ["52", "sec"]].map(([v, l]) => (
          <div key={l}><p className="text-lg font-semibold tabular-nums" style={{ color: template.accent }}>{v}</p><p className="text-[10px] uppercase text-faint">{l}</p></div>
        ))}
      </div>
    ),
    schedule: (
      <div className="px-6 py-6">
        <p className="text-center font-display text-lg font-semibold text-ink">Programul zilei</p>
        <ul className="mx-auto mt-3 max-w-sm space-y-2">
          {[["16:00", "Cununia religioasă"], ["17:30", "Cocktail în grădină"], ["18:00", "Petrecerea"], ["22:00", "Tortul"], ["02:00", "Ultimul dans"]].map(([t, l]) => (
            <li key={t} className="flex items-baseline gap-3 text-[13px]">
              <span className="w-12 shrink-0 font-semibold tabular-nums" style={{ color: template.accent }}>{t}</span>
              <span className="text-muted">{l}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
    locations: (
      <div className="grid grid-cols-2 gap-2 px-6 py-6">
        {["Biserica Sf. Nicolae, Brașov", "Conacul Ambient, Cristian"].map((l) => (
          <div key={l} className="rounded-lg border border-line p-3 text-center">
            <MapPin className="mx-auto size-4 text-faint" aria-hidden />
            <p className="mt-1.5 text-xs font-medium text-ink">{l}</p>
          </div>
        ))}
      </div>
    ),
    rsvp: (
      <div className="px-6 py-7 text-center" style={{ backgroundColor: template.accent }}>
        <p className="font-display text-lg font-semibold text-white">Vei fi alături de noi?</p>
        <p className="mt-1 text-xs text-white/70">Te rugăm confirmă până pe 15 iunie 2027</p>
        <span className="mt-4 inline-flex h-10 items-center rounded-lg bg-white px-5 text-[13px] font-semibold" style={{ color: template.accent }}>
          Confirmă prezența
        </span>
      </div>
    ),
    dresscode: (
      <div className="px-6 py-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">Dress code: Garden Formal</p>
        <div className="mt-3 flex justify-center gap-2">
          {["#21483A", "#91A899", "#E9E1D5", "#B4774B", "#20211F"].map((c) => (
            <span key={c} className="size-6 rounded-full border border-line" style={{ backgroundColor: c }} aria-hidden />
          ))}
        </div>
      </div>
    ),
    gallery: (
      <div className="grid grid-cols-3 gap-1.5 px-6 py-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-gradient-to-br from-sage-soft to-sand" aria-hidden />
        ))}
      </div>
    ),
    faq: (
      <div className="px-6 py-6">
        <p className="text-center font-display text-lg font-semibold text-ink">Întrebări frecvente</p>
        <ul className="mx-auto mt-3 max-w-md space-y-2">
          {["Pot veni cu copiii?", "Unde parchez?", "Există cazare în zonă?"].map((q) => (
            <li key={q} className="rounded-lg bg-subtle/60 px-3 py-2 text-[13px] text-muted">{q}</li>
          ))}
        </ul>
      </div>
    ),
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        "block w-full cursor-pointer text-left transition-shadow",
        selected && "shadow-[inset_0_0_0_2px_var(--brand)]",
      )}
    >
      {content[type] ?? (
        <div className="px-6 py-6 text-center text-[13px] text-faint">Secțiune „{type}” — conținut personalizabil</div>
      )}
    </button>
  );
}
