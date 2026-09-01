"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Check,
  ChevronsDown,
  ChevronsUp,
  CircleHelp,
  Image as ImageIcon,
  ImagePlus,
  LayoutPanelLeft,
  LayoutTemplate,
  Maximize2,
  Minus,
  Monitor,
  Palette,
  PanelRight,
  PencilLine,
  PlayCircle,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type {
  InvitationPreflightResource,
  InvitationSiteResource,
  InvitationSyncPath,
  InvitationSyncPreviewResource,
  InvitationVariantResource,
  InvitationVersionHistoryItemResource,
} from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  advancedBlockCatalog,
  applyInvitationVariant,
  array,
  createAdvancedSection,
  createDefaultSection,
  createInitialSnapshot,
  invitationReadiness,
  invitationStarterSectionId,
  invitationVariantOverrides,
  invitationTemplates,
  isInvitationHexColor,
  nextInvitationPaletteColor,
  removeInvitationPaletteColor,
  sectionCatalog,
  serializeSnapshot,
  snapshotFromPersisted,
  stringArray,
  text,
  type InvitationDesign,
  type InvitationDevice,
  type InvitationEditorSnapshot,
  type InvitationExperienceSettings,
  type InvitationBlockKind,
  type InvitationSection,
  type InvitationSectionType,
} from "@/lib/invitations/editor-model";
import {
  commitInvitationHistory,
  createInvitationHistory,
  invitationContentCoalesceKey,
  invitationRecordCoalesceKey,
  redoInvitationHistory,
  undoInvitationHistory,
  type InvitationHistoryState,
} from "@/lib/invitations/editor-history";
import {
  invitationEditableField,
  invitationEditableFields,
  invitationContentValue,
  setInvitationContentValue,
} from "@/lib/invitations/editor-content";
import {
  invitationPreflightGuide,
  type InvitationPreflightAction,
} from "@/lib/invitations/preflight-actions";
import { cn } from "@/lib/utils";
import { InvitationExperiencePanel } from "@/components/invitations/editor-experience-panel";
import { EditorRevealPreview } from "@/components/invitations/editor-reveal-preview";
import {
  invitationBlockIcons,
  invitationSectionIcon,
  invitationSectionIcons,
} from "@/components/invitations/editor-section-icons";
import { EditorSectionsPanel } from "@/components/invitations/editor-sections-panel";
import { EditorLayerStudio } from "@/components/invitations/editor-layer-studio";
import { InvitationRenderer } from "@/components/invitations/invitation-renderer";
import { EditorWorkflowPanel } from "@/components/invitations/editor-workflow-panel";
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

type Device = InvitationDevice;
type PublicPreviewMode = "invitation" | "rsvp" | "flow";

const deviceWidths: Record<Device, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
};

/**
 * Below this scale the invitation text stops being readable, so "fit" stops
 * shrinking and the canvas scrolls sideways instead of showing an unusable
 * thumbnail of the desktop layout.
 */
const canvasFitFloor = 0.5;
type InspectorTab = "content" | "design" | "experience" | "publish";
type LeftPanelTab = "blocks" | "layers";
type EditorViewport = "mobile" | "tablet" | "desktop" | "studio";

function useEditorViewport() {
  const [viewport, setViewport] =
    React.useState<EditorViewport>("studio");

  React.useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setViewport(
        width < 768
          ? "mobile"
          : width < 1024
            ? "tablet"
            : width < 1280
              ? "desktop"
              : "studio",
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}

export default function InvitationEditorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [snapshot, setSnapshot] = React.useState<InvitationEditorSnapshot>(() =>
    createInitialSnapshot(),
  );
  const [baseSnapshot, setBaseSnapshot] =
    React.useState<InvitationEditorSnapshot>(() => createInitialSnapshot());
  const [historyState, setHistoryState] = React.useState<InvitationHistoryState>(
    createInvitationHistory,
  );
  const [selectedId, setSelectedId] = React.useState("hero");
  const [selectedContentKey, setSelectedContentKey] = React.useState<string | null>(
    "names",
  );
  const [structurePanelOpen, setStructurePanelOpen] = React.useState(true);
  const [inspectorPanelOpen, setInspectorPanelOpen] = React.useState(true);
  const [device, setDevice] = React.useState<Device>("desktop");
  const [leftPanelTab, setLeftPanelTab] =
    React.useState<LeftPanelTab>("layers");
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
  const [canvasPreviewOpen, setCanvasPreviewOpen] = React.useState(false);
  const [publicPreviewMode, setPublicPreviewMode] =
    React.useState<PublicPreviewMode>("invitation");
  const [revealPreviewOpen, setRevealPreviewOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [sectionsOpen, setSectionsOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [mobileInspectorExpanded, setMobileInspectorExpanded] =
    React.useState(false);
  const [sectionToRemove, setSectionToRemove] =
    React.useState<InvitationSection | null>(null);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const editorViewport = useEditorViewport();
  const [uploadingMedia, setUploadingMedia] = React.useState(false);
  const [mediaPreviews, setMediaPreviews] = React.useState<
    Record<string, string>
  >({});
  const [variants, setVariants] = React.useState<InvitationVariantResource[]>(
    [],
  );
  const [activeVariantId, setActiveVariantId] = React.useState<string | null>(
    null,
  );
  const [versions, setVersions] = React.useState<
    InvitationVersionHistoryItemResource[]
  >([]);
  const [syncPreview, setSyncPreview] =
    React.useState<InvitationSyncPreviewResource | null>(null);

  React.useEffect(() => {
    const width = window.innerWidth;
    const initialDevice: Device =
      width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
    const timer = window.setTimeout(() => setDevice(initialDevice), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [preflight, setPreflight] =
    React.useState<InvitationPreflightResource | null>(null);
  const [preflightBusy, setPreflightBusy] = React.useState(false);
  const [preflightError, setPreflightError] = React.useState("");
  const preflightSignatureRef = React.useRef<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = React.useState(false);
  const [variantCreateOpen, setVariantCreateOpen] = React.useState(false);
  const [variantToArchive, setVariantToArchive] =
    React.useState<InvitationVariantResource | null>(null);
  const [versionToRestore, setVersionToRestore] =
    React.useState<InvitationVersionHistoryItemResource | null>(null);
  const editRevisionRef = React.useRef(0);
  const canvasScrollRef = React.useRef<HTMLDivElement>(null);
  const scrollRequestRef = React.useRef<string | null>(null);
  const [zoom, setZoom] = React.useState<"fit" | number>("fit");
  const [canvasViewportWidth, setCanvasViewportWidth] = React.useState(0);
  const canWrite =
    bootstrap?.membership.capabilities.includes("invitation.write") ?? false;
  const canPublish =
    bootstrap?.membership.capabilities.includes("invitation.publish") ?? false;
  const selected =
    snapshot.sections.find((section) => section.id === selectedId) ??
    snapshot.sections[0];
  const readiness = invitationReadiness(snapshot);
  const activeVariant =
    variants.find((variant) => variant.id === activeVariantId) ?? null;
  const mobileEditor = editorViewport === "mobile";
  const drawerInspector =
    editorViewport === "tablet" || editorViewport === "desktop";
  const permanentInspector = editorViewport === "studio";
  const permanentStructure =
    editorViewport === "desktop" || editorViewport === "studio";

  React.useEffect(() => {
    if (!currentWorkspace || demoMode) {
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void (async () => {
      try {
        const value = await weddingOsApi.invitationSite(currentWorkspace.id);
        const [variantData, versionData] = value
          ? await Promise.all([
              weddingOsApi.invitationVariants(currentWorkspace.id),
              weddingOsApi.invitationVersions(currentWorkspace.id),
            ])
          : [{ items: [] }, { items: [], nextCursor: null }];
        if (!active) return;
        setSite(value);
        const next = snapshotFromPersisted(
          value?.draft?.document.sections,
          value?.draft?.settings as Parameters<typeof snapshotFromPersisted>[1],
        );
        setBaseSnapshot(next);
        setSnapshot(next);
        setVariants(variantData.items);
        setVersions(versionData.items);
        setActiveVariantId(null);
        setSelectedId(next.sections[0]?.id ?? "");
        setSelectedContentKey(null);
        setLastSavedAt(value?.draft ? new Date() : null);
      } catch (caught) {
        const message = apiErrorMessage(caught);
        setLoadError(message);
        toast({
          title: "Ciorna nu a putut fi încărcată",
          description: message,
          variant: "error",
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
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
    (next: InvitationEditorSnapshot, coalesceKey: string | null = null) => {
      editRevisionRef.current += 1;
      setPreflight(null);
      setPreflightError("");
      setHistoryState((current) =>
        commitInvitationHistory(current, snapshot, coalesceKey, Date.now()),
      );
      setSnapshot(next);
      setDirty(true);
    },
    [snapshot],
  );

  const saveDraft = React.useCallback(
    async (silent = false) => {
      if (!currentWorkspace || demoMode || !canWrite) return site;
      const revisionAtStart = editRevisionRef.current;
      setSaving(true);
      try {
        const activeVariant = variants.find(
          (variant) => variant.id === activeVariantId,
        );
        if (activeVariant) {
          const updatedVariant = await weddingOsApi.saveInvitationVariantDraft(
            currentWorkspace.id,
            activeVariant.id,
            activeVariant.version,
            {
              overrides: invitationVariantOverrides(baseSnapshot, snapshot),
            },
          );
          setVariants((current) =>
            current.map((variant) =>
              variant.id === updatedVariant.id ? updatedVariant : variant,
            ),
          );
          if (revisionAtStart === editRevisionRef.current) setDirty(false);
          setLastSavedAt(new Date());
          if (!silent)
            toast({
              title: "Variantă salvată",
              description: `${updatedVariant.name} păstrează numai diferențele față de invitația de bază.`,
              variant: "success",
            });
          return site;
        }
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
        setBaseSnapshot(snapshot);
        if (revisionAtStart === editRevisionRef.current) setDirty(false);
        setLastSavedAt(new Date());
        void weddingOsApi
          .invitationVersions(currentWorkspace.id)
          .then((versionData) => setVersions(versionData.items))
          .catch(() => undefined);
        if (!silent)
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
    },
    [
      activeVariantId,
      baseSnapshot,
      canWrite,
      currentWorkspace,
      demoMode,
      site,
      snapshot,
      toast,
      variants,
    ],
  );

  React.useEffect(() => {
    if (!dirty || saving || !canWrite || demoMode || !currentWorkspace) return;
    const timer = window.setTimeout(() => void saveDraft(true), 1600);
    return () => window.clearTimeout(timer);
  }, [canWrite, currentWorkspace, demoMode, dirty, saveDraft, saving]);

  // The server enforces more publish rules than the local checklist can see, so
  // run the read-only preflight as soon as the review tab is open on a saved
  // draft instead of surprising the couple at the moment they press publish.
  React.useEffect(() => {
    if (inspectorTab !== "publish" || !canPublish || demoMode) return;
    if (!currentWorkspace || !site || dirty || saving || preflight) return;
    const signature = `${site.version}:${activeVariantId ?? "base"}`;
    if (preflightSignatureRef.current === signature) return;
    let active = true;
    const timer = window.setTimeout(() => {
      preflightSignatureRef.current = signature;
      setPreflightBusy(true);
      setPreflightError("");
      void weddingOsApi
        .invitationPreflight(currentWorkspace.id)
        .then((value) => {
          if (active) setPreflight(value);
        })
        .catch((caught) => {
          if (active) setPreflightError(apiErrorMessage(caught));
        })
        .finally(() => {
          if (active) setPreflightBusy(false);
        });
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    activeVariantId,
    canPublish,
    currentWorkspace,
    demoMode,
    dirty,
    inspectorTab,
    preflight,
    saving,
    site,
  ]);

  const undo = React.useCallback(() => {
    const result = undoInvitationHistory(historyState, snapshot);
    if (!result) return;
    editRevisionRef.current += 1;
    setPreflight(null);
    setHistoryState(result.state);
    setSnapshot(result.snapshot);
    setDirty(true);
  }, [historyState, snapshot]);

  const redo = React.useCallback(() => {
    const result = redoInvitationHistory(historyState, snapshot);
    if (!result) return;
    editRevisionRef.current += 1;
    setPreflight(null);
    setHistoryState(result.state);
    setSnapshot(result.snapshot);
    setDirty(true);
  }, [historyState, snapshot]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveDraft();
        return;
      }
      // Inline canvas text is contentEditable and only reaches the snapshot on
      // blur, so the browser's own undo is the correct one while editing there.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, saveDraft, undo]);

  const updateSection = (
    id: string,
    update: Partial<InvitationSection>,
    coalesceKey: string | null = defaultSectionCoalesceKey(id, update),
  ) => {
    commit(
      {
        ...snapshot,
        sections: snapshot.sections.map((section) =>
          section.id === id ? { ...section, ...update } : section,
        ),
      },
      coalesceKey,
    );
  };

  const updateContent = (key: string, value: unknown) => {
    if (!selected) return;
    updateSection(
      selected.id,
      { content: setInvitationContentValue(selected.content, key, value) },
      invitationContentCoalesceKey(selected.id, key),
    );
  };

  const updateContentMany = (values: Record<string, unknown>) => {
    if (!selected) return;
    updateSection(
      selected.id,
      { content: { ...selected.content, ...values } },
      invitationRecordCoalesceKey(`content:${selected.id}`, values),
    );
  };

  const updateDesign = (update: Partial<InvitationDesign>) =>
    commit(
      { ...snapshot, design: { ...snapshot.design, ...update } },
      invitationRecordCoalesceKey("design", update),
    );

  const updateExperience = (update: Partial<InvitationExperienceSettings>) =>
    commit(
      { ...snapshot, experience: { ...snapshot.experience, ...update } },
      invitationRecordCoalesceKey("experience", update),
    );

  const structureLockedByVariant = () => {
    if (!activeVariantId) return false;
    toast({
      title: "Structura vine din invitația de bază",
      description:
        "Într-o variantă poți schimba textul, vizibilitatea și designul. Adaugă, șterge sau reordonează secțiunile în baza invitației.",
      variant: "info",
    });
    return true;
  };

  const moveSection = (id: string, direction: -1 | 1) => {
    if (structureLockedByVariant()) return;
    const index = snapshot.sections.findIndex((section) => section.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= snapshot.sections.length) return;
    const sections = [...snapshot.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    commit({ ...snapshot, sections });
  };

  const reorderSection = (id: string, toIndex: number) => {
    if (structureLockedByVariant()) return;
    const from = snapshot.sections.findIndex((section) => section.id === id);
    const to = Math.max(0, Math.min(snapshot.sections.length - 1, toIndex));
    if (from < 0 || from === to) return;
    const sections = [...snapshot.sections];
    const [moved] = sections.splice(from, 1);
    sections.splice(to, 0, moved);
    commit({ ...snapshot, sections });
  };

  const duplicateSection = (id: string) => {
    if (structureLockedByVariant()) return;
    const index = snapshot.sections.findIndex((section) => section.id === id);
    if (index < 0) return;
    const source = snapshot.sections[index];
    const copy: InvitationSection = {
      ...source,
      id: `section-${Date.now()}`,
      label: `${source.label}, copie`,
      content: structuredClone(source.content),
      style: { ...source.style },
    };
    const sections = [...snapshot.sections];
    sections.splice(index + 1, 0, copy);
    commit({ ...snapshot, sections });
    setSelectedId(copy.id);
  };

  const removeSection = (id: string) => {
    if (structureLockedByVariant()) return;
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

  const requestRemoveSection = (id: string) => {
    if (structureLockedByVariant()) return;
    const section = snapshot.sections.find((item) => item.id === id);
    if (!section) return;
    if (snapshot.sections.length === 1) {
      toast({ title: "Păstrează cel puțin o secțiune", variant: "warning" });
      return;
    }
    setSectionToRemove(section);
  };

  const addSection = (type: InvitationSectionType) => {
    if (structureLockedByVariant()) return;
    const section = createDefaultSection(type);
    commit({ ...snapshot, sections: [...snapshot.sections, section] });
    setSelectedId(section.id);
    setInspectorTab("content");
    setAddOpen(false);
    if (permanentInspector) setInspectorPanelOpen(true);
    else setInspectorOpen(true);
  };

  const addAdvancedSection = (blockKind: InvitationBlockKind) => {
    if (structureLockedByVariant()) return;
    const section = createAdvancedSection(blockKind);
    commit({ ...snapshot, sections: [...snapshot.sections, section] });
    setSelectedId(section.id);
    setInspectorTab("content");
    setAddOpen(false);
    if (permanentInspector) setInspectorPanelOpen(true);
    else setInspectorOpen(true);
  };

  const selectVariant = async (variantId: string | null) => {
    if (variantId === activeVariantId) return;
    const sourceBase = activeVariantId ? baseSnapshot : snapshot;
    if (dirty) {
      const saved = await saveDraft(true);
      if (!saved) return;
    }
    const variant = variants.find((item) => item.id === variantId);
    const next = variant
      ? applyInvitationVariant(
          sourceBase,
          variant.draft?.overrides ?? variant.published?.overrides,
        )
      : sourceBase;
    setBaseSnapshot(sourceBase);
    setSnapshot(next);
    setActiveVariantId(variant?.id ?? null);
    setHistoryState(createInvitationHistory());
    setDirty(false);
    setSelectedId(next.sections[0]?.id ?? "");
  };

  const createVariant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || demoMode || !site) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const code = variantCode(String(form.get("code") ?? name));
    if (!name) return;
    const sourceBase = activeVariantId ? baseSnapshot : snapshot;
    if (dirty) {
      const saved = await saveDraft(true);
      if (!saved) return;
    }
    setWorkflowBusy(true);
    try {
      const created = await weddingOsApi.createInvitationVariant(
        currentWorkspace.id,
        { name, code, overrides: {} },
      );
      setVariants((current) => [...current, created]);
      setActiveVariantId(created.id);
      setBaseSnapshot(sourceBase);
      setSnapshot(structuredClone(sourceBase));
      setVariantCreateOpen(false);
      setHistoryState(createInvitationHistory());
      setDirty(false);
      toast({
        title: "Variantă creată",
        description: `${created.name} moștenește invitația de bază până când schimbi ceva aici.`,
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Varianta nu a fost creată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const archiveVariant = async () => {
    if (!currentWorkspace || !variantToArchive) return;
    setWorkflowBusy(true);
    try {
      const archived = await weddingOsApi.archiveInvitationVariant(
        currentWorkspace.id,
        variantToArchive.id,
        variantToArchive.version,
      );
      setVariants((current) =>
        current.map((variant) =>
          variant.id === archived.id ? archived : variant,
        ),
      );
      if (activeVariantId === archived.id) {
        setActiveVariantId(null);
        setSnapshot(structuredClone(baseSnapshot));
        setDirty(false);
      }
      setVariantToArchive(null);
      toast({
        title: "Variantă arhivată",
        description:
          "Destinatarii pot fi mutați pe baza invitației sau pe altă variantă.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Varianta nu a fost arhivată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const restoreVersion = async () => {
    if (!currentWorkspace || !site || !versionToRestore) return;
    setWorkflowBusy(true);
    try {
      const updated = await weddingOsApi.restoreInvitationVersion(
        currentWorkspace.id,
        versionToRestore.id,
        site.version,
      );
      const next = snapshotFromPersisted(
        updated.draft?.document.sections,
        updated.draft?.settings as Parameters<typeof snapshotFromPersisted>[1],
      );
      setSite(updated);
      setBaseSnapshot(next);
      setSnapshot(next);
      setActiveVariantId(null);
      setDirty(false);
      setHistoryState(createInvitationHistory());
      setVersionToRestore(null);
      const versionData = await weddingOsApi.invitationVersions(
        currentWorkspace.id,
      );
      setVersions(versionData.items);
      toast({
        title: "Versiune restaurată",
        description:
          "Am creat o ciornă nouă; versiunea publicată nu s-a schimbat. Istoricul de anulare pornește de aici.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Versiunea nu a fost restaurată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const refreshSyncPreview = async () => {
    if (!currentWorkspace || !site) return;
    if (activeVariantId) {
      toast({
        title: "Compară invitația de bază",
        description:
          "Datele conectate se aplică bazei, apoi variantele moștenesc schimbarea.",
        variant: "info",
      });
      return;
    }
    setWorkflowBusy(true);
    try {
      setSyncPreview(
        await weddingOsApi.invitationSyncPreview(currentWorkspace.id),
      );
    } catch (caught) {
      toast({
        title: "Diferențele nu au putut fi verificate",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const applySync = async (paths: InvitationSyncPath[]) => {
    if (!currentWorkspace || !site || !syncPreview || activeVariantId) return;
    setWorkflowBusy(true);
    try {
      const updated = await weddingOsApi.applyInvitationSync(
        currentWorkspace.id,
        site.version,
        { sourceRevision: syncPreview.sourceRevision, paths },
      );
      const next = snapshotFromPersisted(
        updated.draft?.document.sections,
        updated.draft?.settings as Parameters<typeof snapshotFromPersisted>[1],
      );
      setSite(updated);
      setBaseSnapshot(next);
      setSnapshot(next);
      setDirty(false);
      setHistoryState(createInvitationHistory());
      setSyncPreview(
        await weddingOsApi.invitationSyncPreview(currentWorkspace.id),
      );
      toast({
        title: "Ciorna a fost actualizată",
        description: `${paths.length} diferențe au fost aplicate. Invitația publică nu s-a schimbat, iar istoricul de anulare pornește de aici.`,
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Diferențele nu au fost aplicate",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorkflowBusy(false);
    }
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

  const experienceCoverUrl = resolveMedia(
    snapshot.experience.coverMediaId ?? "",
    snapshot.experience.coverImageUrl ?? "",
  );

  const openRevealPreview = () => {
    setInspectorTab("experience");
    setInspectorOpen(false);
    setRevealPreviewOpen(true);
  };

  const publish = async () => {
    if (!currentWorkspace || demoMode || !canPublish) return;
    if (readiness.completed !== readiness.total) {
      setPublishOpen(false);
      setInspectorTab("publish");
      toast({
        title: "Invitația nu este încă pregătită",
        description:
          "Înlocuiește exemplele demonstrative și completează verificările înainte de publicare.",
        variant: "warning",
      });
      return;
    }
    const latest = dirty || !site?.draft ? await saveDraft() : site;
    if (!latest) return;
    setSaving(true);
    try {
      const checked = await weddingOsApi.invitationPreflight(
        currentWorkspace.id,
      );
      setPreflight(checked);
      if (!checked.ready) {
        setPublishOpen(false);
        setInspectorTab("publish");
        toast({
          title: "Invitația nu este încă pregătită",
          description:
            checked.errors[0]?.message ??
            "Rezolvă verificările de publicare și încearcă din nou.",
          variant: "warning",
        });
        return;
      }
      const published = await weddingOsApi.publishInvitation(
        currentWorkspace.id,
        latest.version,
      );
      setSite(published);
      const persistedBase = published.draft ?? published.published;
      const refreshedBase = snapshotFromPersisted(
        persistedBase?.document.sections,
        persistedBase?.settings as Parameters<typeof snapshotFromPersisted>[1],
      );
      try {
        const [variantData, versionData] = await Promise.all([
          weddingOsApi.invitationVariants(currentWorkspace.id),
          weddingOsApi.invitationVersions(currentWorkspace.id),
        ]);
        const refreshedActiveVariant = activeVariantId
          ? variantData.items.find(
              (variant) =>
                variant.id === activeVariantId && variant.status === "active",
            )
          : undefined;
        const refreshedSnapshot = refreshedActiveVariant
          ? applyInvitationVariant(
              refreshedBase,
              refreshedActiveVariant.draft?.overrides ??
                refreshedActiveVariant.published?.overrides,
            )
          : refreshedBase;
        setBaseSnapshot(refreshedBase);
        setVariants(variantData.items);
        setVersions(versionData.items);
        setActiveVariantId(refreshedActiveVariant?.id ?? null);
        setSnapshot(refreshedSnapshot);
        setSelectedId((current) =>
          refreshedSnapshot.sections.some((section) => section.id === current)
            ? current
            : (refreshedSnapshot.sections[0]?.id ?? ""),
        );
        setHistoryState(createInvitationHistory());
        setDirty(false);
        setLastSavedAt(new Date());
      } catch (refreshError) {
        setBaseSnapshot(refreshedBase);
        setSnapshot(refreshedBase);
        setVariants([]);
        setActiveVariantId(null);
        setHistoryState(createInvitationHistory());
        setDirty(false);
        setLoadAttempt((current) => current + 1);
        toast({
          title: "Publicată, se reîncarcă starea editorului",
          description: apiErrorMessage(refreshError),
          variant: "warning",
        });
      }
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

  const requestPublish = () => {
    setInspectorTab("publish");
    if (readiness.completed === readiness.total) {
      setPublishOpen(true);
      return;
    }
    if (permanentInspector) setInspectorPanelOpen(true);
    else setInspectorOpen(true);
    toast({
      title: "Mai sunt detalii de verificat",
      description:
        "Deschide Verificare și rezolvă elementele marcate înainte de a continua.",
      variant: "warning",
    });
  };

  React.useEffect(() => {
    const node = canvasScrollRef.current;
    if (!node) return;
    const style = window.getComputedStyle(node);
    setCanvasViewportWidth(
      node.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
    );
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number") setCanvasViewportWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  // Selecting from the structure rail should bring the section into view; a
  // click straight on the canvas must not move the ground under the cursor.
  const selectSectionFromRail = (id: string) => {
    setSelectedId(id);
    setSelectedContentKey(null);
    setInspectorTab("content");
    scrollRequestRef.current = id;
  };

  React.useEffect(() => {
    const id = scrollRequestRef.current;
    if (!id) return;
    scrollRequestRef.current = null;
    const target = canvasScrollRef.current?.querySelector<HTMLElement>(
      `[data-invitation-section-id="${cssAttributeValue(id)}"]`,
    );
    if (!target) return;
    target.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [selectedId]);

  React.useEffect(() => {
    if (!mobileEditor || !inspectorOpen) return;
    const timer = window.setTimeout(() => {
      const container = canvasScrollRef.current;
      if (!container) return;
      const section = container.querySelector<HTMLElement>(
        `[data-invitation-section-id="${cssAttributeValue(selectedId)}"]`,
      );
      const target = selectedContentKey
        ? section?.querySelector<HTMLElement>(
            `[data-invitation-content-key="${cssAttributeValue(selectedContentKey)}"]`,
          )
        : section;
      target?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [inspectorOpen, mobileEditor, selectedContentKey, selectedId]);

  const showInspectorTab = (tab: InspectorTab) => {
    setInspectorTab(tab);
    if (permanentInspector) setInspectorPanelOpen(true);
    else setInspectorOpen(true);
  };

  const openInvitationStructure = (tab: LeftPanelTab = "layers") => {
    setLeftPanelTab(tab);
    if (permanentStructure) {
      setStructurePanelOpen(true);
      return;
    }
    setSectionsOpen(true);
  };

  const toggleInvitationStructure = () => {
    setLeftPanelTab("layers");
    if (permanentStructure) {
      setStructurePanelOpen((open) => !open);
      return;
    }
    setSectionsOpen(true);
  };

  const toggleInspector = () => {
    if (permanentInspector) {
      setInspectorPanelOpen((open) => !open);
      return;
    }
    setInspectorOpen(true);
  };

  const runPreflightAction = (action: InvitationPreflightAction) => {
    if (action.kind === "route") {
      router.push(action.href);
      return;
    }
    if (action.kind === "workflow") {
      setInspectorOpen(false);
      setWorkflowOpen(true);
      return;
    }
    if (action.kind === "save") {
      void saveDraft();
      return;
    }
    if (action.kind === "starter-section") {
      const sectionId = invitationStarterSectionId(snapshot);
      if (!sectionId) return;
      setSelectedId(sectionId);
      setInspectorTab("content");
    }
  };

  const resolveReadinessCheck = (sectionId?: string) => {
    if (sectionId) {
      setSelectedId(sectionId);
      setInspectorTab("content");
      return;
    }
    setInspectorOpen(false);
    setAddOpen(true);
  };

  const fitZoom =
    canvasViewportWidth > 0
      ? Math.min(
          1,
          Math.max(canvasFitFloor, canvasViewportWidth / deviceWidths[device]),
        )
      : 1;
  const canvasZoom = zoom === "fit" ? fitZoom : zoom;
  const canvasWidth = deviceWidths[device] * canvasZoom;
  const canvasOverflows =
    canvasViewportWidth > 0 && canvasWidth > canvasViewportWidth + 1;
  const stepZoom = (delta: number) =>
    setZoom(
      Math.min(1.5, Math.max(0.25, Math.round((canvasZoom + delta) * 100) / 100)),
    );
  const renderInspector = (compact = false) => (
    <Inspector
      compact={compact}
      tab={inspectorTab}
      onTabChange={setInspectorTab}
      selected={selected}
      selectedContentKey={selectedContentKey}
      snapshot={snapshot}
      readiness={readiness}
      site={site}
      onUpdateSection={(update) =>
        selected && updateSection(selected.id, update)
      }
      onUpdateContent={updateContent}
      onUpdateContentMany={updateContentMany}
      onUpdateDesign={updateDesign}
      onUpdateExperience={updateExperience}
      coverPreviewUrl={experienceCoverUrl}
      onUploadExperienceCover={(file) =>
        void uploadInvitationImage(file, (mediaId) =>
          updateExperience({ coverMediaId: mediaId, coverImageUrl: null }),
        )
      }
      device={device}
      uploadingMedia={uploadingMedia}
      onUploadImage={uploadInvitationImage}
      onChooseTemplate={() => setTemplateOpen(true)}
      onOpenWorkflow={() => {
        setInspectorOpen(false);
        setWorkflowOpen(true);
      }}
      onResolveCheck={resolveReadinessCheck}
      onPublish={requestPublish}
      preflight={preflight}
      preflightBusy={preflightBusy}
      preflightError={preflightError}
      canPublish={canPublish}
      onPreflightAction={runPreflightAction}
      onPreviewReveal={openRevealPreview}
    />
  );

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
    <div className="flex h-[calc(100dvh-1rem)] min-h-[42rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface sm:h-[calc(100dvh-1.5rem)]">
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-2 sm:px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Înapoi la invitații"
          onClick={() => {
            if (dirty) setLeaveOpen(true);
            else router.push("/invitations");
          }}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1 border-l border-line pl-2 sm:pl-3 xl:flex-none">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-brand text-base font-semibold text-brand">
              <span className="sm:hidden">Studio</span>
              <span className="hidden sm:inline">Studio invitație</span>
            </h1>
            {saving ? (
              <Badge className="hidden md:inline-flex" variant="info" dot>
                Se salvează
              </Badge>
            ) : dirty ? (
              <Badge className="hidden md:inline-flex" variant="warning" dot>
                Nesalvat
              </Badge>
            ) : (
              <Badge className="hidden md:inline-flex" variant="success" dot>
                Salvat
              </Badge>
            )}
          </div>
          <p className="hidden text-xs text-faint xl:block">
            {activeVariant
              ? `Personalizare pentru: ${activeVariant.name}`
              : saving
                ? "Se creează o versiune sigură…"
                : dirty
                  ? "Modificări locale"
                  : lastSavedAt
                    ? `Salvat la ${lastSavedAt.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}`
                    : "Ciornă nouă"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <span className="sr-only" role="status" aria-live="polite">
            {saving
              ? "Se salvează invitația"
              : dirty
                ? "Invitația are modificări nesalvate"
                : "Invitația este salvată"}
          </span>
          <Tooltip content={permanentStructure && structurePanelOpen ? "Ascunde structura" : "Arată structura"}>
            <span className="hidden md:inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleInvitationStructure}
                aria-label={permanentStructure && structurePanelOpen ? "Ascunde structura invitației" : "Arată structura invitației"}
                aria-pressed={permanentStructure ? structurePanelOpen : undefined}
              >
                <LayoutPanelLeft className="size-4" aria-hidden />
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Anulează · Ctrl+Z">
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={undo}
                disabled={!historyState.past.length}
                aria-label="Anulează ultima modificare"
              >
                <Undo2 className="size-4" aria-hidden />
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Refă · Ctrl+Shift+Z">
            <span className="hidden min-[360px]:inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={redo}
                disabled={!historyState.future.length}
                aria-label="Refă modificarea anulată"
              >
                <Redo2 className="size-4" aria-hidden />
              </Button>
            </span>
          </Tooltip>
          <Button
            className="hidden xl:inline-flex"
            variant="ghost"
            size="sm"
            onClick={() => setTemplateOpen(true)}
          >
            <LayoutTemplate className="size-3.5" aria-hidden />
            Alege stilul
          </Button>
          <Button
            className="hidden min-[1440px]:inline-flex"
            variant="ghost"
            size="sm"
            onClick={() => setWorkflowOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Sincronizare și versiuni
          </Button>
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="icon-sm"
            onClick={toggleInspector}
            aria-label={permanentInspector && inspectorPanelOpen ? "Ascunde inspectorul" : "Deschide inspectorul"}
            aria-pressed={permanentInspector ? inspectorPanelOpen : undefined}
          >
            <PanelRight className="size-4" aria-hidden />
          </Button>
          <Button
            className="relative"
            variant="outline"
            size="icon-sm"
            aria-label={
              saving
                ? "Se salvează ciorna invitației"
                : dirty
                  ? "Salvează ciorna invitației, sunt modificări nesalvate"
                  : "Ciorna invitației este salvată"
            }
            loading={saving}
            disabled={!canWrite || demoMode}
            onClick={() => void saveDraft()}
          >
            <Save className="size-3.5" aria-hidden />
            <span
              className={cn(
                "absolute right-1 top-1 size-1.5 rounded-full",
                saving
                  ? "animate-pulse bg-info motion-reduce:animate-none"
                  : dirty
                    ? "bg-warning"
                    : "bg-success",
              )}
              aria-hidden
            />
          </Button>
          <Button
            size="sm"
            disabled={!canPublish || demoMode || saving}
            onClick={requestPublish}
          >
            Publică
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {permanentStructure ? (
          <DesktopToolRail
            activeTab={inspectorTab}
            leftPanelTab={leftPanelTab}
            structureOpen={structurePanelOpen}
            onStructure={() => {
              if (structurePanelOpen && leftPanelTab === "layers") {
                setStructurePanelOpen(false);
                return;
              }
              openInvitationStructure("layers");
            }}
            onAddSection={() => openInvitationStructure("blocks")}
            onTemplates={() => setTemplateOpen(true)}
            onContent={() => showInspectorTab("content")}
            onDesign={() => showInspectorTab("design")}
            onExperience={() => showInspectorTab("experience")}
            onReview={() => showInspectorTab("publish")}
            onWorkflow={() => setWorkflowOpen(true)}
          />
        ) : null}

        {permanentStructure && structurePanelOpen ? <aside className="hidden w-[210px] shrink-0 flex-col border-r border-line bg-surface lg:flex 2xl:w-[240px]" aria-label="Structura invitației">
          <CreativeRail
            tab={leftPanelTab}
            onTabChange={setLeftPanelTab}
            snapshot={snapshot}
            selectedId={selectedId}
            onSelect={selectSectionFromRail}
            onMove={moveSection}
            onReorder={reorderSection}
            onToggle={(section) =>
              updateSection(section.id, { visible: !section.visible })
            }
            onDuplicate={duplicateSection}
            onRemove={requestRemoveSection}
            onAddSection={addSection}
            onAddAdvanced={addAdvancedSection}
            structuralLocked={Boolean(activeVariantId)}
          />
        </aside> : null}

        <section
          className="flex min-w-0 flex-1 flex-col bg-sunken/60"
          aria-label="Canvasul editorului de invitații"
        >
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              <span className="text-xs text-muted">
                Previzualizare live · clic pe text pentru editare
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
                  label: <span className="hidden min-[360px]:inline">Desktop</span>,
                  ariaLabel: "Previzualizare desktop",
                  icon: <Monitor className="size-3.5" />,
                },
                {
                  value: "tablet",
                  label: <span className="hidden min-[360px]:inline">Tabletă</span>,
                  ariaLabel: "Previzualizare tabletă",
                  icon: <Tablet className="size-3.5" />,
                },
                {
                  value: "mobile",
                  label: <span className="hidden min-[360px]:inline">Mobil</span>,
                  ariaLabel: "Previzualizare mobilă",
                  icon: <Smartphone className="size-3.5" />,
                },
              ]}
            />
            <div className="flex items-center gap-1">
              <Tooltip content="Vezi cum se deschide invitația">
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Vezi animația de deschidere a invitației"
                    onClick={openRevealPreview}
                  >
                    <PlayCircle className="size-4" aria-hidden />
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content="Previzualizare la lățime reală">
                <span className="inline-flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Deschide previzualizarea mare"
                    onClick={() => setCanvasPreviewOpen(true)}
                  >
                    <Maximize2 className="size-4" aria-hidden />
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>
          <div className="hidden md:block lg:hidden">
            <EditorJourneyBar
              activeTab={inspectorTab}
              choosingStyle={templateOpen}
              onChooseStyle={() => setTemplateOpen(true)}
              onChooseOpening={() => showInspectorTab("experience")}
              onEditSections={() => openInvitationStructure("layers")}
              onPersonalize={() => showInspectorTab("design")}
              onReview={() => showInspectorTab("publish")}
            />
          </div>
          <EditorMobileQuickBar
            activeTab={inspectorTab}
            inspectorOpen={inspectorOpen}
            onSections={() => openInvitationStructure("layers")}
            onContent={() => showInspectorTab("content")}
            onDesign={() => showInspectorTab("design")}
            onExperience={() => showInspectorTab("experience")}
          />
          <div
            ref={canvasScrollRef}
            className="min-h-0 flex-1 overflow-auto px-3 py-5 sm:p-8"
          >
            {/* `w-fit min-w-full` keeps the canvas centered while it fits and
                makes both edges reachable once it is wider than the panel. */}
            <div className="mx-auto flex w-fit min-w-full flex-col">
              <div
                className="mx-auto flex min-w-0 items-center justify-between gap-3 px-1 pb-2 text-xs text-faint"
                style={{ width: canvasWidth }}
              >
                <span className="shrink-0">
                  {deviceWidths[device]} px
                  {canvasOverflows ? (
                    <span className="hidden sm:inline"> · derulează lateral</span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Micșorează previzualizarea"
                    disabled={canvasZoom <= 0.25}
                    onClick={() => stepZoom(-0.1)}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setZoom("fit")}
                    aria-label="Potrivește previzualizarea pe lățime"
                    className={cn(
                      "min-h-8 cursor-pointer rounded-md px-2 font-medium tabular-nums hover:bg-surface hover:text-ink",
                      zoom === "fit" && "text-brand",
                    )}
                  >
                    {Math.round(canvasZoom * 100)}%
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mărește previzualizarea"
                    disabled={canvasZoom >= 1.5}
                    onClick={() => stepZoom(0.1)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </Button>
                </div>
                <span className="hidden shrink-0 sm:inline">
                  {snapshot.sections.filter((section) => section.visible).length}{" "}
                  secțiuni vizibile
                </span>
              </div>
              <div
                className="mx-auto shrink-0"
                style={{ width: deviceWidths[device], zoom: canvasZoom }}
              >
                <InvitationCanvas
                  snapshot={snapshot}
                  selectedId={selectedId}
                  resolveMedia={resolveMedia}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setSelectedContentKey(null);
                    setInspectorTab("content");
                    if (permanentInspector) setInspectorPanelOpen(true);
                    else setInspectorOpen(true);
                  }}
                  activeContent={selectedContentKey ? { sectionId: selectedId, key: selectedContentKey } : null}
                  onContentFocus={(id, key, mode) => {
                    setSelectedId(id);
                    setSelectedContentKey(key);
                    setInspectorTab("content");
                    if (permanentInspector) setInspectorPanelOpen(true);
                    else if (mode === "structured" || mobileEditor)
                      setInspectorOpen(true);
                  }}
                  onUpdateSection={updateSection}
                  inlineEditing={!mobileEditor}
                  onUpdateContent={(sectionId, key, value) => {
                    const section = snapshot.sections.find(
                      (item) => item.id === sectionId,
                    );
                    if (section)
                      updateSection(sectionId, {
                        content: setInvitationContentValue(
                          section.content,
                          key,
                          value,
                        ),
                      });
                  }}
                />
              </div>
            </div>
          </div>
          {mobileEditor && inspectorOpen ? (
            <section
              className={cn(
                "flex shrink-0 flex-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]",
                mobileInspectorExpanded
                  ? "h-[min(72dvh,40rem)]"
                  : "h-[min(46dvh,26rem)]",
              )}
              aria-label="Ajustări pentru elementul selectat"
            >
              <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-line px-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                    Ajustezi acum
                  </p>
                  <p className="truncate text-sm font-semibold text-ink">
                    {inspectorTab === "content"
                      ? selected
                        ? invitationEditableField(
                            selected,
                            selectedContentKey ?? "",
                          )?.label ?? selected.label
                        : "Secțiunea selectată"
                      : inspectorTab === "design"
                        ? "Stilul invitației"
                        : inspectorTab === "experience"
                          ? "Deschiderea invitației"
                          : "Verificarea pentru publicare"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setMobileInspectorExpanded((expanded) => !expanded)
                  }
                  aria-label={
                    mobileInspectorExpanded
                      ? "Micșorează panoul de ajustări"
                      : "Extinde panoul de ajustări"
                  }
                  aria-pressed={mobileInspectorExpanded}
                >
                  {mobileInspectorExpanded ? (
                    <ChevronsDown className="size-4" aria-hidden />
                  ) : (
                    <ChevronsUp className="size-4" aria-hidden />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setInspectorOpen(false);
                    setMobileInspectorExpanded(false);
                  }}
                  aria-label="Închide ajustările"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {renderInspector(true)}
              </div>
            </section>
          ) : null}
        </section>

        {permanentInspector && inspectorPanelOpen ? (
          <aside className="hidden w-[300px] shrink-0 flex-col border-l border-line bg-surface xl:flex 2xl:w-[330px]" aria-label="Inspectorul invitației">
            {renderInspector()}
          </aside>
        ) : null}
      </div>

      <Drawer
        open={sectionsOpen}
        onClose={() => setSectionsOpen(false)}
        title="Structura invitației"
      >
        <EditorSectionsPanel
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={(id) => {
            selectSectionFromRail(id);
            setSectionsOpen(false);
            setInspectorOpen(true);
          }}
          onMove={moveSection}
          onReorder={reorderSection}
          onToggle={(section) =>
            updateSection(section.id, { visible: !section.visible })
          }
          onDuplicate={duplicateSection}
          onRemove={requestRemoveSection}
          onAdd={() => setAddOpen(true)}
          structuralLocked={Boolean(activeVariantId)}
        />
      </Drawer>

      <Drawer
        open={drawerInspector && inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title="Editează invitația"
      >
        {renderInspector()}
      </Drawer>

      <EditorRevealPreview
        open={revealPreviewOpen}
        onClose={() => setRevealPreviewOpen(false)}
        snapshot={snapshot}
        device={device}
        coverImageUrl={experienceCoverUrl}
        resolveMedia={resolveMedia}
      />

      <Modal
        open={canvasPreviewOpen}
        onClose={() => setCanvasPreviewOpen(false)}
        title="Experiența publică a invitatului"
        description="Verifică separat invitația curată, formularul RSVP și traseul dintre ele."
        size="full"
      >
        <div className="mb-4 flex justify-center">
          <SegmentedControl
            ariaLabel="Suprafață publică previzualizată"
            value={publicPreviewMode}
            onChange={setPublicPreviewMode}
            options={[
              { value: "invitation", label: "Invitație" },
              { value: "rsvp", label: "RSVP" },
              { value: "flow", label: "Flux complet" },
            ]}
          />
        </div>
        <div className="overflow-auto rounded-xl bg-sunken p-2 sm:p-4">
          <div className="mx-auto" style={{ width: deviceWidths[device] }}>
            {publicPreviewMode === "invitation" ? (
              <div className="overflow-hidden rounded-xl shadow-overlay">
                <InvitationRenderer
                  snapshot={snapshot}
                  resolveMedia={resolveMedia}
                  rsvpHref="#preview-rsvp"
                />
              </div>
            ) : publicPreviewMode === "rsvp" ? (
              <EditorRsvpPublicPreview snapshot={snapshot} />
            ) : (
              <EditorGuestFlowPreview />
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={workflowOpen}
        onClose={() => setWorkflowOpen(false)}
        title="Sincronizare, grupuri și versiuni"
        description="Actualizează datele din eveniment, creează personalizări pentru grupuri și revino la o versiune anterioară."
        size="lg"
      >
        <EditorWorkflowPanel
          variants={variants}
          activeVariantId={activeVariantId}
          versions={versions}
          syncPreview={syncPreview}
          busy={workflowBusy}
          onSelectVariant={(variantId) => void selectVariant(variantId)}
          onCreateVariant={() => {
            setWorkflowOpen(false);
            setVariantCreateOpen(true);
          }}
          onArchiveVariant={(variant) => {
            setWorkflowOpen(false);
            setVariantToArchive(variant);
          }}
          onRestoreVersion={(version) => {
            setWorkflowOpen(false);
            setVersionToRestore(version);
          }}
          onRefreshSync={() => void refreshSyncPreview()}
          onApplySync={(paths) => void applySync(paths)}
        />
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Adaugă o secțiune"
        description="Alege ce informație vrei să adaugi. Secțiunile existente se selectează și se organizează din Structură."
        size="lg"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {sectionCatalog.map((entry) => {
            const Icon = invitationSectionIcons[entry.type];
            return (
              <button
                key={entry.type}
                onClick={() => addSection(entry.type)}
                aria-label={`Adaugă secțiunea ${entry.label}`}
                title={`Adaugă secțiunea ${entry.label}`}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-subtle text-brand-strong group-hover:bg-surface">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {entry.description}
                  </span>
                </span>
                <Plus
                  className="ml-auto size-4 shrink-0 text-faint"
                  aria-hidden
                />
              </button>
            );
          })}
          {advancedBlockCatalog.map((entry) => {
            const Icon = invitationBlockIcons[entry.blockKind];
            return (
              <button
                key={entry.blockKind}
                onClick={() => addAdvancedSection(entry.blockKind)}
                aria-label={`Adaugă secțiunea ${entry.label}`}
                title={`Adaugă secțiunea ${entry.label}`}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent group-hover:bg-surface">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {entry.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {entry.description}
                  </span>
                </span>
                <Plus
                  className="ml-auto size-4 shrink-0 text-faint"
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Alege stilul invitației"
        description="Alege direcția de design de la care vrei să pornești. Textele și secțiunile tale rămân neschimbate."
        size="lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {invitationTemplates.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                commit({
                  ...snapshot,
                  design: { ...entry.design },
                  experience:
                    entry.id === "nocturne"
                      ? {
                          ...snapshot.experience,
                          enabled: true,
                          style: "envelope",
                          panelColor: "#3B183F",
                          backgroundColor: "#180F1C",
                          accentColor: "#F06449",
                          durationMs: 2300,
                        }
                      : snapshot.experience,
                });
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
                className="relative flex h-28 items-center justify-center overflow-hidden"
                style={{
                  backgroundColor: entry.design.background,
                  ...(entry.id === "nocturne"
                    ? {
                        backgroundImage:
                          'linear-gradient(90deg, rgb(24 15 28 / 32%), rgb(24 15 28 / 8%)), url("/invitation-art/nocturne-glass.webp")',
                        backgroundPosition: "center 64%",
                        backgroundSize: "cover",
                      }
                    : {}),
                }}
              >
                {entry.id === "nocturne" ? (
                  <span className="absolute left-2 top-2 bg-[#F06449] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#251629]">
                    Nou · cinematic
                  </span>
                ) : null}
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

      <Modal
        open={variantCreateOpen}
        onClose={() => setVariantCreateOpen(false)}
        title="Variantă nouă"
        description="Pornește din invitația de bază și păstrează numai diferențele pentru un anumit grup."
        size="sm"
      >
        <form className="space-y-4" onSubmit={createVariant}>
          <Field label="Numele variantei" required>
            <Input
              name="name"
              required
              maxLength={80}
              placeholder="Familie apropiată"
            />
          </Field>
          <Field
            label="Cod intern opțional"
            hint="Este folosit doar pentru organizare, nu apare în invitație."
          >
            <Input name="code" maxLength={80} placeholder="familie-apropiata" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setVariantCreateOpen(false)}
            >
              Renunță
            </Button>
            <Button
              type="submit"
              loading={workflowBusy}
              disabled={workflowBusy}
            >
              Creează varianta
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => router.push("/invitations")}
        title="Ieși fără să salvezi?"
        description="Modificările nesalvate din invitație se vor pierde. Rămâi în editor dacă vrei să le verifici sau să le salvezi."
        confirmLabel="Ieși din editor"
        destructive
      />

      <ConfirmDialog
        open={Boolean(sectionToRemove)}
        onClose={() => setSectionToRemove(null)}
        onConfirm={() => {
          if (sectionToRemove) removeSection(sectionToRemove.id);
          setSectionToRemove(null);
        }}
        title="Ștergi această secțiune?"
        description={
          sectionToRemove
            ? `Secțiunea „${sectionToRemove.label}” va fi eliminată din ciornă. Poți anula apoi modificarea din istoricul editorului.`
            : "Secțiunea va fi eliminată din ciornă."
        }
        confirmLabel="Șterge secțiunea"
        destructive
      />

      <ConfirmDialog
        open={Boolean(variantToArchive)}
        onClose={() => setVariantToArchive(null)}
        onConfirm={() => void archiveVariant()}
        title="Arhivezi varianta?"
        description={
          variantToArchive
            ? `${variantToArchive.name} nu mai apare în selector, iar istoricul rămâne păstrat.`
            : "Varianta va fi arhivată."
        }
        confirmLabel="Arhivează"
        destructive
        loading={workflowBusy}
      />

      <ConfirmDialog
        open={Boolean(versionToRestore)}
        onClose={() => setVersionToRestore(null)}
        onConfirm={() => void restoreVersion()}
        title="Restaurezi această versiune?"
        description={
          versionToRestore
            ? `Versiunea ${versionToRestore.versionNumber} devine o ciornă nouă. Invitația publicată și istoricul existent rămân neschimbate.`
            : "Se va crea o ciornă nouă."
        }
        confirmLabel="Restaurează în ciornă"
        loading={workflowBusy}
      />

      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
        title="Publici invitația?"
        description={`${readiness.completed} din ${readiness.total} verificări de conținut sunt complete. Ciorna va fi salvată înainte de publicare.`}
        confirmLabel="Publică"
        loading={saving}
      />
    </div>
  );
}

function DesktopToolRail({
  activeTab,
  leftPanelTab,
  structureOpen,
  onStructure,
  onAddSection,
  onTemplates,
  onContent,
  onDesign,
  onExperience,
  onReview,
  onWorkflow,
}: {
  activeTab: InspectorTab;
  leftPanelTab: LeftPanelTab;
  structureOpen: boolean;
  onStructure: () => void;
  onAddSection: () => void;
  onTemplates: () => void;
  onContent: () => void;
  onDesign: () => void;
  onExperience: () => void;
  onReview: () => void;
  onWorkflow: () => void;
}) {
  const primaryActions = [
    {
      label: "Structură",
      Icon: LayoutPanelLeft,
      onClick: onStructure,
      active: structureOpen && leftPanelTab === "layers",
    },
    {
      label: "Secțiuni",
      Icon: Plus,
      onClick: onAddSection,
      active: structureOpen && leftPanelTab === "blocks",
    },
    {
      label: "Stiluri",
      Icon: LayoutTemplate,
      onClick: onTemplates,
      active: false,
    },
  ] as const;
  const inspectorActions = [
    {
      label: "Text",
      Icon: PencilLine,
      onClick: onContent,
      active: activeTab === "content",
    },
    {
      label: "Design",
      Icon: Palette,
      onClick: onDesign,
      active: activeTab === "design",
    },
    {
      label: "Plic",
      Icon: PlayCircle,
      onClick: onExperience,
      active: activeTab === "experience",
    },
    {
      label: "Verifică",
      Icon: Check,
      onClick: onReview,
      active: activeTab === "publish",
    },
  ] as const;

  const renderAction = ({
    label,
    Icon,
    onClick,
    active,
  }: (typeof primaryActions)[number] | (typeof inspectorActions)[number]) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        "group relative flex min-h-[58px] w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold leading-none transition-colors",
        active
          ? "bg-brand-softer text-brand-strong"
          : "text-faint hover:bg-subtle hover:text-ink",
      )}
    >
      {active ? (
        <span
          className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-brand"
          aria-hidden
        />
      ) : null}
      <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="hidden w-16 shrink-0 flex-col border-r border-line bg-surface lg:flex" aria-label="Instrumentele studioului">
      <nav className="flex min-h-0 flex-1 flex-col" aria-label="Instrumente editor">
        <div className="border-b border-line py-1">
          {primaryActions.map(renderAction)}
        </div>
        <div className="py-1">{inspectorActions.map(renderAction)}</div>
        <div className="mt-auto border-t border-line py-1">
          <button
            type="button"
            onClick={onWorkflow}
            className="flex min-h-[58px] w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold leading-none text-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <SlidersHorizontal className="size-[18px]" strokeWidth={1.8} aria-hidden />
            <span>Versiuni</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}

function EditorMobileQuickBar({
  activeTab,
  inspectorOpen,
  onSections,
  onContent,
  onDesign,
  onExperience,
}: {
  activeTab: InspectorTab;
  inspectorOpen: boolean;
  onSections: () => void;
  onContent: () => void;
  onDesign: () => void;
  onExperience: () => void;
}) {
  const actions = [
    ["Secțiuni", LayoutPanelLeft, onSections, false],
    ["Editează", PencilLine, onContent, inspectorOpen && activeTab === "content"],
    ["Stil", Palette, onDesign, inspectorOpen && activeTab === "design"],
    [
      "Deschidere",
      PlayCircle,
      onExperience,
      inspectorOpen && activeTab === "experience",
    ],
  ] as const;

  return (
    <nav
      className="grid shrink-0 grid-cols-4 border-b border-line bg-surface md:hidden"
      aria-label="Instrumente rapide pentru invitație"
    >
      {actions.map(([label, Icon, onClick, active]) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-pressed={active || undefined}
          className={cn(
            "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 px-1 text-[11px] font-semibold transition-colors",
            active
              ? "border-brand bg-brand-softer/60 text-brand-strong"
              : "border-transparent text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function EditorJourneyBar({
  activeTab,
  choosingStyle,
  onChooseStyle,
  onChooseOpening,
  onEditSections,
  onPersonalize,
  onReview,
}: {
  activeTab: InspectorTab;
  choosingStyle: boolean;
  onChooseStyle: () => void;
  onChooseOpening: () => void;
  onEditSections: () => void;
  onPersonalize: () => void;
  onReview: () => void;
}) {
  const steps = [
    {
      label: "Alege stilul",
      compactLabel: "Stil",
      description: "Direcția vizuală",
      active: choosingStyle,
      onClick: onChooseStyle,
    },
    {
      label: "Deschiderea",
      compactLabel: "Deschidere",
      description: "Plic, panouri sau direct",
      active: activeTab === "experience",
      onClick: onChooseOpening,
    },
    {
      label: "Secțiunile",
      compactLabel: "Secțiuni",
      description: "Ordine și conținut",
      active: activeTab === "content" && !choosingStyle,
      onClick: onEditSections,
    },
    {
      label: "Personalizează",
      compactLabel: "Design",
      description: "Culori și tipografie",
      active: activeTab === "design" && !choosingStyle,
      onClick: onPersonalize,
    },
    {
      label: "Verifică",
      compactLabel: "Publicare",
      description: "Previzualizare și publicare",
      active: activeTab === "publish" && !choosingStyle,
      onClick: onReview,
    },
  ];

  return (
    <nav
      className="shrink-0 border-b border-line bg-subtle/55 px-2 py-2"
      aria-label="Pașii recomandați pentru construirea invitației"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
        {steps.map((step, index) => (
          <button
            key={step.label}
            type="button"
            onClick={step.onClick}
            aria-label={`${step.label}: ${step.description}`}
            aria-current={step.active ? "step" : undefined}
            className={cn(
              "flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1 text-center transition-colors 2xl:min-h-12 2xl:flex-row 2xl:gap-2 2xl:px-3 2xl:text-left",
              step.active
                ? "bg-surface text-brand-strong shadow-card"
                : "text-muted hover:bg-surface/70 hover:text-ink",
            )}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold 2xl:size-6 2xl:text-xs",
                step.active
                  ? "bg-brand text-on-brand"
                  : "bg-surface text-faint",
              )}
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block w-full truncate text-[10px] font-semibold leading-tight min-[360px]:text-[11px] sm:hidden">
                {step.compactLabel}
              </span>
              <span className="hidden text-xs font-semibold leading-tight sm:block">
                {step.label}
              </span>
              <span className="mt-0.5 hidden text-xs leading-tight text-faint 2xl:block">
                {step.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function CreativeRail({
  tab,
  onTabChange,
  snapshot,
  selectedId,
  onSelect,
  onMove,
  onReorder,
  onToggle,
  onDuplicate,
  onRemove,
  onAddSection,
  onAddAdvanced,
  structuralLocked,
}: {
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (id: string, toIndex: number) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddSection: (type: InvitationSectionType) => void;
  onAddAdvanced: (blockKind: InvitationBlockKind) => void;
  structuralLocked: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 border-b border-line p-2">
        <button
          type="button"
          onClick={() => onTabChange("layers")}
          className={cn(
            "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            tab === "layers"
              ? "bg-brand text-on-brand"
              : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <LayoutPanelLeft className="size-3.5" />
          Structură
        </button>
        <button
          type="button"
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
      </div>
      {structuralLocked ? (
        <p className="border-b border-line bg-info-soft px-3 py-2 text-xs leading-relaxed text-info">
          Editezi o variantă. Adăugarea, ștergerea și ordinea secțiunilor se
          schimbă numai în invitația de bază.
        </p>
      ) : null}
      {tab === "blocks" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="text-sm font-semibold text-ink">Adaugă o secțiune</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Alege ce informație vrei să apară în invitație. Secțiunile existente
            se organizează din Structură.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {sectionCatalog.map((entry) => {
              const Icon = invitationSectionIcons[entry.type];
              return (
                <button
                  key={entry.type}
                  disabled={structuralLocked}
                  onClick={() => onAddSection(entry.type)}
                  aria-label={`Adaugă secțiunea ${entry.label}`}
                  title={`Adaugă secțiunea ${entry.label}`}
                  className="group flex min-h-24 cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-lg bg-subtle text-brand-strong group-hover:bg-surface">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <Plus className="size-4 text-faint" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold leading-tight text-ink">
                    {entry.label}
                  </span>
                </button>
              );
            })}
            {advancedBlockCatalog.map((entry) => {
              const Icon = invitationBlockIcons[entry.blockKind];
              return (
                <button
                  key={entry.blockKind}
                  disabled={structuralLocked}
                  onClick={() => onAddAdvanced(entry.blockKind)}
                  aria-label={`Adaugă secțiunea ${entry.label}`}
                  title={`Adaugă secțiunea ${entry.label}`}
                  className="group flex min-h-24 cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand-softer disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent group-hover:bg-surface">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <Plus className="size-4 text-faint" aria-hidden />
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
        <EditorSectionsPanel
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
          onReorder={onReorder}
          onToggle={onToggle}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onAdd={() => onTabChange("blocks")}
          structuralLocked={structuralLocked}
        />
      )}
    </div>
  );
}

function Inspector({
  compact = false,
  tab,
  onTabChange,
  selected,
  selectedContentKey,
  snapshot,
  readiness,
  site,
  onUpdateSection,
  onUpdateContent,
  onUpdateContentMany,
  onUpdateDesign,
  onUpdateExperience,
  coverPreviewUrl,
  onUploadExperienceCover,
  device,
  uploadingMedia,
  onUploadImage,
  onChooseTemplate,
  onOpenWorkflow,
  onResolveCheck,
  onPublish,
  preflight,
  preflightBusy,
  preflightError,
  canPublish,
  onPreflightAction,
  onPreviewReveal,
}: {
  compact?: boolean;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  selected?: InvitationSection;
  selectedContentKey: string | null;
  snapshot: InvitationEditorSnapshot;
  readiness: ReturnType<typeof invitationReadiness>;
  site: InvitationSiteResource | null;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
  onUpdateContent: (key: string, value: unknown) => void;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
  onUpdateDesign: (update: Partial<InvitationDesign>) => void;
  onUpdateExperience: (update: Partial<InvitationExperienceSettings>) => void;
  coverPreviewUrl: string;
  onUploadExperienceCover: (file: File) => void;
  device: Device;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onChooseTemplate: () => void;
  onOpenWorkflow: () => void;
  onResolveCheck: (sectionId?: string) => void;
  onPublish: () => void;
  preflight: InvitationPreflightResource | null;
  preflightBusy: boolean;
  preflightError: string;
  canPublish: boolean;
  onPreflightAction: (action: InvitationPreflightAction) => void;
  onPreviewReveal: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact ? <div className="grid grid-cols-4 border-b border-line bg-surface px-2 pt-2">
        {(
          [
            ["content", "Secțiune", "Editează secțiunea selectată"],
            ["design", "Stil", "Personalizează stilul vizual"],
            ["experience", "Deschidere", "Alege cum se deschide invitația"],
            ["publish", "Verificare", "Verifică și publică invitația"],
          ] as Array<[InspectorTab, string, string]>
        ).map(([value, label, ariaLabel]) => (
          <button
            key={value}
            type="button"
            onClick={() => onTabChange(value)}
            aria-label={ariaLabel}
            aria-current={tab === value ? "page" : undefined}
            className={cn(
              "min-h-11 cursor-pointer border-b-2 px-1 py-2 text-[11px] font-semibold transition-colors 2xl:px-2 2xl:text-xs",
              tab === value
                ? "border-brand text-brand-strong"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div> : null}
      {!compact ? <div className="border-b border-line px-3 py-2 sm:hidden">
        <Button
          className="w-full"
          variant="ghost"
          size="sm"
          onClick={onOpenWorkflow}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Sincronizare și versiuni
        </Button>
      </div> : null}
      <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto">
        {tab === "content" && selected && (
          <SectionInspector
            compact={compact}
            section={selected}
            design={snapshot.design}
            selectedContentKey={selectedContentKey}
            device={device}
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
        {tab === "experience" && (
          <InvitationExperiencePanel
            experience={snapshot.experience}
            onChange={onUpdateExperience}
            uploading={uploadingMedia}
            onUploadCover={onUploadExperienceCover}
            coverPreviewUrl={coverPreviewUrl}
            onPreviewReveal={onPreviewReveal}
          />
        )}
        {tab === "publish" && (
          <div className="space-y-6 p-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">
                  Verifică înainte de publicare
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
                  <li key={check.label}>
                    {check.done ? (
                      <div className="flex min-h-11 items-center gap-2 text-sm">
                        <span className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
                          <Check className="size-3" aria-hidden />
                        </span>
                        <span className="text-ink">{check.label}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onResolveCheck(check.sectionId)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm text-muted hover:bg-warning-soft hover:text-ink"
                      >
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
                          <PencilLine className="size-3" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">{check.label}</span>
                        <span className="text-xs font-semibold text-brand">
                          Rezolvă
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <PreflightPanel
              preflight={preflight}
              busy={preflightBusy}
              error={preflightError}
              canPublish={canPublish}
              onAction={onPreflightAction}
            />
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
            <Button
              className="w-full"
              disabled={
                readiness.completed !== readiness.total ||
                (preflight !== null && !preflight.ready)
              }
              onClick={onPublish}
            >
              Verifică și publică
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreflightPanel({
  preflight,
  busy,
  error,
  canPublish,
  onAction,
}: {
  preflight: InvitationPreflightResource | null;
  busy: boolean;
  error: string;
  canPublish: boolean;
  onAction: (action: InvitationPreflightAction) => void;
}) {
  if (!canPublish)
    return (
      <div className="rounded-xl border border-line bg-subtle/50 p-3">
        <p className="text-xs font-semibold text-ink">
          Verificările serverului cer drept de publicare
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Poți edita și salva invitația. Verificarea completă și publicarea sunt
          făcute de cine are dreptul de publicare în acest spațiu.
        </p>
      </div>
    );

  if (error)
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft p-3">
        <p className="text-xs font-semibold text-ink">
          Verificările serverului nu au putut fi rulate
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{error}</p>
      </div>
    );

  if (busy || !preflight)
    return (
      <div className="rounded-xl border border-line bg-subtle/50 p-3">
        <p className="text-xs font-semibold text-ink">
          {busy ? "Se verifică pe server…" : "Verificările serverului"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {busy
            ? "Confirmăm formularul RSVP, momentele vizibile invitaților și imaginile folosite."
            : "Pornesc automat imediat ce ciorna e salvată."}
        </p>
      </div>
    );

  const issues = [
    ...preflight.errors.map((issue) => ({ issue, blocking: true })),
    ...preflight.warnings.map((issue) => ({ issue, blocking: false })),
  ];

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border p-3",
          preflight.ready
            ? "border-success/30 bg-success-soft"
            : "border-warning/30 bg-warning-soft",
        )}
      >
        <p className="text-xs font-semibold text-ink">
          {preflight.ready
            ? "Serverul confirmă că invitația poate fi publicată"
            : `${preflight.errors.length} ${preflight.errors.length === 1 ? "blocaj" : "blocaje"} de publicare`}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {preflight.assignedRecipients} destinatari ·{" "}
          {preflight.activeVariants} variante active
        </p>
      </div>
      {issues.map(({ issue, blocking }, index) => {
        const guide = invitationPreflightGuide(issue.code, issue.message);
        return (
          <div
            key={`${issue.code}-${index}`}
            className={cn(
              "rounded-xl border p-3",
              blocking
                ? "border-danger/30 bg-danger-soft"
                : "border-line bg-subtle/50",
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                  blocking
                    ? "bg-danger/15 text-danger"
                    : "bg-warning-soft text-warning",
                )}
              >
                <CircleHelp className="size-3" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink">{guide.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {guide.detail}
                </p>
                {guide.action.kind !== "none" ? (
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction(guide.action)}
                  >
                    {guide.action.label}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionInspector({
  compact = false,
  section,
  design,
  selectedContentKey,
  device,
  uploadingMedia,
  onUploadImage,
  onUpdateSection,
  onUpdateContent,
  onUpdateContentMany,
}: {
  compact?: boolean;
  section: InvitationSection;
  design: InvitationDesign;
  selectedContentKey: string | null;
  device: Device;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
  onUpdateContent: (key: string, value: unknown) => void;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
}) {
  const fields = invitationEditableFields(section);
  const activeContentKey =
    selectedContentKey ?? fields.find((field) => field.direct)?.path ?? null;
  return (
    <div className={cn(compact ? "space-y-3 p-3" : "space-y-5 p-4")}>
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-brand-softer text-brand-strong">
          {React.createElement(invitationSectionIcon(section), {
            className: "size-4",
            "aria-hidden": true,
          })}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{section.label}</p>
          <p className="text-xs text-muted">
            {compact
              ? "Editare în panou · previzualizare live"
              : "Editare live în canvas"}
          </p>
        </div>
        <Switch
          checked={section.visible}
          onCheckedChange={(visible) => onUpdateSection({ visible })}
          aria-label={`Afișează secțiunea ${section.label} în invitație`}
        />
      </div>
      {selectedContentKey && !compact ? (
        <div className="rounded-lg border border-brand/20 bg-brand-softer/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-strong">
            Element selectat
          </p>
          <p className="mt-0.5 text-sm font-medium text-ink">
            {invitationEditableField(section, selectedContentKey)?.label ??
              "Text din invitație"}
          </p>
        </div>
      ) : null}
      {activeContentKey ? (
        <ContextualTextControls
          key={`${section.id}:${activeContentKey}:${device}`}
          compact={compact}
          section={section}
          design={design}
          contentKey={activeContentKey}
          device={device}
          uploadingMedia={uploadingMedia}
          onUploadImage={onUploadImage}
          onUpdateContent={onUpdateContent}
          onUpdateContentMany={onUpdateContentMany}
          onUpdateSection={onUpdateSection}
        />
      ) : null}
      <details className="rounded-xl border border-line bg-subtle/30 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Toate câmpurile secțiunii
        </summary>
        <div className="mt-4 space-y-4">
          <Field label="Numele secțiunii" hint="Este vizibil doar în editor.">
            <Input
              value={section.label}
              onChange={(event) => onUpdateSection({ label: event.target.value })}
            />
          </Field>
          <ContentFields
            section={section}
            selectedContentKey={selectedContentKey}
            uploadingMedia={uploadingMedia}
            onUploadImage={onUploadImage}
            onUpdate={onUpdateContent}
            onUpdateMany={onUpdateContentMany}
            onUpdateSection={onUpdateSection}
          />
        </div>
      </details>
      <div className="border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Compoziție</p>
        </div>
        {section.type !== "hero" ? (
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
        ) : null}
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
          uploading={uploadingMedia}
          onUploadImage={onUploadImage}
          onUpdateContentMany={onUpdateContentMany}
        />
      </div>
      <EditorLayerStudio
        section={section}
        device={device}
        uploading={uploadingMedia}
        onUpdateContent={onUpdateContent}
        onUploadImage={onUploadImage}
      />
    </div>
  );
}

type ContextualControlTab = "text" | "spacing" | "image";
type TextStyleDeviceScope = "all" | InvitationDevice;
type TextElementStyle = {
  fontSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  offsetX?: number;
  offsetY?: number;
  width?: number;
  align?: "left" | "center" | "right";
};

function ContextualTextControls({
  compact = false,
  section,
  design,
  contentKey,
  device,
  uploadingMedia,
  onUploadImage,
  onUpdateContent,
  onUpdateContentMany,
  onUpdateSection,
}: {
  compact?: boolean;
  section: InvitationSection;
  design: InvitationDesign;
  contentKey: string;
  device: InvitationDevice;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdateContent: (key: string, value: unknown) => void;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
}) {
  const [tab, setTab] = React.useState<ContextualControlTab>("text");
  const [scope, setScope] = React.useState<"element" | "section">("element");
  const [deviceScope, setDeviceScope] =
    React.useState<TextStyleDeviceScope>(device);
  const field = invitationEditableField(section, contentKey);
  const activeScope = compact ? "element" : scope;
  const rawValue = invitationContentValue(section.content, contentKey);
  const value = text(rawValue);
  const stylesValue =
    section.content.textStyles && typeof section.content.textStyles === "object"
      ? (section.content.textStyles as Record<string, unknown>)
      : {};
  const entry =
    stylesValue[contentKey] && typeof stylesValue[contentKey] === "object"
      ? (stylesValue[contentKey] as Record<string, unknown>)
      : {};
  const scopedStyle =
    entry[deviceScope] && typeof entry[deviceScope] === "object"
      ? (entry[deviceScope] as TextElementStyle)
      : {};
  const inheritedStyle =
    deviceScope !== "all" && entry.all && typeof entry.all === "object"
      ? (entry.all as TextElementStyle)
      : {};
  const defaults = defaultTextElementStyle(
    section,
    contentKey,
    deviceScope === "all" ? device : deviceScope,
    design,
  );
  const styleValue = <K extends keyof TextElementStyle>(key: K) =>
    (scopedStyle[key] ?? inheritedStyle[key] ?? defaults[key]) as NonNullable<
      TextElementStyle[K]
    >;
  const changed = (key: keyof TextElementStyle) => scopedStyle[key] !== undefined;
  const updateStyle = (update: Partial<TextElementStyle>) => {
    const nextStyles = structuredClone(stylesValue);
    const nextEntry =
      nextStyles[contentKey] && typeof nextStyles[contentKey] === "object"
        ? (nextStyles[contentKey] as Record<string, unknown>)
        : {};
    const nextScope =
      nextEntry[deviceScope] && typeof nextEntry[deviceScope] === "object"
        ? (nextEntry[deviceScope] as TextElementStyle)
        : {};
    nextEntry[deviceScope] = { ...nextScope, ...update };
    nextStyles[contentKey] = nextEntry;
    onUpdateContent("textStyles", nextStyles);
  };
  const resetStyle = (key?: keyof TextElementStyle) => {
    const nextStyles = structuredClone(stylesValue);
    const nextEntry =
      nextStyles[contentKey] && typeof nextStyles[contentKey] === "object"
        ? (nextStyles[contentKey] as Record<string, unknown>)
        : {};
    if (!key) delete nextEntry[deviceScope];
    else if (nextEntry[deviceScope] && typeof nextEntry[deviceScope] === "object") {
      const nextScope = { ...(nextEntry[deviceScope] as TextElementStyle) };
      delete nextScope[key];
      if (Object.keys(nextScope).length) nextEntry[deviceScope] = nextScope;
      else delete nextEntry[deviceScope];
    }
    if (Object.keys(nextEntry).length) nextStyles[contentKey] = nextEntry;
    else delete nextStyles[contentKey];
    onUpdateContent("textStyles", nextStyles);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-3 border-b border-line">
        {(
          [
            ["text", "Text"],
            ["spacing", "Spațiere"],
            ["image", "Imagine"],
          ] as Array<[ContextualControlTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "min-h-11 border-b-2 px-2 text-xs font-semibold",
              tab === value
                ? "border-brand bg-brand-softer/50 text-brand-strong"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-3">
        {tab !== "image" && compact ? (
          <div className="rounded-lg bg-subtle/60 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-ink">
                Ajustezi pe
              </span>
              <Select
                aria-label="Dispozitive pentru ajustare"
                value={deviceScope}
                onChange={(event) =>
                  setDeviceScope(event.target.value as TextStyleDeviceScope)
                }
                className="min-h-10 w-auto max-w-[12rem] text-xs"
              >
                <option value="mobile">Doar mobil</option>
                <option value="tablet">Doar tabletă</option>
                <option value="desktop">Doar desktop</option>
                <option value="all">Toate dispozitivele</option>
              </Select>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Modificările rămân pe {deviceLabel(deviceScope)}. Alege „Toate”
              numai când vrei aceeași valoare peste tot.
            </p>
          </div>
        ) : null}
        {tab !== "image" && !compact ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border border-line p-0.5">
              {(["element", "section"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={cn(
                    "min-h-11 rounded-md px-3 text-xs font-semibold",
                    activeScope === value
                      ? "bg-brand text-white"
                      : "text-muted hover:bg-subtle",
                  )}
                >
                  {value === "element" ? "Element" : "Secțiune"}
                </button>
              ))}
            </div>
            {activeScope === "element" ? (
              <div className="text-right">
                <Select
                  aria-label="Dispozitive pentru ajustare"
                  value={deviceScope}
                  onChange={(event) =>
                    setDeviceScope(event.target.value as TextStyleDeviceScope)
                  }
                  className="min-h-9 w-auto text-xs"
                >
                  <option value="all">Toate dispozitivele</option>
                  <option value="desktop">Doar desktop</option>
                  <option value="tablet">Doar tabletă</option>
                  <option value="mobile">Doar mobil</option>
                </Select>
                <p className="mt-1 text-[10px] text-faint">
                  Previzualizare: {deviceLabel(device)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "text" && activeScope === "element" ? (
          <>
            <Field
              label={field?.label ?? "Text"}
              hint={
                field?.direct
                  ? "Poți scrie aici sau direct în invitație."
                  : "Valoare structurată, editată în siguranță aici."
              }
            >
              {field?.kind === "multiline" ? (
                <Textarea
                  value={value}
                  onChange={(event) =>
                    onUpdateContent(contentKey, event.target.value)
                  }
                />
              ) : (
                <Input
                  type={
                    field?.kind === "time"
                      ? "time"
                      : field?.kind === "phone"
                        ? "tel"
                        : field?.kind === "url"
                          ? "url"
                          : field?.kind === "date-time" && value.includes("T")
                            ? "datetime-local"
                            : "text"
                  }
                  value={value}
                  onChange={(event) =>
                    onUpdateContent(contentKey, event.target.value)
                  }
                />
              )}
            </Field>
            <NumericStepper
              label="Mărimea textului"
              value={styleValue("fontSize")}
              min={8}
              max={160}
              step={1}
              suffix="px"
              changed={changed("fontSize")}
              onChange={(fontSize) => updateStyle({ fontSize })}
              onReset={() => resetStyle("fontSize")}
            />
            <div>
              <p className="mb-2 text-xs font-semibold text-ink">Aliniere</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["left", "Stânga", AlignLeft],
                    ["center", "Centru", AlignCenter],
                    ["right", "Dreapta", AlignRight],
                  ] as const
                ).map(([align, label, Icon]) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => updateStyle({ align })}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-medium",
                      styleValue("align") === align
                        ? "border-brand bg-brand-softer text-brand-strong"
                        : "border-line text-muted",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === "text" && activeScope === "section" ? (
          <SectionAlignmentControls section={section} onUpdate={onUpdateSection} />
        ) : null}

        {tab === "spacing" && activeScope === "element" ? (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Preseturi rapide
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["Compact", { letterSpacing: -1, lineHeight: 1, width: 92 }],
                    ["Normal", { letterSpacing: 0, lineHeight: 1.2, width: 100 }],
                    ["Aerisit", { letterSpacing: 1, lineHeight: 1.5, width: 100 }],
                  ] as const
                ).map(([label, preset]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => updateStyle(preset)}
                    className="min-h-11 rounded-lg border border-line px-2 text-xs font-semibold text-muted hover:border-brand hover:bg-brand-softer hover:text-brand-strong"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Apasă repetat sau ține apăsat pentru ajustare continuă.
              </p>
            </div>
            <NumericStepper label="Mută stânga / dreapta" value={styleValue("offsetX")} min={-240} max={240} step={2} suffix="px" changed={changed("offsetX")} onChange={(offsetX) => updateStyle({ offsetX })} onReset={() => resetStyle("offsetX")} />
            <NumericStepper label="Mută sus / jos" value={styleValue("offsetY")} min={-200} max={200} step={2} suffix="px" changed={changed("offsetY")} onChange={(offsetY) => updateStyle({ offsetY })} onReset={() => resetStyle("offsetY")} />
            <NumericStepper label="Spațiu între litere" value={styleValue("letterSpacing")} min={-8} max={20} step={0.5} suffix="px" changed={changed("letterSpacing")} onChange={(letterSpacing) => updateStyle({ letterSpacing })} onReset={() => resetStyle("letterSpacing")} />
            <NumericStepper label="Spațiu între rânduri" value={styleValue("lineHeight")} min={0.7} max={2.5} step={0.05} changed={changed("lineHeight")} onChange={(lineHeight) => updateStyle({ lineHeight })} onReset={() => resetStyle("lineHeight")} />
            <NumericStepper label="Lățimea textului" value={styleValue("width")} min={30} max={100} step={2} suffix="%" changed={changed("width")} onChange={(width) => updateStyle({ width })} onReset={() => resetStyle("width")} />
            <Button className="w-full" variant="ghost" size="sm" onClick={() => resetStyle()}>
              <RotateCcw className="size-3.5" aria-hidden />
              Resetează ajustările elementului
            </Button>
          </>
        ) : null}

        {tab === "spacing" && activeScope === "section" ? (
          <>
            <SectionAlignmentControls section={section} onUpdate={onUpdateSection} />
            <NumericStepper
              label="Spațiu vertical în secțiune"
              value={section.style.padding}
              min={16}
              max={120}
              step={4}
              suffix="px"
              changed={section.style.padding !== (section.type === "hero" ? 64 : 48)}
              onChange={(padding) =>
                onUpdateSection({ style: { ...section.style, padding } })
              }
              onReset={() =>
                onUpdateSection({
                  style: {
                    ...section.style,
                    padding: section.type === "hero" ? 64 : 48,
                  },
                })
              }
            />
          </>
        ) : null}

        {tab === "image" ? (
          <>
            {section.type === "hero" ? (
              <MediaUploader
                title="Schimbă imaginea principală"
                fileName={text(section.content.mediaName)}
                uploading={uploadingMedia}
                onFile={(file) =>
                  void onUploadImage(file, (mediaId, mediaName) =>
                    onUpdateContentMany({ mediaId, mediaName }),
                  )
                }
                onRemove={() =>
                  onUpdateContentMany({ mediaId: "", mediaName: "", coverImage: "" })
                }
              />
            ) : null}
            <SectionBackgroundControls
              section={section}
              onUpdateSection={onUpdateSection}
              uploading={uploadingMedia}
              onUploadImage={onUploadImage}
              onUpdateContentMany={onUpdateContentMany}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function SectionAlignmentControls({
  section,
  onUpdate,
}: {
  section: InvitationSection;
  onUpdate: (update: Partial<InvitationSection>) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-ink">Alinierea secțiunii</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["left", "Stânga", AlignLeft],
            ["center", "Centru", AlignCenter],
            ["right", "Dreapta", AlignRight],
          ] as const
        ).map(([align, label, Icon]) => (
          <button
            key={align}
            type="button"
            onClick={() =>
              onUpdate({ style: { ...section.style, align } })
            }
            className={cn(
              "flex min-h-11 items-center justify-center gap-1 rounded-lg border text-xs font-medium",
              section.style.align === align
                ? "border-brand bg-brand-softer text-brand-strong"
                : "border-line text-muted",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumericStepper({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  changed,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  changed: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const timeoutRef = React.useRef<number | null>(null);
  const intervalRef = React.useRef<number | null>(null);
  const currentValueRef = React.useRef(value);
  React.useEffect(() => {
    currentValueRef.current = value;
  }, [value]);
  const precision = String(step).split(".")[1]?.length ?? 0;
  const clamp = React.useCallback(
    (next: number) =>
      Number(Math.min(max, Math.max(min, next)).toFixed(precision)),
    [max, min, precision],
  );
  const adjust = React.useCallback(
    (direction: -1 | 1) => {
      const next = clamp(currentValueRef.current + direction * step);
      currentValueRef.current = next;
      onChange(next);
    },
    [clamp, onChange, step],
  );
  const stop = React.useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);
  React.useEffect(() => stop, [stop]);
  const begin = (direction: -1 | 1) => {
    adjust(direction);
    timeoutRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => adjust(direction), 90);
    }, 380);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">{label}</p>
        {changed ? (
          <button
            type="button"
            onClick={onReset}
            className="grid size-9 place-items-center rounded-md text-brand hover:bg-brand-softer"
            aria-label={`Revino la valoarea inițială pentru ${label}`}
            title="Revino la valoarea inițială"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className={cn("grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-lg border bg-surface", changed ? "border-brand/35" : "border-line")}>
        <button
          type="button"
          className="grid min-h-11 place-items-center border-r border-line text-ink hover:bg-subtle disabled:opacity-35"
          aria-label={`Micșorează ${label}`}
          disabled={value <= min}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            begin(-1);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onClick={(event) => {
            if (event.detail === 0) adjust(-1);
          }}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <div className="relative min-w-0">
          <input
            key={`${value}-${suffix}`}
            type="number"
            defaultValue={value}
            min={min}
            max={max}
            step={step}
            onBlur={(event) => {
              const next = Number(event.target.value);
              event.target.value = String(Number.isFinite(next) ? clamp(next) : value);
              if (Number.isFinite(next)) onChange(clamp(next));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = String(value);
                event.currentTarget.blur();
              }
            }}
            className="min-h-11 w-full appearance-none bg-transparent px-3 pr-10 text-center text-sm font-semibold tabular-nums text-ink outline-none focus:bg-brand-softer/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            aria-label={`${label}, valoare exactă`}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">
              {suffix}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="grid min-h-11 place-items-center border-l border-line text-ink hover:bg-subtle disabled:opacity-35"
          aria-label={`Mărește ${label}`}
          disabled={value >= max}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            begin(1);
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onClick={(event) => {
            if (event.detail === 0) adjust(1);
          }}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function defaultTextElementStyle(
  section: InvitationSection,
  contentKey: string,
  device: InvitationDevice,
  design: InvitationDesign,
): Required<TextElementStyle> {
  const isNames = section.type === "hero" && contentKey === "names";
  const isRootHeading = contentKey === "title";
  const isSmall =
    contentKey === "eyebrow" ||
    contentKey.includes(".detail") ||
    contentKey.includes(".answer") ||
    contentKey.includes(".caption");
  const heroHeadingMax = numberValue(section.content.headingSize, 76);
  const artDirection =
    section.content.artDirection &&
    typeof section.content.artDirection === "object"
      ? (section.content.artDirection as Record<string, unknown>)
      : {};
  const deviceArt =
    artDirection[device] && typeof artDirection[device] === "object"
      ? (artDirection[device] as Record<string, unknown>)
      : {};
  const defaultHeadingScale =
    device === "desktop" ? 100 : device === "tablet" ? 94 : 82;
  const headingScale = numberValue(
    deviceArt.headingScale,
    defaultHeadingScale,
  );
  const responsiveNamesSize = Math.min(
    heroHeadingMax,
    Math.max(
      38,
      (deviceWidths[device] * 0.1 * headingScale) / 100,
    ),
  );
  const rootHeadingSize = (() => {
    if (section.type === "hero")
      return device === "mobile" ? 20 : 24;
    if (design.template === "nocturne" && section.type === "story")
      return device === "desktop" ? 108 : device === "tablet" ? 69 : 48;
    if (
      design.template === "nocturne" &&
      (section.type === "schedule" ||
        section.type === "locations" ||
        section.type === "rsvp")
    )
      return device === "desktop" ? 88 : device === "tablet" ? 58 : 44;
    if (section.type === "countdown")
      return device === "mobile" ? 24 : 30;
    if (section.type === "story" || section.type === "rsvp")
      return device === "mobile" ? 30 : 36;
    return 30;
  })();
  const specialTextSize = (() => {
    if (design.template === "nocturne" && section.type === "story") {
      if (contentKey === "body")
        return device === "desktop" ? 19 : device === "tablet" ? 17 : 16;
      if (contentKey === "quote")
        return device === "desktop" ? 32 : device === "tablet" ? 26 : 22;
    }
    if (
      design.template === "nocturne" &&
      section.type === "schedule" &&
      contentKey.endsWith(".time")
    )
      return device === "desktop" ? 28 : device === "tablet" ? 23 : 20;
    return null;
  })();
  return {
    fontSize: isNames
      ? Math.round(responsiveNamesSize)
      : isRootHeading
        ? rootHeadingSize
        : specialTextSize ??
          (isSmall
            ? 12
            : 14),
    letterSpacing: isNames
      ? numberValue(section.content.namesLetterSpacing, -3)
      : 0,
    lineHeight: isNames
      ? numberValue(section.content.namesLineHeight, 94) / 100
      : 1.2,
    offsetX: 0,
    offsetY: 0,
    width: 100,
    align: section.style.align,
  };
}

function deviceLabel(device: TextStyleDeviceScope) {
  return device === "desktop"
    ? "desktop"
    : device === "tablet"
      ? "tabletă"
      : device === "mobile"
        ? "mobil"
        : "toate dispozitivele";
}

function ContentFields({
  section,
  selectedContentKey,
  uploadingMedia,
  onUploadImage,
  onUpdate,
  onUpdateMany,
  onUpdateSection,
}: {
  section: InvitationSection;
  selectedContentKey: string | null;
  uploadingMedia: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdate: (key: string, value: unknown) => void;
  onUpdateMany: (values: Record<string, unknown>) => void;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
}) {
  const c = section.content;
  const fieldClass = (key: string) =>
    cn(
      "rounded-lg transition-[background-color,box-shadow]",
      selectedContentKey === key &&
        "bg-brand-softer/70 ring-2 ring-brand/20 ring-offset-2",
    );
  const input = (key: string, label: string, placeholder?: string) => (
    <div data-content-field={key} className={fieldClass(key)}>
    <Field label={label}>
      <Input
        value={text(c[key])}
        placeholder={placeholder}
        onChange={(event) => onUpdate(key, event.target.value)}
      />
    </Field>
    </div>
  );
  const area = (key: string, label: string, placeholder?: string) => (
    <div data-content-field={key} className={fieldClass(key)}>
    <Field label={label}>
      <Textarea
        value={text(c[key])}
        placeholder={placeholder}
        onChange={(event) => onUpdate(key, event.target.value)}
      />
    </Field>
    </div>
  );
  const range = (
    key: string,
    label: string,
    min: number,
    max: number,
    fallback: number,
    step = 1,
    suffix = "px",
  ) => {
    const value = numberValue(c[key], fallback);
    return (
      <Field label={`${label} · ${value}${suffix}`}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onUpdate(key, Number(event.target.value))}
          className="min-h-11 w-full accent-[var(--brand)]"
        />
      </Field>
    );
  };
  if (section.type === "hero")
    return (
      <>
        <div className="rounded-xl bg-brand-softer p-3">
          <p className="text-sm font-semibold text-brand-strong">
            Textul copertei
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Editează aici sau direct în previzualizare. Enter confirmă, Shift +
            Enter adaugă un rând, iar Escape anulează editarea directă.
          </p>
          <div className="mt-4 space-y-3">
            {input("eyebrow", "Supratitlu", "De exemplu: Ne căsătorim")}
            <Field
              label="Numele sau titlul principal"
              hint="Poți separa numele pe rânduri diferite."
            >
              <Textarea
                rows={2}
                value={text(c.names)}
                onChange={(event) => onUpdate("names", event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {input("date", "Data afișată")}
              {input("venue", "Orașul sau locația")}
            </div>
            {area("title", "Mesajul principal")}
            {area("subtitle", "Introducerea")}
            {input("buttonLabel", "Textul butonului RSVP")}
          </div>
        </div>

        <div className="rounded-xl bg-subtle/70 p-3">
          <p className="text-sm font-semibold text-ink">
            Poziția blocului de text
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Alinierea mută textul la stânga, centru sau dreapta. Reglajele de
            mai jos fac ajustarea fină în interiorul copertei.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ["left", "Stânga", AlignLeft],
                ["center", "Centru", AlignCenter],
                ["right", "Dreapta", AlignRight],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  onUpdateSection({
                    style: { ...section.style, align: value },
                  })
                }
                aria-pressed={section.style.align === value}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold",
                  section.style.align === value
                    ? "border-brand bg-surface text-brand-strong"
                    : "border-line bg-surface/60 text-muted hover:border-line-strong",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
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
                  "h-16 cursor-pointer rounded-lg border px-2 text-xs font-semibold",
                  text(c.layout, "immersive") === value
                    ? "border-brand bg-brand-softer text-brand-strong"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Înălțimea copertei">
              <Select
                value={String(Number(c.heroHeight) || 620)}
                onChange={(event) =>
                  onUpdate("heroHeight", Number(event.target.value))
                }
              >
                <option value="480">Compactă</option>
                <option value="620">Cinematică</option>
                <option value="760">Ecran complet</option>
              </Select>
            </Field>
            <Field label="Poziția verticală">
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
          <div className="mt-3 space-y-2">
            {range("textWidth", "Lățimea zonei de text", 280, 960, 832, 8)}
            {range("textOffsetX", "Deplasare stânga / dreapta", -240, 240, 0, 4)}
            {range("textOffsetY", "Deplasare sus / jos", -200, 200, 0, 4)}
            {range("headingSize", "Mărimea numelor", 38, 96, 76)}
          </div>
        </div>

        <details className="rounded-xl bg-subtle/70 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Spațiere și ritm tipografic
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Controlează distanța dintre fiecare rând al copertei, fără spații
            artificiale introduse în text.
          </p>
          <div className="mt-3 space-y-2">
            {range("namesLineHeight", "Înălțime rând nume", 70, 140, 94, 1, "%")}
            {range("namesLetterSpacing", "Spațiu între litere", -8, 8, -3, 0.5)}
            {range("namesGap", "Înainte de nume", 0, 120, 16, 2)}
            {range("metaGap", "Înainte de dată și loc", 0, 120, 24, 2)}
            {range("titleGap", "Înainte de mesaj", 0, 120, 32, 2)}
            {range("subtitleGap", "Înainte de introducere", 0, 80, 12, 2)}
            {range("actionsGap", "Înainte de buton", 0, 100, 28, 2)}
          </div>
        </details>

        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Imaginea copertei</p>
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
        </div>
        <Field label="Poziția orizontală a imaginii">
          <input
            type="range"
            min="0"
            max="100"
            value={numberValue(c.focalX, 50)}
            onChange={(event) => onUpdate("focalX", Number(event.target.value))}
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <Field label="Poziția verticală a imaginii">
          <input
            type="range"
            min="0"
            max="100"
            value={numberValue(c.focalY, 50)}
            onChange={(event) => onUpdate("focalY", Number(event.target.value))}
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Culoarea stratului peste imagine"
            value={text(c.overlayColor, "#14251D")}
            onChange={(value) => onUpdate("overlayColor", value)}
          />
          <Field
            label={`Intensitatea stratului ${numberValue(c.overlayOpacity, 0)}%`}
          >
            <input
              type="range"
              min="0"
              max="85"
              value={numberValue(c.overlayOpacity, 0)}
              onChange={(event) =>
                onUpdate("overlayOpacity", Number(event.target.value))
              }
              className="min-h-11 w-full accent-[var(--brand)]"
            />
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted">
          Butonul duce automat la pagina RSVP separată. Lasă textul gol și
          ascunde secțiunea RSVP dacă invitația este doar informativă.
        </p>
        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Folosește o imagine dintr-un link extern
          </summary>
          <Field className="mt-2" label="Adresa imaginii (HTTPS)">
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
          selectedContentKey={selectedContentKey}
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
          selectedContentKey={selectedContentKey}
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
        <p className="text-xs leading-5 text-muted">
          În invitația publică, acest buton deschide formularul personal pe o
          pagină separată; formularul nu este afișat în invitație.
        </p>
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
          <p className="text-sm font-medium text-ink">
            Aranjarea galeriei
          </p>
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
                  "h-14 cursor-pointer rounded-lg border text-xs font-semibold",
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
          selectedContentKey={selectedContentKey}
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
          selectedContentKey={selectedContentKey}
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
          selectedContentKey={selectedContentKey}
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
  if (c.blockKind === "artwork")
    return (
      <>
        <MediaUploader
          title="Încarcă lucrarea"
          fileName={text(c.fileName)}
          uploading={uploadingMedia}
          onFile={(file) =>
            void onUploadImage(file, (mediaId, fileName) =>
              onUpdateMany({ mediaId, fileName }),
            )
          }
          onRemove={() => onUpdateMany({ mediaId: "", fileName: "", url: "" })}
        />
        {input("title", "Titlu")}
        {input("alt", "Descriere accesibilă")}
        {input("caption", "Legendă opțională")}
        <Field label="Imagine externă opțională">
          <Input
            type="url"
            value={text(c.url)}
            placeholder="https://…"
            onChange={(event) => onUpdate("url", event.target.value)}
          />
        </Field>
      </>
    );
  if (c.blockKind === "media_text")
    return (
      <>
        <MediaUploader
          title="Încarcă imaginea"
          fileName={text(c.fileName)}
          uploading={uploadingMedia}
          onFile={(file) =>
            void onUploadImage(file, (mediaId, fileName) =>
              onUpdateMany({ mediaId, fileName }),
            )
          }
          onRemove={() => onUpdateMany({ mediaId: "", fileName: "", url: "" })}
        />
        {input("title", "Titlu")}
        {area("body", "Text")}
        {input("alt", "Descriere accesibilă")}
        <Field label="Poziția imaginii">
          <Select
            value={text(c.mediaPosition, "left")}
            onChange={(event) => onUpdate("mediaPosition", event.target.value)}
          >
            <option value="left">Stânga</option>
            <option value="right">Dreapta</option>
          </Select>
        </Field>
        <Field label="Imagine externă opțională">
          <Input
            type="url"
            value={text(c.url)}
            placeholder="https://…"
            onChange={(event) => onUpdate("url", event.target.value)}
          />
        </Field>
      </>
    );
  if (c.blockKind === "video")
    return (
      <>
        <MediaUploader
          title="Încarcă posterul video"
          fileName={text(c.posterFileName)}
          uploading={uploadingMedia}
          onFile={(file) =>
            void onUploadImage(file, (posterMediaId, posterFileName) =>
              onUpdateMany({ posterMediaId, posterFileName }),
            )
          }
          onRemove={() =>
            onUpdateMany({
              posterMediaId: "",
              posterFileName: "",
              posterUrl: "",
            })
          }
        />
        {input("title", "Titlu")}
        <Field label="URL video">
          <Input
            type="url"
            value={text(c.url)}
            placeholder="https://…"
            onChange={(event) => onUpdate("url", event.target.value)}
          />
        </Field>
        {input("caption", "Subtitrare sau context")}
        <Field label="Poster extern opțional">
          <Input
            type="url"
            value={text(c.posterUrl)}
            placeholder="https://…"
            onChange={(event) => onUpdate("posterUrl", event.target.value)}
          />
        </Field>
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs leading-relaxed text-muted">
          Video-ul nu pornește automat. Invitatul decide când îl redă, iar
          posterul păstrează compoziția stabilă până atunci.
        </p>
      </>
    );
  if (c.blockKind === "divider")
    return (
      <>
        {input("ornament", "Ornament")}
        {input("label", "Mesaj scurt")}
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
  selectedContentKey,
}: {
  items: Array<Record<string, unknown>>;
  onChange: (items: Array<Record<string, unknown>>) => void;
  selectedContentKey: string | null;
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
          className={cn(
            "flex items-center gap-2 rounded-lg border p-2",
            selectedContentKey === `items.${index}.caption`
              ? "border-brand bg-brand-softer/60 ring-2 ring-brand/15"
              : "border-line",
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-subtle text-faint">
            <ImageIcon className="size-4" />
          </span>
          <Input
            className="h-9"
            data-content-field={`items.${index}.caption`}
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
          key={value}
          defaultValue={value.toUpperCase()}
          pattern="#[0-9A-Fa-f]{6}"
          title="Folosește formatul #RRGGBB, de exemplu #F06449"
          onBlur={(event) => commitHexInput(event, value, onChange)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = value.toUpperCase();
              event.currentTarget.blur();
            }
          }}
          className="h-full min-h-11 min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          aria-label={`${label} hex`}
        />
      </div>
    </Field>
  );
}

function SectionBackgroundControls({
  section,
  onUpdateSection,
  uploading,
  onUploadImage,
  onUpdateContentMany,
}: {
  section: InvitationSection;
  onUpdateSection: (update: Partial<InvitationSection>) => void;
  uploading: boolean;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
  onUpdateContentMany: (values: Record<string, unknown>) => void;
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
              "h-11 cursor-pointer rounded-md text-xs font-semibold",
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
        <>
          <MediaUploader
            title="Încarcă imaginea de fundal"
            fileName={text(section.content.backgroundFileName)}
            uploading={uploading}
            onFile={(file) =>
              void onUploadImage(
                file,
                (backgroundMediaId, backgroundFileName) =>
                  onUpdateContentMany({
                    backgroundMediaId,
                    backgroundFileName,
                  }),
              )
            }
            onRemove={() =>
              onUpdateContentMany({
                backgroundMediaId: "",
                backgroundFileName: "",
                backgroundImage: "",
              })
            }
          />
          <Field label="URL imagine externă opțională">
            <Input
              type="url"
              value={text(section.content.backgroundImage)}
              placeholder="https://…"
              onChange={(event) =>
                onUpdateContentMany({ backgroundImage: event.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label="Overlay"
              value={text(section.content.backgroundOverlayColor, "#19151D")}
              onChange={(backgroundOverlayColor) =>
                onUpdateContentMany({ backgroundOverlayColor })
              }
            />
            <Field
              label={`Opacitate ${numberValue(section.content.backgroundOverlayOpacity, 42)}%`}
            >
              <input
                className="min-h-11 w-full accent-[var(--brand)]"
                type="range"
                min="0"
                max="85"
                value={numberValue(
                  section.content.backgroundOverlayOpacity,
                  42,
                )}
                onChange={(event) =>
                  onUpdateContentMany({
                    backgroundOverlayOpacity: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Focal X ${numberValue(section.content.focalX, 50)}%`}
            >
              <input
                className="min-h-11 w-full accent-[var(--brand)]"
                type="range"
                min="0"
                max="100"
                value={numberValue(section.content.focalX, 50)}
                onChange={(event) =>
                  onUpdateContentMany({ focalX: Number(event.target.value) })
                }
              />
            </Field>
            <Field
              label={`Focal Y ${numberValue(section.content.focalY, 50)}%`}
            >
              <input
                className="min-h-11 w-full accent-[var(--brand)]"
                type="range"
                min="0"
                max="100"
                value={numberValue(section.content.focalY, 50)}
                onChange={(event) =>
                  onUpdateContentMany({ focalY: Number(event.target.value) })
                }
              />
            </Field>
          </div>
          <ColorField
            label="Culoare text"
            value={section.style.textColor || "#FFFFFF"}
            onChange={(textColor) => updateStyle({ textColor })}
          />
        </>
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
  selectedContentKey,
}: {
  label: string;
  items: Array<Record<string, unknown>>;
  fields: Array<[string, string]>;
  multiline?: string[];
  onChange: (items: Array<Record<string, unknown>>) => void;
  selectedContentKey: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">{label}</p>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-faint">
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
                  <div key={key} data-content-field={`items.${index}.${key}`} className={cn(selectedContentKey === `items.${index}.${key}` && "rounded-lg bg-brand-softer/70 ring-2 ring-brand/20 ring-offset-2")}><Field label={fieldLabel}>
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
                  </Field></div>
                ) : (
                  <div key={key} data-content-field={`items.${index}.${key}`} className={cn(selectedContentKey === `items.${index}.${key}` && "rounded-lg bg-brand-softer/70 ring-2 ring-brand/20 ring-offset-2")}><Field label={fieldLabel}>
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
                  </Field></div>
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
        <p className="text-sm font-medium text-ink">Paletă recomandată</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={colors.length >= 12}
          onClick={() =>
            onChange([...colors, nextInvitationPaletteColor(colors)])
          }
        >
          <Plus className="size-3.5" />
          Culoare
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {colors.map((color, index) => (
          <div
            key={`${color}-${index}`}
            className="rounded-xl border border-line p-1.5"
          >
            <label
              className="relative block min-h-11 cursor-pointer overflow-hidden rounded-lg border border-black/10 shadow-sm"
              style={{ backgroundColor: validColor(color) }}
            >
              <input
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                type="color"
                value={validColor(color)}
                aria-label={`Modifică nuanța recomandată ${index + 1}`}
                onChange={(event) =>
                  onChange(
                    colors.map((current, colorIndex) =>
                      colorIndex === index
                        ? event.target.value.toUpperCase()
                        : current,
                    ),
                  )
                }
              />
            </label>
            <div className="mt-1 flex min-h-11 items-center justify-between gap-1">
              <span className="truncate pl-1 font-mono text-xs uppercase text-muted">
                {color}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    colors.filter((_, colorIndex) => colorIndex !== index),
                  )
                }
                className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Șterge nuanța recomandată ${index + 1}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
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
            <p className="text-sm font-semibold text-ink">Stilul invitației</p>
            <p className="mt-0.5 text-xs text-muted">
              {
                invitationTemplates.find((item) => item.id === design.template)
                  ?.name
              }
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onChooseTemplate}>
            Alege alt stil
          </Button>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Paleta invitației</p>
            <p className="mt-0.5 text-xs text-muted">
              Apasă mostra pentru accent. Folosește creionul ca să schimbi
              culoarea.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={design.palette.length >= 12}
            onClick={() =>
              onUpdate({
                palette: [
                  ...design.palette,
                  nextInvitationPaletteColor(design.palette),
                ],
              })
            }
            aria-label="Adaugă o culoare în paletă"
          >
            <Plus className="size-3.5" />
            Culoare
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {design.palette.map((color, index) => {
            const active =
              design.accent.toLowerCase() === color.toLowerCase();
            return (
              <div
                key={`${index}-${color}`}
                className={cn(
                  "rounded-xl border p-1.5",
                  active ? "border-brand bg-brand-softer" : "border-line",
                )}
              >
                <button
                  type="button"
                  onClick={() => onUpdate({ accent: color })}
                  aria-label={`Aplică ${color} drept accent principal`}
                  aria-pressed={active}
                  className="relative grid min-h-11 w-full cursor-pointer place-items-center rounded-lg border border-black/10 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  style={{ backgroundColor: validColor(color) }}
                >
                  {active ? (
                    <span className="grid size-6 place-items-center rounded-full bg-surface/90 text-ink shadow-sm">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                </button>
                <p className="mt-1 truncate text-center font-mono text-xs uppercase text-muted">
                  {color}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <label className="relative grid min-h-11 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
                    <PencilLine className="size-3.5" aria-hidden />
                    <span className="sr-only">Modifică {color}</span>
                    <input
                      type="color"
                      value={validColor(color)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      aria-label={`Modifică culoarea ${index + 1}`}
                      onChange={(event) => {
                        const nextColor = event.target.value.toUpperCase();
                        onUpdate({
                          palette: design.palette.map(
                            (current, colorIndex) =>
                              colorIndex === index ? nextColor : current,
                          ),
                          ...(active ? { accent: nextColor } : {}),
                        });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={design.palette.length <= 2}
                    onClick={() =>
                      onUpdate(removeInvitationPaletteColor(design, index))
                    }
                    className="grid min-h-11 place-items-center rounded-lg text-muted enabled:cursor-pointer enabled:hover:bg-danger-soft enabled:hover:text-danger disabled:opacity-35"
                    aria-label={`Șterge culoarea ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
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
          <option value="display">Fraunces (editorial)</option>
          <option value="sans">Inter (modern)</option>
        </Select>
      </Field>
      <Field label="Spațiere între secțiuni">
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
            Stilul ales este doar punctul de pornire. Poți schimba liber
            culorile generale sau fundalul unei singure secțiuni. La
            publicare, textul și butoanele primesc automat un contrast sigur
            față de culorile alese.
          </p>
        </div>
      </div>
    </div>
  );
}

function InvitationCanvas({
  snapshot,
  selectedId,
  activeContent,
  inlineEditing,
  resolveMedia,
  onSelect,
  onContentFocus,
  onUpdateSection,
  onUpdateContent,
}: {
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  activeContent: { sectionId: string; key: string } | null;
  inlineEditing: boolean;
  resolveMedia: (mediaId: string, externalUrl?: string) => string;
  onSelect: (id: string) => void;
  onContentFocus: (
    id: string,
    key: string,
    mode?: "direct" | "structured",
  ) => void;
  onUpdateSection: (id: string, update: Partial<InvitationSection>) => void;
  onUpdateContent: (sectionId: string, key: string, value: unknown) => void;
}) {
  return (
    <InvitationRenderer
      snapshot={snapshot}
      resolveMedia={resolveMedia}
      className="border border-black/10"
      onContentChange={(sectionId, key, value) =>
        onUpdateContent(sectionId, key, value)
      }
      onContentFocus={onContentFocus}
      activeContent={activeContent}
      inlineEditing={inlineEditing}
      emptyState={
        <div className="grid min-h-96 place-items-center p-8 text-center text-sm opacity-60">
          Afișează sau adaugă o secțiune pentru a construi invitația.
        </div>
      }
      renderSectionFrame={({ section, children }) => (
        <div
          data-invitation-section-id={section.id}
          onClick={() => onSelect(section.id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(section.id);
            }
          }}
          className={cn(
            "group relative block w-full cursor-pointer text-left outline-none transition-shadow focus-visible:z-10",
            selectedId === section.id &&
              "z-10 shadow-[inset_0_0_0_2px_var(--brand)]",
          )}
          role="group"
          aria-label={`Editează secțiunea ${section.label}`}
          tabIndex={0}
        >
          {selectedId === section.id && (
            <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-ink px-1.5 py-1 font-sans text-white shadow-overlay">
              <span className="max-w-24 truncate px-2 text-[10px] font-semibold">
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
                  "grid size-11 place-items-center rounded-md",
                  section.style.align === "left" && "bg-white/15",
                )}
                aria-label="Aliniază la stânga"
              >
                <AlignLeft className="size-3.5" aria-hidden />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateSection(section.id, {
                    style: { ...section.style, align: "center" },
                  });
                }}
                className={cn(
                  "grid size-11 place-items-center rounded-md",
                  section.style.align === "center" && "bg-white/15",
                )}
                aria-label="Aliniază la centru"
              >
                <AlignCenter className="size-3.5" aria-hidden />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateSection(section.id, {
                    style: { ...section.style, align: "right" },
                  });
                }}
                className={cn(
                  "grid size-11 place-items-center rounded-md",
                  section.style.align === "right" && "bg-white/15",
                )}
                aria-label="Aliniază la dreapta"
              >
                <AlignRight className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          {children}
        </div>
      )}
    />
  );
}

function EditorRsvpPublicPreview({
  snapshot,
}: {
  snapshot: InvitationEditorSnapshot;
}) {
  const schedule = snapshot.sections.find(
    (section) => section.visible && section.type === "schedule",
  );
  const moments = array(schedule?.content.items)
    .map((item) => text(item.title))
    .filter(Boolean)
    .slice(0, 3);
  const labels = moments.length ? moments : ["Moment publicat în program"];

  return (
    <div
      id="preview-rsvp"
      className="mx-auto min-h-[640px] max-w-3xl bg-background px-4 py-8 text-ink sm:px-8 sm:py-12"
    >
      <div className="border-b border-line pb-6">
        <Badge variant="brand">Confirmare RSVP</Badge>
        <h2 className="mt-4 font-brand text-3xl font-semibold tracking-[-0.025em]">
          Confirmarea invitaților
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          În pagina publică, numele și întrebările sunt completate din linkul
          personal al destinatarului. Invitația nu apare deasupra formularului.
        </p>
      </div>
      <div className="mt-7">
        <Progress value={0} max={labels.length} />
        <div className="mt-7 space-y-6">
          <section aria-labelledby="preview-rsvp-person">
            <h3 id="preview-rsvp-person" className="font-semibold">
              Persoană din invitație
            </h3>
            <div className="mt-4 space-y-4">
              {labels.map((label) => (
                <Field key={label} label={label}>
                  <Select value="" disabled aria-label={`Răspuns pentru ${label}`}>
                    <option value="">Alege răspunsul</option>
                  </Select>
                </Field>
              ))}
              <Field label="Mesaj pentru organizatori">
                <Textarea disabled placeholder="Mesaj opțional" />
              </Field>
            </div>
          </section>
          <Button disabled>Salvează RSVP</Button>
        </div>
      </div>
    </div>
  );
}

function EditorGuestFlowPreview() {
  const stages = [
    {
      title: "Invitația",
      detail: "Se deschide fără antetul aplicației, formular sau carduri operaționale.",
      path: "/guest?token=…",
    },
    {
      title: "Confirmarea RSVP",
      detail: "Butonul din invitație duce la formularul personal al destinatarului.",
      path: "/guest/rsvp?token=…",
    },
    {
      title: "Detaliile evenimentului",
      detail: "Programul, traseele și funcțiile live rămân într-un spațiu separat.",
      path: "/guest/companion?token=…",
    },
  ];
  return (
    <div className="mx-auto min-h-[640px] max-w-4xl bg-background px-4 py-8 text-ink sm:px-8 sm:py-12">
      <h2 className="font-brand text-3xl font-semibold tracking-[-0.025em]">
        Experiența completă a invitatului
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Același token personal este păstrat între suprafețe, fără a amesteca
        invitația vizuală cu sarcinile și informațiile operaționale.
      </p>
      <ol className="mt-8 divide-y divide-line border-y border-line">
        {stages.map((stage, index) => (
          <li key={stage.path} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr_auto] sm:items-start">
            <span className="font-brand text-2xl font-semibold text-brand" aria-hidden>
              {index + 1}
            </span>
            <div>
              <h3 className="font-semibold">{stage.title}</h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                {stage.detail}
              </p>
            </div>
            <code className="w-fit rounded-md bg-subtle px-2 py-1 text-xs text-muted">
              {stage.path}
            </code>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Text and slider edits belong to one undo step per field; discrete changes
 * such as toggling visibility always get their own.
 */
function defaultSectionCoalesceKey(
  id: string,
  update: Partial<InvitationSection>,
) {
  const keys = Object.keys(update);
  if (keys.length !== 1) return null;
  return keys[0] === "label" || keys[0] === "style"
    ? `section:${id}:${keys[0]}`
    : null;
}

function cssAttributeValue(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#20211F";
}

function commitHexInput(
  event: React.FocusEvent<HTMLInputElement>,
  currentValue: string,
  onChange: (value: string) => void,
) {
  const candidate = event.currentTarget.value.trim();
  if (isInvitationHexColor(candidate)) {
    const normalized = candidate.toUpperCase();
    event.currentTarget.value = normalized;
    onChange(normalized);
    return;
  }
  event.currentTarget.value = currentValue.toUpperCase();
}

function numberValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function variantCode(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `varianta-${Date.now()}`
  );
}
