"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  BedDouble,
  CalendarHeart,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Contact,
  Copy,
  Eye,
  EyeOff,
  Gift,
  GripVertical,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Images,
  LayoutPanelLeft,
  LayoutTemplate,
  MapPin,
  Maximize2,
  Monitor,
  Palette,
  PanelRight,
  PencilLine,
  Plus,
  Redo2,
  Save,
  SlidersHorizontal,
  Shirt,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import type { InvitationSiteResource } from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  array,
  createDefaultSection,
  createInitialSnapshot,
  invitationReadiness,
  invitationTemplates,
  sectionCatalog,
  serializeSnapshot,
  snapshotFromPersisted,
  stringArray,
  text,
  type InvitationDesign,
  type InvitationEditorSnapshot,
  type InvitationSection,
  type InvitationSectionType,
} from "@/lib/invitations/editor-model";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  ErrorState,
  Field,
  Input,
  Modal,
  Progress,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";

type Device = "desktop" | "tablet" | "mobile";
type InspectorTab = "content" | "design" | "publish";
type LeftPanelTab = "blocks" | "layers";

const icons: Record<InvitationSectionType, React.ElementType> = {
  hero: LayoutTemplate,
  story: Heart,
  countdown: Clock3,
  schedule: CalendarHeart,
  locations: MapPin,
  rsvp: PencilLine,
  dress_code: Shirt,
  gallery: Images,
  transport: Users,
  accommodation: BedDouble,
  faq: CircleHelp,
  contact: Contact,
  registry: Gift,
  custom: Plus,
};

export default function InvitationEditorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [snapshot, setSnapshot] = React.useState<InvitationEditorSnapshot>(() =>
    createInitialSnapshot(),
  );
  const [history, setHistory] = React.useState<InvitationEditorSnapshot[]>([]);
  const [future, setFuture] = React.useState<InvitationEditorSnapshot[]>([]);
  const [selectedId, setSelectedId] = React.useState("hero");
  const [device, setDevice] = React.useState<Device>("desktop");
  const [zoom, setZoom] = React.useState(90);
  const [leftPanelTab, setLeftPanelTab] =
    React.useState<LeftPanelTab>("blocks");
  const [inspectorTab, setInspectorTab] =
    React.useState<InspectorTab>("content");
  const [site, setSite] = React.useState<InvitationSiteResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [sectionsOpen, setSectionsOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [uploadingMedia, setUploadingMedia] = React.useState(false);
  const [mediaPreviews, setMediaPreviews] = React.useState<
    Record<string, string>
  >({});
  const canWrite =
    bootstrap?.membership.capabilities.includes("invitation.write") ?? false;
  const canPublish =
    bootstrap?.membership.capabilities.includes("invitation.publish") ?? false;
  const selected =
    snapshot.sections.find((section) => section.id === selectedId) ??
    snapshot.sections[0];
  const readiness = invitationReadiness(snapshot);

  React.useEffect(() => {
    if (!currentWorkspace || demoMode) {
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void weddingOsApi
      .invitationSite(currentWorkspace.id)
      .then((value) => {
        if (!active) return;
        setSite(value);
        const next = snapshotFromPersisted(
          value?.draft?.document.sections,
          value?.draft?.settings as Parameters<typeof snapshotFromPersisted>[1],
        );
        setSnapshot(next);
        setSelectedId(next.sections[0]?.id ?? "");
        setLastSavedAt(value?.draft ? new Date() : null);
      })
      .catch((caught) => {
        const message = apiErrorMessage(caught);
        setLoadError(message);
        toast({
          title: "Ciorna nu a putut fi încărcată",
          description: message,
          variant: "error",
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [currentWorkspace, demoMode, loadAttempt, toast]);

  React.useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const commit = React.useCallback(
    (next: InvitationEditorSnapshot) => {
      setHistory((current) => [...current.slice(-39), snapshot]);
      setFuture([]);
      setSnapshot(next);
      setDirty(true);
    },
    [snapshot],
  );

  const saveDraft = React.useCallback(async () => {
    if (!currentWorkspace || demoMode || !canWrite) return site;
    setSaving(true);
    try {
      const serialized = serializeSnapshot(snapshot);
      const updated = await weddingOsApi.saveInvitationDraft(
        currentWorkspace.id,
        site?.version ?? null,
        {
          slug:
            site?.slug ??
            invitationSlug(currentWorkspace.title, currentWorkspace.id),
          defaultLanguage: site?.defaultLanguage ?? "ro",
          availableLanguages: site?.availableLanguages ?? ["ro"],
          accessPolicy:
            site?.accessPolicy === "token_or_access_code"
              ? "TOKEN_OR_ACCESS_CODE"
              : "TOKEN_ONLY",
          document: serialized.document,
          settings: serialized.settings,
        },
      );
      setSite(updated);
      setDirty(false);
      setLastSavedAt(new Date());
      toast({
        title: "Ciornă salvată",
        description: `Conținutul și designul versiunii ${updated.draft?.versionNumber ?? "noi"} sunt persistente.`,
        variant: "success",
      });
      return updated;
    } catch (caught) {
      toast({
        title: "Ciorna nu a fost salvată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [canWrite, currentWorkspace, demoMode, site, snapshot, toast]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveDraft]);

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [snapshot, ...current]);
    setSnapshot(previous);
    setHistory((current) => current.slice(0, -1));
    setDirty(true);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, snapshot]);
    setSnapshot(next);
    setFuture((current) => current.slice(1));
    setDirty(true);
  };

  const updateSection = (id: string, update: Partial<InvitationSection>) => {
    commit({
      ...snapshot,
      sections: snapshot.sections.map((section) =>
        section.id === id ? { ...section, ...update } : section,
      ),
    });
  };

  const updateContent = (key: string, value: unknown) => {
    if (!selected) return;
    updateSection(selected.id, {
      content: { ...selected.content, [key]: value },
    });
  };

  const updateContentMany = (values: Record<string, unknown>) => {
    if (!selected) return;
    updateSection(selected.id, { content: { ...selected.content, ...values } });
  };

  const updateDesign = (update: Partial<InvitationDesign>) =>
    commit({ ...snapshot, design: { ...snapshot.design, ...update } });

  const moveSection = (id: string, direction: -1 | 1) => {
    const index = snapshot.sections.findIndex((section) => section.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= snapshot.sections.length) return;
    const sections = [...snapshot.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    commit({ ...snapshot, sections });
  };

  const duplicateSection = (id: string) => {
    const index = snapshot.sections.findIndex((section) => section.id === id);
    if (index < 0) return;
    const source = snapshot.sections[index];
    const copy: InvitationSection = {
      ...source,
      id: `section-${Date.now()}`,
      label: `${source.label} — copie`,
      content: structuredClone(source.content),
      style: { ...source.style },
    };
    const sections = [...snapshot.sections];
    sections.splice(index + 1, 0, copy);
    commit({ ...snapshot, sections });
    setSelectedId(copy.id);
  };

  const removeSection = (id: string) => {
    if (snapshot.sections.length === 1) {
      toast({ title: "Păstrează cel puțin o secțiune", variant: "warning" });
      return;
    }
    const index = snapshot.sections.findIndex((section) => section.id === id);
    const sections = snapshot.sections.filter((section) => section.id !== id);
    commit({ ...snapshot, sections });
    setSelectedId(
      sections[Math.max(0, index - 1)]?.id ?? sections[0]?.id ?? "",
    );
  };

  const addSection = (type: InvitationSectionType) => {
    const section = createDefaultSection(type);
    commit({ ...snapshot, sections: [...snapshot.sections, section] });
    setSelectedId(section.id);
    setInspectorTab("content");
    setAddOpen(false);
    if (window.innerWidth < 1024) setInspectorOpen(true);
  };

  const uploadInvitationImage = async (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => {
    if (!currentWorkspace || demoMode || !canWrite) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Format neacceptat",
        description: "Folosește o imagine JPEG, PNG sau WebP.",
        variant: "error",
      });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Imagine prea mare",
        description: "Limita pentru o imagine este 20 MB.",
        variant: "error",
      });
      return;
    }
    setUploadingMedia(true);
    try {
      const bytes = await file.arrayBuffer();
      const checksum = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const session = await weddingOsApi.createUploadSession(
        currentWorkspace.id,
        {
          purpose: "INVITATION_MEDIA",
          originalFileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksumSha256: checksum,
        },
      );
      await weddingOsApi.putSignedUpload(
        session.upload.url,
        file,
        session.upload.headers,
      );
      const completed = await weddingOsApi.completeUploadSession(
        session.id,
        checksum,
      );
      const mediaId = String(completed.storageObjectId ?? "");
      if (!mediaId)
        throw new Error("Storage-ul nu a returnat identificatorul imaginii.");
      const previewUrl = URL.createObjectURL(file);
      setMediaPreviews((current) => ({ ...current, [mediaId]: previewUrl }));
      apply(mediaId, file.name);
      toast({
        title: "Imagine adăugată",
        description:
          "Este vizibilă imediat și se verifică în fundal înainte de publicare.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Imaginea nu a fost încărcată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setUploadingMedia(false);
    }
  };

  const resolveMedia = React.useCallback(
    (mediaId: string, externalUrl = "") => {
      if (mediaId && mediaPreviews[mediaId]) return mediaPreviews[mediaId];
      if (mediaId && currentWorkspace)
        return `/api/v1/workspaces/${encodeURIComponent(currentWorkspace.id)}/invitation-media/${encodeURIComponent(mediaId)}`;
      return safeImageUrl(externalUrl);
    },
    [currentWorkspace, mediaPreviews],
  );

  const publish = async () => {
    if (!currentWorkspace || demoMode || !canPublish) return;
    const latest = dirty || !site?.draft ? await saveDraft() : site;
    if (!latest) return;
    setSaving(true);
    try {
      const published = await weddingOsApi.publishInvitation(
        currentWorkspace.id,
        latest.version,
      );
      setSite(published);
      setPublishOpen(false);
      toast({
        title: "Invitația a fost publicată",
        description:
          "Versiunea completă este vizibilă destinatarilor autorizați.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Publicarea a eșuat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const widths: Record<Device, string> = {
    desktop: "max-w-[760px]",
    tablet: "max-w-[560px]",
    mobile: "max-w-[360px]",
  };

  if (loading) {
    return (
      <div className="grid min-h-[32rem] place-items-center rounded-2xl border border-line bg-surface">
        <div className="text-center">
          <div className="mx-auto size-8 animate-pulse rounded-lg bg-brand-soft" />
          <p className="mt-3 text-sm text-muted">
            Se pregătește studioul invitației…
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        className="min-h-[32rem]"
        title="Ciorna invitației nu a putut fi deschisă"
        description={`${loadError} Editorul nu pornește cu o copie locală neconfirmată.`}
        onRetry={() => {
          setLoadError("");
          setLoading(true);
          setLoadAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[42rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface lg:h-[calc(100dvh-8rem)]">
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Înapoi la invitații"
          onClick={() => router.push("/invitations")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Invitații</span>
        </Button>
        <div className="min-w-0 flex-1 border-l border-line pl-3 md:flex-none">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-brand text-base font-semibold text-brand">
              Studio invitație
            </h1>
            {dirty ? (
              <Badge className="hidden md:inline-flex" variant="warning" dot>
                Nesalvat
              </Badge>
            ) : (
              <Badge className="hidden md:inline-flex" variant="success" dot>
                Salvat
              </Badge>
            )}
          </div>
          <p className="hidden text-[11px] text-faint md:block">
            {dirty
              ? "Modificări locale"
              : lastSavedAt
                ? `Salvat la ${lastSavedAt.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`
                : "Ciornă nouă"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            className="md:hidden"
            variant="ghost"
            size="icon-sm"
            onClick={() => setSectionsOpen(true)}
            aria-label="Deschide secțiunile"
          >
            <LayoutPanelLeft className="size-4" aria-hidden />
          </Button>
          <Tooltip content="Anulează">
            <span className="hidden sm:inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={undo}
                disabled={!history.length}
                aria-label="Anulează"
              >
                <Undo2 className="size-4" aria-hidden />
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Refă">
            <span className="hidden sm:inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={redo}
                disabled={!future.length}
                aria-label="Refă"
              >
                <Redo2 className="size-4" aria-hidden />
              </Button>
            </span>
          </Tooltip>
          <Button
            className="hidden sm:inline-flex"
            variant="ghost"
            size="sm"
            onClick={() => setTemplateOpen(true)}
          >
            <LayoutTemplate className="size-3.5" aria-hidden />
            Șablon
          </Button>
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon-sm"
            onClick={() => setInspectorOpen(true)}
            aria-label="Deschide inspectorul"
          >
            <PanelRight className="size-4" aria-hidden />
          </Button>
          <Button
            className="hidden sm:inline-flex"
            variant="outline"
            size="sm"
            aria-label="Salvează ciorna invitației"
            loading={saving}
            disabled={!canWrite || demoMode}
            onClick={() => void saveDraft()}
          >
            <Save className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Salvează</span>
          </Button>
          <Button
            size="sm"
            disabled={!canPublish || demoMode || saving}
            onClick={() => {
              setInspectorTab("publish");
              setPublishOpen(true);
            }}
          >
            Publică
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[286px] shrink-0 border-r border-line bg-surface md:flex md:flex-col">
          <CreativeRail
            tab={leftPanelTab}
            onTabChange={setLeftPanelTab}
            snapshot={snapshot}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setInspectorTab("content");
            }}
            onMove={moveSection}
            onToggle={(section) =>
              updateSection(section.id, { visible: !section.visible })
            }
            onDuplicate={duplicateSection}
            onRemove={removeSection}
            onAddSection={addSection}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-sunken/60">
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              <span className="text-xs text-muted">
                Canvas live · dublu click pentru text
              </span>
            </div>
            <SegmentedControl
              ariaLabel="Dispozitiv de previzualizare"
              value={device}
              onChange={setDevice}
              size="sm"
              options={[
                {
                  value: "desktop",
                  label: <span className="hidden sm:inline">Desktop</span>,
                  ariaLabel: "Previzualizare desktop",
                  icon: <Monitor className="size-3.5" />,
                },
                {
                  value: "tablet",
                  label: <span className="hidden sm:inline">Tabletă</span>,
                  ariaLabel: "Previzualizare tabletă",
                  icon: <Tablet className="size-3.5" />,
                },
                {
                  value: "mobile",
                  label: <span className="hidden sm:inline">Mobil</span>,
                  ariaLabel: "Previzualizare mobilă",
                  icon: <Smartphone className="size-3.5" />,
                },
              ]}
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom((value) => Math.max(50, value - 10))}
                className="grid size-11 cursor-pointer place-items-center rounded-lg text-xs text-muted hover:bg-subtle"
                aria-label="Micșorează canvasul"
              >
                −
              </button>
              <button
                onClick={() => setZoom(90)}
                className="min-h-11 min-w-12 cursor-pointer rounded-lg text-center text-[11px] font-semibold tabular-nums text-muted hover:bg-subtle"
                aria-label="Resetează zoomul"
              >
                {zoom}%
              </button>
              <button
                onClick={() => setZoom((value) => Math.min(120, value + 10))}
                className="grid size-11 cursor-pointer place-items-center rounded-lg text-xs text-muted hover:bg-subtle"
                aria-label="Mărește canvasul"
              >
                +
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Deschide previzualizarea mare"
                onClick={() => {
                  setDevice("desktop");
                  setZoom(100);
                }}
              >
                <Maximize2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-5 sm:p-8">
            <div
              className={cn(
                "mx-auto transition-[max-width] duration-200",
                widths[device],
              )}
              style={{ zoom: zoom / 100 }}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-faint">
                <span>
                  {device === "desktop"
                    ? "1440 px"
                    : device === "tablet"
                      ? "768 px"
                      : "390 px"}
                </span>
                <span>
                  {
                    snapshot.sections.filter((section) => section.visible)
                      .length
                  }{" "}
                  secțiuni vizibile
                </span>
              </div>
              <InvitationCanvas
                snapshot={snapshot}
                selectedId={selectedId}
                resolveMedia={resolveMedia}
                onSelect={(id) => {
                  setSelectedId(id);
                  setInspectorTab("content");
                  if (window.innerWidth < 1024) setInspectorOpen(true);
                }}
                onUpdateSection={updateSection}
                onUpdateContent={(sectionId, key, value) => {
                  const section = snapshot.sections.find(
                    (item) => item.id === sectionId,
                  );
                  if (section)
                    updateSection(sectionId, {
                      content: { ...section.content, [key]: value },
                    });
                }}
              />
            </div>
          </div>
        </main>

        <aside className="hidden w-[330px] shrink-0 border-l border-line bg-surface lg:flex lg:flex-col">
          <Inspector
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            selected={selected}
            snapshot={snapshot}
            readiness={readiness}
            site={site}
            onUpdateSection={(update) =>
              selected && updateSection(selected.id, update)
            }
            onUpdateContent={updateContent}
            onUpdateContentMany={updateContentMany}
            onUpdateDesign={updateDesign}
            uploadingMedia={uploadingMedia}
            onUploadImage={uploadInvitationImage}
            onChooseTemplate={() => setTemplateOpen(true)}
            onPublish={() => setPublishOpen(true)}
          />
        </aside>
      </div>

      <Drawer
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        title="Structura invitației"
      >
        <SectionsPanel
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSectionsOpen(false);
            setInspectorOpen(true);
          }}
          onMove={moveSection}
          onToggle={(section) =>
            updateSection(section.id, { visible: !section.visible })
          }
          onDuplicate={duplicateSection}
          onRemove={removeSection}
          onAdd={() => setAddOpen(true)}
        />
      </Drawer>

      <Drawer
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title="Editează invitația"
      >
        <Inspector
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          selected={selected}
          snapshot={snapshot}
          readiness={readiness}
          site={site}
          onUpdateSection={(update) =>
            selected && updateSection(selected.id, update)
          }
          onUpdateContent={updateContent}
          onUpdateContentMany={updateContentMany}
          onUpdateDesign={updateDesign}
          uploadingMedia={uploadingMedia}
          onUploadImage={uploadInvitationImage}
          onChooseTemplate={() => setTemplateOpen(true)}
          onPublish={() => setPublishOpen(true)}
        />
      </Drawer>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Adaugă o secțiune"
        description="Construiește invitația din blocuri care rămân complet editabile."
        size="lg"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {sectionCatalog.map((entry) => {
            const Icon = icons[entry.type];
            return (
              <button
                key={entry.type}
                onClick={() => addSection(entry.type)}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-brand-strong group-hover:bg-surface">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {entry.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Direcție vizuală"
        description="Șablonul schimbă sistemul vizual; conținutul tău rămâne intact."
        size="lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {invitationTemplates.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                commit({ ...snapshot, design: { ...entry.design } });
                setTemplateOpen(false);
              }}
              className={cn(
                "cursor-pointer overflow-hidden rounded-xl border-2 text-left transition-colors",
                snapshot.design.template === entry.id
                  ? "border-brand"
                  : "border-line hover:border-line-strong",
              )}
            >
              <div
                className="flex h-28 items-center justify-center"
                style={{ backgroundColor: entry.design.background }}
              >
                <div
                  className={cn(
                    "border px-8 py-5 text-center",
                    radiusClass(entry.design.radius),
                  )}
                  style={{
                    backgroundColor: entry.design.surface,
                    borderColor: `${entry.design.accent}30`,
                  }}
                >
                  <p
                    className={cn(
                      "text-xl",
                      entry.design.headingFont === "display"
                        ? "font-display"
                        : "font-sans font-semibold",
                    )}
                    style={{ color: entry.design.accent }}
                  >
                    A & M
                  </p>
                  <div
                    className="mx-auto mt-2 h-px w-10"
                    style={{ backgroundColor: entry.design.accent }}
                  />
                </div>
              </div>
              <div className="px-3 py-3">
                <p className="text-sm font-semibold text-ink">{entry.name}</p>
                <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
        title="Publici invitația?"
        description={`${readiness.completed} din ${readiness.total} verificări de conținut sunt complete. Ciorna va fi salvată înainte de publicare.`}
        confirmLabel="Publică"
      />
    </div>
  );
}

function CreativeRail({
  tab,
  onTabChange,
  snapshot,
  selectedId,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  onAddSection,
}: {
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddSection: (type: InvitationSectionType) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 border-b border-line p-2">
        <button
          onClick={() => onTabChange("blocks")}
          className={cn(
            "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            tab === "blocks"
              ? "bg-brand text-on-brand"
              : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <Plus className="size-3.5" />
          Adaugă
        </button>
        <button
          onClick={() => onTabChange("layers")}
          className={cn(
            "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            tab === "layers"
              ? "bg-brand text-on-brand"
              : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <LayoutPanelLeft className="size-3.5" />
          Layere
        </button>
      </div>
      {tab === "blocks" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="text-xs font-semibold text-ink">Construiește pagina</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Adaugă blocuri, apoi schimbă layoutul, imaginile și culorile din
            inspector.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {sectionCatalog.map((entry) => {
              const Icon = icons[entry.type];
              return (
                <button
                  key={entry.type}
                  onClick={() => onAddSection(entry.type)}
                  className="group flex min-h-24 cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-subtle text-brand-strong group-hover:bg-surface">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-ink">
                    {entry.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <SectionsPanel
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onAdd={() => onTabChange("blocks")}
        />
      )}
    </div>
  );
}

function SectionsPanel({
  snapshot,
  selectedId,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  onAdd,
}: {
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-faint">
            Structură
          </p>
          <Badge variant="neutral">{snapshot.sections.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          Ordinea de aici este ordinea invitației.
        </p>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {snapshot.sections.map((section, index) => {
          const Icon = icons[section.type];
          const active = selectedId === section.id;
          return (
            <li
              key={section.id}
              className={cn(
                "group rounded-lg border transition-colors",
                active
                  ? "border-brand/35 bg-brand-softer"
                  : "border-transparent hover:bg-subtle",
              )}
            >
              <div className="flex items-center gap-1.5 p-1.5">
                <GripVertical
                  className="size-3.5 shrink-0 text-faint"
                  aria-hidden
                />
                <button
                  onClick={() => onSelect(section.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1 text-left"
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg",
                      section.visible
                        ? "bg-surface text-brand-strong"
                        : "bg-subtle text-faint",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "truncate text-[13px] font-medium",
                      section.visible ? "text-ink" : "text-faint line-through",
                    )}
                  >
                    {section.label}
                  </span>
                </button>
                <button
                  onClick={() => onToggle(section)}
                  className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
                  aria-label={
                    section.visible ? "Ascunde secțiunea" : "Afișează secțiunea"
                  }
                >
                  {section.visible ? (
                    <Eye className="size-3.5" aria-hidden />
                  ) : (
                    <EyeOff className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>
              {active && (
                <div className="flex items-center justify-end gap-0.5 border-t border-brand/10 px-2 py-1">
                  <button
                    onClick={() => onMove(section.id, -1)}
                    disabled={index === 0}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mută mai sus"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onMove(section.id, 1)}
                    disabled={index === snapshot.sections.length - 1}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mută mai jos"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onDuplicate(section.id)}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
                    aria-label="Duplică secțiunea"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onRemove(section.id)}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                    aria-label="Șterge secțiunea"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="border-t border-line p-3">
        <Button className="w-full" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          Adaugă secțiune
        </Button>
      </div>
    </div>
  );
}

function Inspector({
  tab,
  onTabChange,
  selected,
  snapshot,
  readiness,
  site,
  onUpdateSection,
  onUpdateContent,
  onUpdateContentMany,
  onUpdateDesign,
  uploadingMedia,
  onUploadImage,
  onChooseTemplate,
  onPublish,
}: {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  selected?: InvitationSection;
  snapshot: InvitationEditorSnapshot;
  readiness: ReturnType<typeof invitationReadiness>;
  site: InvitationSiteResource | null;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
  onUpdateContent: (key: string, value: unknown) => void;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
  onUpdateDesign: (update: Partial<InvitationDesign>) => void;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onChooseTemplate: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-3 border-b border-line bg-surface px-2 pt-2">
        {(
          [
            ["content", "Conținut"],
            ["design", "Design"],
            ["publish", "Publicare"],
          ] as Array<[InspectorTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => onTabChange(value)}
            className={cn(
              "min-h-11 cursor-pointer border-b-2 px-2 py-2 text-xs font-semibold transition-colors",
              tab === value
                ? "border-brand text-brand-strong"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "content" && selected && (
          <SectionInspector
            section={selected}
            uploadingMedia={uploadingMedia}
            onUploadImage={onUploadImage}
            onUpdateSection={onUpdateSection}
            onUpdateContent={onUpdateContent}
            onUpdateContentMany={onUpdateContentMany}
          />
        )}
        {tab === "design" && (
          <DesignInspector
            design={snapshot.design}
            onUpdate={onUpdateDesign}
            onChooseTemplate={onChooseTemplate}
          />
        )}
        {tab === "publish" && (
          <div className="space-y-6 p-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  Pregătire pentru publicare
                </p>
                <span className="text-xs font-semibold text-brand">
                  {readiness.completed}/{readiness.total}
                </span>
              </div>
              <Progress
                className="mt-3"
                value={readiness.completed}
                max={readiness.total}
                aria-label="Completitudinea invitației"
              />
              <ul className="mt-4 space-y-2.5">
                {readiness.checks.map((check) => (
                  <li
                    key={check.label}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full",
                        check.done
                          ? "bg-success-soft text-success"
                          : "bg-warning-soft text-warning",
                      )}
                    >
                      <Check className="size-3" aria-hidden />
                    </span>
                    <span className={check.done ? "text-ink" : "text-muted"}>
                      {check.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-subtle/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Acces invitați
              </p>
              <p className="mt-2 text-sm font-medium text-ink">
                Link personal și protejat
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Conținutul publicat este servit numai destinatarilor autorizați
                prin token
                {site?.accessPolicy === "token_or_access_code"
                  ? " sau cod de acces"
                  : ""}
                .
              </p>
            </div>
            <Button className="w-full" onClick={onPublish}>
              Verifică și publică
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionInspector({
  section,
  uploadingMedia,
  onUploadImage,
  onUpdateSection,
  onUpdateContent,
  onUpdateContentMany,
}: {
  section: InvitationSection;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
  onUpdateContent: (key: string, value: unknown) => void;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
}) {
  const Icon = icons[section.type];
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-brand-softer text-brand-strong">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{section.label}</p>
          <p className="text-xs text-muted">Editare live în canvas</p>
        </div>
        <Switch
          checked={section.visible}
          onCheckedChange={(visible) => onUpdateSection({ visible })}
        />
      </div>
      <Field label="Numele secțiunii" hint="Este vizibil doar în editor.">
        <Input
          value={section.label}
          onChange={(event) => onUpdateSection({ label: event.target.value })}
        />
      </Field>
      <ContentFields
        section={section}
        uploadingMedia={uploadingMedia}
        onUploadImage={onUploadImage}
        onUpdate={onUpdateContent}
        onUpdateMany={onUpdateContentMany}
      />
      <div className="border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Compoziție</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            onClick={() =>
              onUpdateSection({ style: { ...section.style, align: "left" } })
            }
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-medium",
              section.style.align === "left"
                ? "border-brand bg-brand-softer text-brand-strong"
                : "border-line text-muted",
            )}
          >
            <AlignLeft className="size-3.5" />
            Stânga
          </button>
          <button
            onClick={() =>
              onUpdateSection({ style: { ...section.style, align: "center" } })
            }
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-medium",
              section.style.align === "center"
                ? "border-brand bg-brand-softer text-brand-strong"
                : "border-line text-muted",
            )}
          >
            <AlignCenter className="size-3.5" />
            Centru
          </button>
          <button
            onClick={() =>
              onUpdateSection({ style: { ...section.style, align: "right" } })
            }
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border text-xs font-medium",
              section.style.align === "right"
                ? "border-brand bg-brand-softer text-brand-strong"
                : "border-line text-muted",
            )}
          >
            <AlignRight className="size-3.5" />
            Dreapta
          </button>
        </div>
        <Field className="mt-3" label="Spațiu vertical">
          <input
            type="range"
            min="16"
            max="120"
            step="4"
            value={section.style.padding}
            onChange={(event) =>
              onUpdateSection({
                style: {
                  ...section.style,
                  padding: Number(event.target.value),
                },
              })
            }
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <SectionBackgroundControls
          section={section}
          onUpdateSection={onUpdateSection}
        />
      </div>
    </div>
  );
}

function ContentFields({
  section,
  uploadingMedia,
  onUploadImage,
  onUpdate,
  onUpdateMany,
}: {
  section: InvitationSection;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdate: (key: string, value: unknown) => void;
  onUpdateMany: (values: Record<string, unknown>) => void;
}) {
  const c = section.content;
  const input = (key: string, label: string, placeholder?: string) => (
    <Field label={label}>
      <Input
        value={text(c[key])}
        placeholder={placeholder}
        onChange={(event) => onUpdate(key, event.target.value)}
      />
    </Field>
  );
  const area = (key: string, label: string, placeholder?: string) => (
    <Field label={label}>
      <Textarea
        value={text(c[key])}
        placeholder={placeholder}
        onChange={(event) => onUpdate(key, event.target.value)}
      />
    </Field>
  );
  if (section.type === "hero")
    return (
      <>
        <MediaUploader
          title="Imaginea principală"
          fileName={text(c.mediaName)}
          uploading={uploadingMedia}
          onFile={(file) =>
            void onUploadImage(file, (mediaId, fileName) => {
              onUpdateMany({ mediaId, mediaName: fileName });
            })
          }
          onRemove={() =>
            onUpdateMany({ mediaId: "", mediaName: "", coverImage: "" })
          }
        />
        <div>
          <p className="text-[13px] font-medium text-ink">Layout hero</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["immersive", "Pe imagine"],
              ["split", "Împărțit"],
              ["minimal", "Editorial"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => onUpdate("layout", value)}
                className={cn(
                  "h-16 cursor-pointer rounded-lg border px-2 text-[11px] font-semibold",
                  text(c.layout, "immersive") === value
                    ? "border-brand bg-brand-softer text-brand-strong"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Înălțime">
            <Select
              value={String(Number(c.heroHeight) || 620)}
              onChange={(event) =>
                onUpdate("heroHeight", Number(event.target.value))
              }
            >
              <option value="480">Compact</option>
              <option value="620">Cinematic</option>
              <option value="760">Full screen</option>
            </Select>
          </Field>
          <Field label="Text vertical">
            <Select
              value={text(c.contentY, "bottom")}
              onChange={(event) => onUpdate("contentY", event.target.value)}
            >
              <option value="top">Sus</option>
              <option value="center">Centru</option>
              <option value="bottom">Jos</option>
            </Select>
          </Field>
        </div>
        <Field label="Poziția imaginii — orizontal">
          <input
            type="range"
            min="0"
            max="100"
            value={Number(c.focalX) || 50}
            onChange={(event) => onUpdate("focalX", Number(event.target.value))}
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <Field label="Poziția imaginii — vertical">
          <input
            type="range"
            min="0"
            max="100"
            value={Number(c.focalY) || 50}
            onChange={(event) => onUpdate("focalY", Number(event.target.value))}
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Culoare overlay"
            value={text(c.overlayColor, "#14251D")}
            onChange={(value) => onUpdate("overlayColor", value)}
          />
          <Field label={`Overlay ${Number(c.overlayOpacity) || 0}%`}>
            <input
              type="range"
              min="0"
              max="85"
              value={Number(c.overlayOpacity) || 0}
              onChange={(event) =>
                onUpdate("overlayOpacity", Number(event.target.value))
              }
              className="min-h-11 w-full accent-[var(--brand)]"
            />
          </Field>
        </div>
        <Field label={`Mărime nume ${Number(c.headingSize) || 76}px`}>
          <input
            type="range"
            min="38"
            max="96"
            value={Number(c.headingSize) || 76}
            onChange={(event) =>
              onUpdate("headingSize", Number(event.target.value))
            }
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        {input("eyebrow", "Supratitlu")}
        {input("names", "Numele cuplului")}
        {input("date", "Data afișată")}
        {input("venue", "Locul")}
        {input("title", "Mesaj principal")}
        {area("subtitle", "Introducere")}
        {input("buttonLabel", "Text buton RSVP")}
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Imagine externă prin URL
          </summary>
          <Field className="mt-2" label="URL HTTPS">
            <Input
              type="url"
              value={text(c.coverImage)}
              placeholder="https://…"
              onChange={(event) => onUpdate("coverImage", event.target.value)}
              icon={<ImageIcon className="size-4" />}
            />
          </Field>
        </details>
      </>
    );
  if (section.type === "story")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Poveste")}
        {area("quote", "Citat sau încheiere")}
      </>
    );
  if (section.type === "countdown")
    return (
      <>
        {input("title", "Titlu")}
        <Field label="Data și ora evenimentului">
          <Input
            type="datetime-local"
            value={text(c.date)}
            onChange={(event) => onUpdate("date", event.target.value)}
          />
        </Field>
      </>
    );
  if (section.type === "schedule")
    return (
      <>
        {input("title", "Titlu")}
        <Repeater
          label="Momentele zilei"
          items={array(c.items)}
          fields={[
            ["time", "Ora"],
            ["title", "Moment"],
            ["detail", "Detaliu"],
          ]}
          onChange={(items) => onUpdate("items", items)}
        />
      </>
    );
  if (section.type === "locations")
    return (
      <>
        {input("title", "Titlu")}
        <Repeater
          label="Locații"
          items={array(c.items)}
          fields={[
            ["name", "Nume"],
            ["address", "Adresă"],
            ["url", "Link hartă"],
          ]}
          onChange={(items) => onUpdate("items", items)}
        />
      </>
    );
  if (section.type === "rsvp")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Mesaj")}
        {input("deadline", "Termen de confirmare")}
        {input("buttonLabel", "Text buton")}
      </>
    );
  if (section.type === "dress_code")
    return (
      <>
        {input("title", "Stil vestimentar")}
        {area("body", "Indicații")}
        <ColorRepeater
          colors={stringArray(c.colors)}
          onChange={(colors) => onUpdate("colors", colors)}
        />
      </>
    );
  if (section.type === "gallery")
    return (
      <>
        <MediaUploader
          title="Adaugă fotografii"
          uploading={uploadingMedia}
          multiple
          onFiles={async (files) => {
            let items = [...array(c.items)];
            for (const file of files) {
              await onUploadImage(file, (mediaId, fileName) => {
                items = [...items, { mediaId, fileName, caption: "" }];
              });
            }
            onUpdate("items", items);
          }}
        />
        <div>
          <p className="text-[13px] font-medium text-ink">Layout galerie</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["mosaic", "Mozaic"],
              ["grid", "Grilă"],
              ["filmstrip", "Bandă"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => onUpdate("layout", value)}
                className={cn(
                  "h-14 cursor-pointer rounded-lg border text-[11px] font-semibold",
                  text(c.layout, "mosaic") === value
                    ? "border-brand bg-brand-softer text-brand-strong"
                    : "border-line text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {input("title", "Titlu")}
        {area("body", "Introducere")}
        <GalleryItems
          items={array(c.items)}
          onChange={(items) => onUpdate("items", items)}
        />
      </>
    );
  if (section.type === "transport")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Introducere")}
        {area("details", "Orar și traseu")}
      </>
    );
  if (section.type === "accommodation")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Introducere")}
        <Repeater
          label="Recomandări"
          items={array(c.items)}
          fields={[
            ["name", "Cazare"],
            ["detail", "Detalii"],
            ["url", "Link"],
          ]}
          onChange={(items) => onUpdate("items", items)}
        />
      </>
    );
  if (section.type === "faq")
    return (
      <>
        {input("title", "Titlu")}
        <Repeater
          label="Întrebări și răspunsuri"
          items={array(c.items)}
          fields={[
            ["question", "Întrebare"],
            ["answer", "Răspuns"],
          ]}
          onChange={(items) => onUpdate("items", items)}
          multiline={["answer"]}
        />
      </>
    );
  if (section.type === "contact")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Mesaj")}
        {input("name", "Persoană de contact")}
        {input("phone", "Telefon")}
      </>
    );
  if (section.type === "registry")
    return (
      <>
        {input("title", "Titlu")}
        {area("body", "Mesaj")}
        {input("buttonLabel", "Text buton")}
        <Field label="Link listă">
          <Input
            type="url"
            value={text(c.url)}
            placeholder="https://…"
            onChange={(event) => onUpdate("url", event.target.value)}
          />
        </Field>
      </>
    );
  return (
    <>
      {input("title", "Titlu")}
      {area("body", "Conținut")}
      {input("buttonLabel", "Text buton opțional")}
      <Field label="Link opțional">
        <Input
          type="url"
          value={text(c.url)}
          placeholder="https://…"
          onChange={(event) => onUpdate("url", event.target.value)}
        />
      </Field>
    </>
  );
}

function MediaUploader({
  title,
  fileName,
  uploading,
  multiple = false,
  onFile,
  onFiles,
  onRemove,
}: {
  title: string;
  fileName?: string;
  uploading: boolean;
  multiple?: boolean;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void | Promise<void>;
  onRemove?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const acceptFiles = React.useCallback(
    (files: File[]) => {
      const images = files.filter((file) =>
        ["image/jpeg", "image/png", "image/webp"].includes(file.type),
      );
      if (multiple) void onFiles?.(images);
      else if (images[0]) onFile?.(images[0]);
    },
    [multiple, onFile, onFiles],
  );
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-subtle/35 transition",
        dragging
          ? "border-brand bg-brand-softer ring-2 ring-brand/15"
          : "border-line",
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!uploading) setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!uploading) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!uploading) acceptFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center px-4 py-5 text-center transition-colors hover:bg-brand-softer disabled:cursor-wait"
      >
        <span className="grid size-10 place-items-center rounded-full bg-surface text-brand shadow-card">
          {uploading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </span>
        <span className="mt-3 text-sm font-semibold text-ink">
          {uploading
            ? "Se încarcă și se securizează…"
            : dragging
              ? "Lasă imaginea aici"
              : title}
        </span>
        <span className="mt-1 text-xs text-muted">
          {fileName ||
            "Trage imaginea aici sau alege din calculator · max. 20 MB"}
        </span>
      </button>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={(event) => {
          acceptFiles(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      {fileName && onRemove && (
        <button
          onClick={onRemove}
          className="w-full cursor-pointer border-t border-line py-2 text-xs font-medium text-danger hover:bg-danger-soft"
        >
          Elimină imaginea
        </button>
      )}
    </div>
  );
}

function GalleryItems({
  items,
  onChange,
}: {
  items: Array<Record<string, unknown>>;
  onChange: (items: Array<Record<string, unknown>>) => void;
}) {
  if (!items.length)
    return (
      <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
        Galeria este goală. Încarcă una sau mai multe fotografii.
      </p>
    );
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`${text(item.mediaId)}-${index}`}
          className="flex items-center gap-2 rounded-lg border border-line p-2"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-subtle text-faint">
            <ImageIcon className="size-4" />
          </span>
          <Input
            className="h-9"
            value={text(item.caption)}
            placeholder={text(item.fileName, `Imagine ${index + 1}`)}
            onChange={(event) =>
              onChange(
                items.map((current, itemIndex) =>
                  itemIndex === index
                    ? { ...current, caption: event.target.value }
                    : current,
                ),
              )
            }
          />
          <button
            onClick={() =>
              onChange(items.filter((_, itemIndex) => itemIndex !== index))
            }
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
            aria-label={`Șterge imaginea ${index + 1}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-2">
        <label
          className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={validColor(value)}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-h-11 min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-ink outline-none"
          aria-label={`${label} hex`}
        />
      </div>
    </Field>
  );
}

function SectionBackgroundControls({
  section,
  onUpdateSection,
}: {
  section: InvitationSection;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
}) {
  const updateStyle = (update: Partial<InvitationSection["style"]>) =>
    onUpdateSection({ style: { ...section.style, ...update } });
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
      <div className="flex items-center gap-2">
        <Palette className="size-4 text-brand" />
        <p className="text-sm font-semibold text-ink">Fundal și culoare</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
        {(["solid", "gradient", "image"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() =>
              updateStyle({
                backgroundMode: mode,
                tone: mode === "solid" ? section.style.tone : "custom",
              })
            }
            className={cn(
              "h-11 cursor-pointer rounded-md text-[11px] font-semibold",
              section.style.backgroundMode === mode
                ? "bg-surface text-ink shadow-card"
                : "text-muted",
            )}
          >
            {mode === "solid"
              ? "Culoare"
              : mode === "gradient"
                ? "Gradient"
                : "Imagine"}
          </button>
        ))}
      </div>
      {section.style.backgroundMode === "solid" && (
        <>
          <Field label="Stil rapid">
            <Select
              value={section.style.tone}
              onChange={(event) =>
                updateStyle({
                  tone: event.target
                    .value as InvitationSection["style"]["tone"],
                })
              }
            >
              <option value="plain">Fundalul site-ului</option>
              <option value="soft">Accent delicat</option>
              <option value="accent">Accent plin</option>
              <option value="dark">Închis</option>
              <option value="custom">Personalizat</option>
            </Select>
          </Field>
          {section.style.tone === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <ColorField
                label="Fundal"
                value={section.style.backgroundColor || "#FFFFFF"}
                onChange={(backgroundColor) => updateStyle({ backgroundColor })}
              />
              <ColorField
                label="Text"
                value={section.style.textColor || "#20211F"}
                onChange={(textColor) => updateStyle({ textColor })}
              />
            </div>
          )}
        </>
      )}
      {section.style.backgroundMode === "gradient" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label="De la"
              value={section.style.gradientFrom}
              onChange={(gradientFrom) =>
                updateStyle({ gradientFrom, tone: "custom" })
              }
            />
            <ColorField
              label="Spre"
              value={section.style.gradientTo}
              onChange={(gradientTo) =>
                updateStyle({ gradientTo, tone: "custom" })
              }
            />
          </div>
          <Field label={`Unghi ${section.style.gradientAngle}°`}>
            <input
              type="range"
              min="0"
              max="360"
              value={section.style.gradientAngle}
              onChange={(event) =>
                updateStyle({ gradientAngle: Number(event.target.value) })
              }
              className="min-h-11 w-full accent-[var(--brand)]"
            />
          </Field>
          <ColorField
            label="Culoare text"
            value={section.style.textColor || "#20211F"}
            onChange={(textColor) => updateStyle({ textColor })}
          />
        </>
      )}
      {section.style.backgroundMode === "image" && (
        <p className="rounded-lg bg-info-soft p-3 text-xs leading-relaxed text-info">
          Pentru hero și galerie, imaginea se alege din zona Media de mai sus.
          Fundalul păstrează focalizarea și overlay-ul setate acolo.
        </p>
      )}
    </div>
  );
}

function Repeater({
  label,
  items,
  fields,
  multiline = [],
  onChange,
}: {
  label: string;
  items: Array<Record<string, unknown>>;
  fields: Array<[string, string]>;
  multiline?: string[];
  onChange: (items: Array<Record<string, unknown>>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([
              ...items,
              Object.fromEntries(fields.map(([key]) => [key, ""])),
            ])
          }
        >
          <Plus className="size-3.5" />
          Adaugă
        </Button>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-xl border border-line bg-subtle/35 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Element {index + 1}
              </span>
              <button
                onClick={() =>
                  onChange(items.filter((_, itemIndex) => itemIndex !== index))
                }
                className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                aria-label={`Șterge elementul ${index + 1}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {fields.map(([key, fieldLabel]) =>
                multiline.includes(key) ? (
                  <Field key={key} label={fieldLabel}>
                    <Textarea
                      className="min-h-20"
                      value={text(item[key])}
                      onChange={(event) =>
                        onChange(
                          items.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, [key]: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </Field>
                ) : (
                  <Field key={key} label={fieldLabel}>
                    <Input
                      value={text(item[key])}
                      onChange={(event) =>
                        onChange(
                          items.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, [key]: event.target.value }
                              : current,
                          ),
                        )
                      }
                    />
                  </Field>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorRepeater({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink">Paletă recomandată</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...colors, "#D8C9B8"])}
        >
          <Plus className="size-3.5" />
          Culoare
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <label
            key={`${color}-${index}`}
            className="relative size-11 cursor-pointer overflow-hidden rounded-full border-2 border-surface shadow-card"
            style={{ backgroundColor: color }}
          >
            <input
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              type="color"
              value={color}
              aria-label={`Culoarea ${index + 1}`}
              onChange={(event) =>
                onChange(
                  colors.map((current, colorIndex) =>
                    colorIndex === index ? event.target.value : current,
                  ),
                )
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function DesignInspector({
  design,
  onUpdate,
  onChooseTemplate,
}: {
  design: InvitationDesign;
  onUpdate: (update: Partial<InvitationDesign>) => void;
  onChooseTemplate: () => void;
}) {
  const colors: Array<
    [
      keyof Pick<
        InvitationDesign,
        "accent" | "background" | "surface" | "text"
      >,
      string,
    ]
  > = [
    ["accent", "Accent principal"],
    ["background", "Fundal pagină"],
    ["surface", "Fundal secțiuni"],
    ["text", "Text principal"],
  ];
  return (
    <div className="space-y-6 p-4">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Sistem vizual</p>
            <p className="mt-0.5 text-xs text-muted">
              {
                invitationTemplates.find((item) => item.id === design.template)
                  ?.name
              }
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onChooseTemplate}>
            Pornește din stil
          </Button>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Paleta ta</p>
            <p className="mt-0.5 text-xs text-muted">
              Adaugă orice culoare. Click pe ea ca s-o aplici ca accent.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={design.palette.length >= 12}
            onClick={() =>
              onUpdate({ palette: [...design.palette, "#8A5A83"] })
            }
          >
            <Plus className="size-3.5" />
            Culoare
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {design.palette.map((color, index) => (
            <div key={`${index}-${color}`} className="group relative">
              <label
                className={cn(
                  "block size-11 cursor-pointer overflow-hidden rounded-lg border-2",
                  design.accent.toLowerCase() === color.toLowerCase()
                    ? "border-ink"
                    : "border-surface shadow-card",
                )}
                style={{ backgroundColor: color }}
              >
                <input
                  type="color"
                  value={validColor(color)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`Culoare paletă ${index + 1}`}
                  onChange={(event) =>
                    onUpdate({
                      palette: design.palette.map((current, colorIndex) =>
                        colorIndex === index ? event.target.value : current,
                      ),
                    })
                  }
                />
              </label>
              <button
                onClick={() => onUpdate({ accent: color })}
                className="mt-1 min-h-11 w-11 truncate rounded-md text-[9px] uppercase text-faint hover:bg-subtle"
                title={`Aplică ${color} drept accent`}
              >
                {color}
              </button>
              {design.palette.length > 2 && (
                <button
                  onClick={() =>
                    onUpdate({
                      palette: design.palette.filter(
                        (_, colorIndex) => colorIndex !== index,
                      ),
                    })
                  }
                  className="absolute -right-1 -top-1 hidden size-4 cursor-pointer place-items-center rounded-full bg-ink text-[10px] text-white group-hover:grid"
                  aria-label={`Șterge culoarea ${index + 1}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-ink">Roluri de culoare</p>
        <div className="grid grid-cols-2 gap-3">
          {colors.map(([key, label]) => (
            <ColorField
              key={key}
              label={label}
              value={design[key]}
              onChange={(value) => onUpdate({ [key]: value })}
            />
          ))}
        </div>
      </div>
      <Field label="Tipografia titlurilor">
        <Select
          value={design.headingFont}
          onChange={(event) =>
            onUpdate({
              headingFont: event.target
                .value as InvitationDesign["headingFont"],
            })
          }
        >
          <option value="display">Fraunces — editorial</option>
          <option value="sans">Inter — modern</option>
        </Select>
      </Field>
      <Field label="Ritm vertical">
        <Select
          value={design.spacing}
          onChange={(event) =>
            onUpdate({
              spacing: event.target.value as InvitationDesign["spacing"],
            })
          }
        >
          <option value="compact">Compact</option>
          <option value="comfortable">Echilibrat</option>
          <option value="airy">Aerisit</option>
        </Select>
      </Field>
      <Field label="Colțuri">
        <Select
          value={design.radius}
          onChange={(event) =>
            onUpdate({
              radius: event.target.value as InvitationDesign["radius"],
            })
          }
        >
          <option value="none">Drepte</option>
          <option value="soft">Discrete</option>
          <option value="round">Rotunjite</option>
        </Select>
      </Field>
      <Field label="Stilul butoanelor">
        <Select
          value={design.buttonStyle}
          onChange={(event) =>
            onUpdate({
              buttonStyle: event.target
                .value as InvitationDesign["buttonStyle"],
            })
          }
        >
          <option value="solid">Plin</option>
          <option value="outline">Contur</option>
          <option value="pill">Capsulă</option>
        </Select>
      </Field>
      <div className="rounded-xl border border-line bg-subtle/50 p-3">
        <div className="flex gap-2">
          <Palette className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            Nu ești blocat în șablon: fiecare culoare poate fi scrisă în HEX,
            aleasă liber din picker sau înlocuită pe o singură secțiune.
          </p>
        </div>
      </div>
    </div>
  );
}

function InvitationCanvas({
  snapshot,
  selectedId,
  resolveMedia,
  onSelect,
  onUpdateSection,
  onUpdateContent,
}: {
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  resolveMedia: (mediaId: string, externalUrl?: string) => string;
  onSelect: (id: string) => void;
  onUpdateSection: (id: string, update: Partial<InvitationSection>) => void;
  onUpdateContent: (sectionId: string, key: string, value: unknown) => void;
}) {
  const { design } = snapshot;
  return (
    <article
      className={cn(
        "overflow-hidden border border-black/10 shadow-[0_24px_70px_rgba(45,40,32,.14)]",
        radiusClass(design.radius),
      )}
      style={{ backgroundColor: design.background, color: design.text }}
    >
      {snapshot.sections
        .filter((section) => section.visible)
        .map((section) => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={cn(
              "group relative block w-full cursor-pointer text-left outline-none transition-shadow focus-visible:z-10",
              selectedId === section.id &&
                "z-10 shadow-[inset_0_0_0_2px_var(--brand)]",
            )}
            aria-label={`Editează secțiunea ${section.label}`}
            tabIndex={0}
          >
            {selectedId === section.id && (
              <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-ink px-1.5 py-1 font-sans text-white shadow-overlay">
                <span className="px-2 text-[10px] font-semibold">
                  {section.label}
                </span>
                <span className="h-4 w-px bg-white/20" />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateSection(section.id, {
                      style: { ...section.style, align: "left" },
                    });
                  }}
                  className={cn(
                    "grid size-14 place-items-center rounded-md",
                    section.style.align === "left" && "bg-white/15",
                  )}
                  aria-label="Aliniază la stânga"
                >
                  <AlignLeft className="size-3.5" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateSection(section.id, {
                      style: { ...section.style, align: "center" },
                    });
                  }}
                  className={cn(
                    "grid size-14 place-items-center rounded-md",
                    section.style.align === "center" && "bg-white/15",
                  )}
                  aria-label="Aliniază la centru"
                >
                  <AlignCenter className="size-3.5" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateSection(section.id, {
                      style: { ...section.style, align: "right" },
                    });
                  }}
                  className={cn(
                    "grid size-14 place-items-center rounded-md",
                    section.style.align === "right" && "bg-white/15",
                  )}
                  aria-label="Aliniază la dreapta"
                >
                  <AlignRight className="size-3.5" />
                </button>
              </div>
            )}
            <PreviewSection
              section={section}
              design={design}
              resolveMedia={resolveMedia}
              onInlineChange={(key, value) =>
                onUpdateContent(section.id, key, value)
              }
            />
          </div>
        ))}
      {!snapshot.sections.some((section) => section.visible) && (
        <div className="grid min-h-96 place-items-center p-8 text-center text-sm opacity-60">
          Afișează sau adaugă o secțiune pentru a construi invitația.
        </div>
      )}
    </article>
  );
}

function PreviewSection({
  section,
  design,
  resolveMedia,
  onInlineChange,
}: {
  section: InvitationSection;
  design: InvitationDesign;
  resolveMedia: (mediaId: string, externalUrl?: string) => string;
  onInlineChange: (key: string, value: string) => void;
}) {
  const c = section.content;
  const align =
    section.style.align === "center"
      ? "text-center"
      : section.style.align === "right"
        ? "text-right"
        : "text-left";
  const heading = cn(
    design.headingFont === "display"
      ? "font-display font-semibold"
      : "font-sans font-semibold tracking-tight",
  );
  const tone = sectionTone(section.style, design);
  const common = cn("relative px-6 sm:px-12", align);
  const commonStyle = { ...tone, paddingBlock: section.style.padding };
  const buttonClass = cn(
    "inline-flex min-h-10 items-center justify-center px-5 text-xs font-semibold",
    design.buttonStyle === "pill"
      ? "rounded-full"
      : design.buttonStyle === "solid"
        ? radiusClass(design.radius)
        : "border bg-transparent",
    design.buttonStyle === "outline" && "border-current",
  );
  if (section.type === "hero") {
    const imageUrl = resolveMedia(text(c.mediaId), text(c.coverImage));
    const layout = text(c.layout, "immersive");
    const overlay = colorWithAlpha(
      text(c.overlayColor, "#14251D"),
      Number(c.overlayOpacity) || 0,
    );
    const textBlock = (
      <div
        className={cn(
          "relative z-10 w-full",
          imageUrl && layout === "immersive" && "text-white",
        )}
      >
        <EditableText
          value={text(c.eyebrow)}
          onCommit={(value) => onInlineChange("eyebrow", value)}
          className="text-[10px] font-semibold uppercase tracking-[.34em] opacity-70"
        />
        <h2
          className={cn("mt-4 leading-[.92]", heading)}
          style={{
            fontSize: Math.min(96, Math.max(38, Number(c.headingSize) || 76)),
            ...(!imageUrl || layout !== "immersive"
              ? { color: design.accent }
              : {}),
          }}
        >
          <EditableText
            value={text(c.names)}
            onCommit={(value) => onInlineChange("names", value)}
          />
        </h2>
        <div
          className={cn(
            "mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm",
            section.style.align === "center" && "justify-center",
            section.style.align === "right" && "justify-end",
          )}
        >
          <EditableText
            value={text(c.date)}
            onCommit={(value) => onInlineChange("date", value)}
          />
          <span aria-hidden>·</span>
          <EditableText
            value={text(c.venue)}
            onCommit={(value) => onInlineChange("venue", value)}
          />
        </div>
        <h3 className={cn("mt-8 text-xl sm:text-2xl", heading)}>
          <EditableText
            value={text(c.title)}
            onCommit={(value) => onInlineChange("title", value)}
          />
        </h3>
        <p
          className={cn(
            "mt-3 max-w-xl text-sm leading-relaxed opacity-80",
            section.style.align === "center" && "mx-auto",
            section.style.align === "right" && "ml-auto",
          )}
        >
          <EditableText
            value={text(c.subtitle)}
            onCommit={(value) => onInlineChange("subtitle", value)}
          />
        </p>
        {text(c.buttonLabel) && (
          <span
            className={cn("mt-7", buttonClass)}
            style={
              design.buttonStyle === "solid"
                ? {
                    backgroundColor:
                      imageUrl && layout === "immersive"
                        ? "#fff"
                        : design.accent,
                    color:
                      imageUrl && layout === "immersive"
                        ? design.accent
                        : "#fff",
                  }
                : {
                    color:
                      imageUrl && layout === "immersive"
                        ? "#fff"
                        : design.accent,
                  }
            }
          >
            {text(c.buttonLabel)}
          </span>
        )}
      </div>
    );
    if (layout === "split")
      return (
        <section
          className={cn(
            common,
            "grid min-h-[520px] overflow-hidden p-0 sm:grid-cols-2",
          )}
          style={tone}
        >
          <div
            className={cn(
              "flex px-8 py-16 sm:px-10",
              contentYClass(text(c.contentY, "center")),
            )}
          >
            {textBlock}
          </div>
          <div
            className="min-h-72 bg-black/5 bg-cover"
            style={{
              backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
              backgroundPosition: `${Number(c.focalX) || 50}% ${Number(c.focalY) || 50}%`,
            }}
          >
            {!imageUrl && (
              <span className="grid size-full min-h-72 place-items-center text-xs opacity-45">
                Încarcă imaginea hero
              </span>
            )}
          </div>
        </section>
      );
    if (layout === "minimal")
      return (
        <section
          className={cn(common, "overflow-hidden")}
          style={{ ...commonStyle, minHeight: Number(c.heroHeight) || 620 }}
        >
          <div
            className={cn(
              "mx-auto max-w-2xl",
              section.style.align === "right" && "ml-auto mr-0",
            )}
          >
            {textBlock}
          </div>
          {imageUrl && (
            <div
              className={cn(
                "mt-10 aspect-[16/7] bg-cover",
                radiusClass(design.radius),
              )}
              style={{
                backgroundImage: `url("${imageUrl}")`,
                backgroundPosition: `${Number(c.focalX) || 50}% ${Number(c.focalY) || 50}%`,
              }}
            />
          )}
        </section>
      );
    return (
      <section
        className={cn(
          common,
          "flex overflow-hidden",
          contentYClass(text(c.contentY, "bottom")),
        )}
        style={{
          ...commonStyle,
          minHeight: Number(c.heroHeight) || 620,
          backgroundImage: imageUrl
            ? `linear-gradient(${overlay},${overlay}),url("${imageUrl}")`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: `${Number(c.focalX) || 50}% ${Number(c.focalY) || 50}%`,
        }}
      >
        {textBlock}
      </section>
    );
  }
  if (section.type === "story")
    return (
      <section className={common} style={commonStyle}>
        <p className="text-[10px] font-semibold uppercase tracking-[.3em] opacity-70">
          Despre noi
        </p>
        <h2
          className={cn("mt-3 text-3xl sm:text-4xl", heading)}
          style={{ color: design.accent }}
        >
          <EditableText
            value={text(c.title)}
            onCommit={(value) => onInlineChange("title", value)}
          />
        </h2>
        <p
          className={cn(
            "mt-5 max-w-2xl text-sm leading-7 opacity-75",
            section.style.align === "center" && "mx-auto",
            section.style.align === "right" && "ml-auto",
          )}
        >
          <EditableText
            value={text(c.body)}
            onCommit={(value) => onInlineChange("body", value)}
          />
        </p>
        {text(c.quote) && (
          <blockquote
            className={cn(
              "mt-7 max-w-xl border-current/20 text-lg italic leading-relaxed opacity-80",
              section.style.align === "center"
                ? "mx-auto border-y py-5"
                : section.style.align === "right"
                  ? "ml-auto border-r pr-5"
                  : "border-l pl-5",
            )}
          >
            <EditableText
              value={text(c.quote)}
              onCommit={(value) => onInlineChange("quote", value)}
            />
          </blockquote>
        )}
      </section>
    );
  if (section.type === "countdown") {
    const values = countdownValues(text(c.date));
    return (
      <section className={common} style={commonStyle}>
        <h2 className={cn("text-2xl sm:text-3xl", heading)}>{text(c.title)}</h2>
        <div
          className={cn(
            "mt-7 grid grid-cols-4",
            section.style.align === "center" && "mx-auto max-w-xl",
          )}
        >
          {values.map(([value, label]) => (
            <div
              key={label}
              className="border-l border-current/15 px-2 first:border-l-0"
            >
              <p
                className={cn("text-2xl tabular-nums sm:text-4xl", heading)}
                style={{ color: design.accent }}
              >
                {value}
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-wider opacity-55">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (section.type === "schedule")
    return (
      <section className={common} style={commonStyle}>
        <h2
          className={cn("text-3xl", heading)}
          style={{ color: design.accent }}
        >
          {text(c.title)}
        </h2>
        <div
          className={cn(
            "mt-8 space-y-0",
            section.style.align === "center" && "mx-auto max-w-xl",
          )}
        >
          {array(c.items).map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[62px_1fr] gap-4 border-t border-current/15 py-4 first:border-t-0"
            >
              <p
                className="text-sm font-semibold tabular-nums"
                style={{ color: design.accent }}
              >
                {text(item.time)}
              </p>
              <div>
                <p className="text-sm font-semibold">{text(item.title)}</p>
                <p className="mt-1 text-xs opacity-60">{text(item.detail)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  if (section.type === "locations")
    return (
      <section className={common} style={commonStyle}>
        <h2
          className={cn("text-3xl", heading)}
          style={{ color: design.accent }}
        >
          {text(c.title)}
        </h2>
        <div
          className={cn(
            "mt-8 grid gap-3 sm:grid-cols-2",
            section.style.align === "center" && "mx-auto max-w-2xl",
          )}
        >
          {array(c.items).map((item, index) => (
            <div
              key={index}
              className={cn(
                "border border-current/15 p-5",
                radiusClass(design.radius),
              )}
            >
              <MapPin
                className={cn(
                  "size-5",
                  section.style.align === "center" && "mx-auto",
                )}
                style={{ color: design.accent }}
              />
              <p className="mt-4 text-sm font-semibold">{text(item.name)}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-60">
                {text(item.address)}
              </p>
              {text(item.url) && (
                <span className="mt-3 inline-block text-xs font-semibold underline underline-offset-4">
                  Deschide harta
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  if (section.type === "rsvp")
    return (
      <section className={common} style={commonStyle}>
        <p className="text-[10px] font-semibold uppercase tracking-[.3em] opacity-60">
          RSVP
        </p>
        <h2 className={cn("mt-3 text-3xl sm:text-4xl", heading)}>
          {text(c.title)}
        </h2>
        <p
          className={cn(
            "mt-4 max-w-xl text-sm leading-relaxed opacity-70",
            section.style.align === "center" && "mx-auto",
          )}
        >
          {text(c.body)}
        </p>
        <p className="mt-3 text-xs font-semibold opacity-70">
          Până pe {text(c.deadline)}
        </p>
        <span
          className={cn("mt-7", buttonClass)}
          style={
            design.buttonStyle === "solid"
              ? {
                  backgroundColor:
                    section.style.tone === "accent" ||
                    section.style.tone === "dark"
                      ? "#fff"
                      : design.accent,
                  color:
                    section.style.tone === "accent" ||
                    section.style.tone === "dark"
                      ? design.accent
                      : "#fff",
                }
              : undefined
          }
        >
          {text(c.buttonLabel)}
        </span>
      </section>
    );
  if (section.type === "dress_code")
    return (
      <section className={common} style={commonStyle}>
        <Shirt
          className={cn(
            "size-5 opacity-60",
            section.style.align === "center" && "mx-auto",
          )}
        />
        <h2 className={cn("mt-4 text-3xl", heading)}>{text(c.title)}</h2>
        <p
          className={cn(
            "mt-3 max-w-xl text-sm leading-relaxed opacity-65",
            section.style.align === "center" && "mx-auto",
          )}
        >
          {text(c.body)}
        </p>
        <div
          className={cn(
            "mt-6 flex flex-wrap gap-2",
            section.style.align === "center" && "justify-center",
          )}
        >
          {stringArray(c.colors).map((color, index) => (
            <span
              key={`${color}-${index}`}
              className="size-8 rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </section>
    );
  if (section.type === "gallery") {
    const items = array(c.items);
    const layout = text(c.layout, "mosaic");
    return (
      <section className={common} style={commonStyle}>
        <h2
          className={cn("text-3xl", heading)}
          style={{ color: design.accent }}
        >
          {text(c.title)}
        </h2>
        <p
          className={cn(
            "mt-3 max-w-xl text-sm leading-relaxed opacity-65",
            section.style.align === "center" && "mx-auto",
          )}
        >
          {text(c.body)}
        </p>
        {items.length ? (
          <div
            className={cn(
              "mt-8 gap-2",
              layout === "filmstrip"
                ? "flex snap-x overflow-hidden"
                : "grid grid-cols-2 sm:grid-cols-3",
              section.style.align === "center" &&
                layout !== "filmstrip" &&
                "mx-auto max-w-2xl",
            )}
          >
            {items.map((item, index) => {
              const url = resolveMedia(text(item.mediaId), text(item.url));
              return (
                <figure
                  key={index}
                  className={cn(
                    "overflow-hidden bg-black/5",
                    radiusClass(design.radius),
                    layout === "mosaic" &&
                      index === 0 &&
                      items.length > 2 &&
                      "col-span-2 row-span-2",
                    layout === "filmstrip" && "w-[72%] shrink-0 snap-center",
                  )}
                >
                  <div
                    className="aspect-square bg-cover bg-center"
                    style={{
                      backgroundImage: url ? `url("${url}")` : undefined,
                    }}
                  >
                    <span
                      className={cn(
                        "grid size-full place-items-center",
                        url ? "sr-only" : "text-xs opacity-45",
                      )}
                    >
                      Adaugă imaginea
                    </span>
                  </div>
                  {text(item.caption) && (
                    <figcaption className="px-3 py-2 text-[10px] opacity-60">
                      {text(item.caption)}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        ) : (
          <div
            className={cn(
              "mt-8 grid min-h-40 place-items-center border border-dashed border-current/25 p-6",
              radiusClass(design.radius),
            )}
          >
            <div>
              <Images className="mx-auto size-6 opacity-35" />
              <p className="mt-2 text-xs opacity-50">
                Adaugă fotografii din inspector
              </p>
            </div>
          </div>
        )}
      </section>
    );
  }
  if (section.type === "faq")
    return (
      <section className={common} style={commonStyle}>
        <h2
          className={cn("text-3xl", heading)}
          style={{ color: design.accent }}
        >
          {text(c.title)}
        </h2>
        <div
          className={cn(
            "mt-7 divide-y divide-current/15 border-y border-current/15",
            section.style.align === "center" && "mx-auto max-w-2xl",
          )}
        >
          {array(c.items).map((item, index) => (
            <div key={index} className="py-4">
              <p className="text-sm font-semibold">{text(item.question)}</p>
              <p className="mt-2 text-xs leading-relaxed opacity-65">
                {text(item.answer)}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  if (section.type === "accommodation")
    return (
      <section className={common} style={commonStyle}>
        <BedDouble
          className={cn(
            "size-5 opacity-60",
            section.style.align === "center" && "mx-auto",
          )}
        />
        <h2 className={cn("mt-4 text-3xl", heading)}>{text(c.title)}</h2>
        <p
          className={cn(
            "mt-3 max-w-xl text-sm opacity-65",
            section.style.align === "center" && "mx-auto",
          )}
        >
          {text(c.body)}
        </p>
        <div className="mt-6 space-y-2">
          {array(c.items).map((item, index) => (
            <div key={index} className="border-t border-current/15 py-3">
              <p className="text-sm font-semibold">{text(item.name)}</p>
              <p className="mt-1 text-xs opacity-60">{text(item.detail)}</p>
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <section className={common} style={commonStyle}>
      <h2
        className={cn("text-3xl", heading)}
        style={{
          color:
            section.style.tone === "accent" || section.style.tone === "dark"
              ? undefined
              : design.accent,
        }}
      >
        {text(c.title)}
      </h2>
      <p
        className={cn(
          "mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed opacity-70",
          section.style.align === "center" && "mx-auto",
        )}
      >
        {text(c.body)}
      </p>
      {text(c.details) && (
        <p
          className={cn(
            "mt-5 max-w-2xl whitespace-pre-line text-xs leading-relaxed opacity-60",
            section.style.align === "center" && "mx-auto",
          )}
        >
          {text(c.details)}
        </p>
      )}
      {text(c.name) && (
        <p className="mt-5 text-sm font-semibold">
          {text(c.name)} · {text(c.phone)}
        </p>
      )}
      {text(c.buttonLabel) && (
        <span className={cn("mt-6", buttonClass)}>{text(c.buttonLabel)}</span>
      )}
    </section>
  );
}

function EditableText({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block min-w-4 cursor-text rounded-sm outline-none focus:bg-white/15 focus:ring-2 focus:ring-current/30",
        className,
      )}
      contentEditable
      suppressContentEditableWarning
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const next = event.currentTarget.textContent?.trim() ?? "";
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </span>
  );
}

function sectionTone(
  style: InvitationSection["style"],
  design: InvitationDesign,
): React.CSSProperties {
  if (style.backgroundMode === "gradient")
    return {
      background: `linear-gradient(${style.gradientAngle}deg, ${validColor(style.gradientFrom)}, ${validColor(style.gradientTo)})`,
      color: style.textColor || design.text,
    };
  if (style.tone === "custom")
    return {
      backgroundColor: validColor(style.backgroundColor || design.surface),
      color: validColor(style.textColor || design.text),
    };
  if (style.tone === "soft")
    return {
      backgroundColor: mixHex(design.accent, design.surface, 0.08),
      color: design.text,
    };
  if (style.tone === "accent")
    return { backgroundColor: design.accent, color: "#FFFFFF" };
  if (style.tone === "dark")
    return { backgroundColor: design.text, color: design.surface };
  return { backgroundColor: design.surface, color: design.text };
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#20211F";
}

function colorWithAlpha(value: string, opacity: number) {
  const color = validColor(value);
  const alpha = Math.round(Math.min(100, Math.max(0, opacity)) * 2.55)
    .toString(16)
    .padStart(2, "0");
  return `${color}${alpha}`;
}

function contentYClass(value: string) {
  return value === "top"
    ? "items-start"
    : value === "center"
      ? "items-center"
      : "items-end";
}

function radiusClass(radius: InvitationDesign["radius"]) {
  return radius === "none"
    ? "rounded-none"
    : radius === "round"
      ? "rounded-3xl"
      : "rounded-xl";
}

function safeImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function countdownValues(value: string): Array<[string, string]> {
  const target = new Date(value).getTime();
  const difference = Number.isFinite(target)
    ? Math.max(0, target - Date.now())
    : 0;
  const days = Math.floor(difference / 86_400_000);
  const hours = Math.floor((difference / 3_600_000) % 24);
  const minutes = Math.floor((difference / 60_000) % 60);
  const seconds = Math.floor((difference / 1_000) % 60);
  return [
    [String(days).padStart(2, "0"), "zile"],
    [String(hours).padStart(2, "0"), "ore"],
    [String(minutes).padStart(2, "0"), "minute"],
    [String(seconds).padStart(2, "0"), "secunde"],
  ];
}

function mixHex(a: string, b: string, amount: number) {
  const parse = (hex: string) =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (left: number, right: number) =>
    Math.round(left * amount + right * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

function invitationSlug(title: string, workspaceId: string) {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "invitatie";
  return `${base}-${workspaceId.slice(0, 8)}`;
}
