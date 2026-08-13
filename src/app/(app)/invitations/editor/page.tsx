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
  Minus,
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
  Video,
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
import { cn } from "@/lib/utils";
import { InvitationExperiencePanel } from "@/components/invitations/editor-experience-panel";
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
type InspectorTab = "content" | "design" | "experience" | "publish";
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

const advancedIcons: Record<InvitationBlockKind, React.ElementType> = {
  artwork: Images,
  video: Video,
  media_text: ImageIcon,
  divider: Minus,
};

export default function InvitationEditorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [snapshot, setSnapshot] = React.useState<InvitationEditorSnapshot>(() =>
    createInitialSnapshot(),
  );
  const [baseSnapshot, setBaseSnapshot] =
    React.useState<InvitationEditorSnapshot>(() => createInitialSnapshot());
  const [history, setHistory] = React.useState<InvitationEditorSnapshot[]>([]);
  const [future, setFuture] = React.useState<InvitationEditorSnapshot[]>([]);
  const [selectedId, setSelectedId] = React.useState("hero");
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
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [sectionsOpen, setSectionsOpen] = React.useState(false);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
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
  const [preflight, setPreflight] =
    React.useState<InvitationPreflightResource | null>(null);
  const [workflowBusy, setWorkflowBusy] = React.useState(false);
  const [variantCreateOpen, setVariantCreateOpen] = React.useState(false);
  const [variantToArchive, setVariantToArchive] =
    React.useState<InvitationVariantResource | null>(null);
  const [versionToRestore, setVersionToRestore] =
    React.useState<InvitationVersionHistoryItemResource | null>(null);
  const editRevisionRef = React.useRef(0);
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
    (next: InvitationEditorSnapshot) => {
      editRevisionRef.current += 1;
      setPreflight(null);
      setHistory((current) => [...current.slice(-39), snapshot]);
      setFuture([]);
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
    editRevisionRef.current += 1;
    setFuture((current) => [snapshot, ...current]);
    setSnapshot(previous);
    setHistory((current) => current.slice(0, -1));
    setDirty(true);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    editRevisionRef.current += 1;
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

  const updateExperience = (update: Partial<InvitationExperienceSettings>) =>
    commit({
      ...snapshot,
      experience: { ...snapshot.experience, ...update },
    });

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

  const duplicateSection = (id: string) => {
    if (structureLockedByVariant()) return;
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

  const addSection = (type: InvitationSectionType) => {
    if (structureLockedByVariant()) return;
    const section = createDefaultSection(type);
    commit({ ...snapshot, sections: [...snapshot.sections, section] });
    setSelectedId(section.id);
    setInspectorTab("content");
    setAddOpen(false);
    if (window.innerWidth < 1024) setInspectorOpen(true);
  };

  const addAdvancedSection = (blockKind: InvitationBlockKind) => {
    if (structureLockedByVariant()) return;
    const section = createAdvancedSection(blockKind);
    commit({ ...snapshot, sections: [...snapshot.sections, section] });
    setSelectedId(section.id);
    setInspectorTab("content");
    setAddOpen(false);
    if (window.innerWidth < 1024) setInspectorOpen(true);
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
    setHistory([]);
    setFuture([]);
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
      setHistory([]);
      setFuture([]);
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
      setHistory([]);
      setFuture([]);
      setVersionToRestore(null);
      const versionData = await weddingOsApi.invitationVersions(
        currentWorkspace.id,
      );
      setVersions(versionData.items);
      toast({
        title: "Versiune restaurată",
        description:
          "Am creat o ciornă nouă; versiunea publicată nu s-a schimbat.",
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
      setHistory([]);
      setFuture([]);
      setSyncPreview(
        await weddingOsApi.invitationSyncPreview(currentWorkspace.id),
      );
      toast({
        title: "Ciorna a fost actualizată",
        description: `${paths.length} diferențe au fost aplicate. Invitația publică nu s-a schimbat.`,
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
        setHistory([]);
        setFuture([]);
        setDirty(false);
        setLastSavedAt(new Date());
      } catch (refreshError) {
        setBaseSnapshot(refreshedBase);
        setSnapshot(refreshedBase);
        setVariants([]);
        setActiveVariantId(null);
        setHistory([]);
        setFuture([]);
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
    if (window.innerWidth < 1024) setInspectorOpen(true);
    toast({
      title: "Mai sunt detalii de verificat",
      description:
        "Deschide Verificare și rezolvă elementele marcate înainte de a continua.",
      variant: "warning",
    });
  };

  const showInspectorTab = (tab: InspectorTab) => {
    setInspectorTab(tab);
    if (window.innerWidth < 1024) setInspectorOpen(true);
  };

  const showInvitationStructure = () => {
    setLeftPanelTab("layers");
    if (window.innerWidth < 768) setSectionsOpen(true);
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

  const widths: Record<Device, string> = {
    desktop: "w-[1440px]",
    tablet: "w-[768px]",
    mobile: "w-[390px]",
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
        <div className="hidden min-w-0 flex-1 border-l border-line pl-3 sm:block md:flex-none">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-brand text-base font-semibold text-brand">
              Studio invitație
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
          <p className="hidden text-xs text-faint md:block">
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
            Alege stilul
          </Button>
          <Button
            className="hidden md:inline-flex"
            variant="ghost"
            size="sm"
            onClick={() => setWorkflowOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Sincronizare și versiuni
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
            <span className="hidden sm:inline">Salvează acum</span>
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
            onAddAdvanced={addAdvancedSection}
            structuralLocked={Boolean(activeVariantId)}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-sunken/60">
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="size-2 rounded-full bg-success" aria-hidden />
              <span className="text-xs text-muted">
                Previzualizare live · dublu clic pentru text
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
              <span className="hidden text-xs font-medium text-muted sm:inline">
                Lățime reală
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Deschide previzualizarea mare"
                onClick={() => setCanvasPreviewOpen(true)}
              >
                <Maximize2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
          <EditorJourneyBar
            activeTab={inspectorTab}
            choosingStyle={templateOpen}
            onChooseStyle={() => setTemplateOpen(true)}
            onChooseOpening={() => showInspectorTab("experience")}
            onEditSections={showInvitationStructure}
            onPersonalize={() => showInspectorTab("design")}
            onReview={() => showInspectorTab("publish")}
          />
          <div className="min-h-0 flex-1 overflow-auto px-3 py-5 sm:p-8">
            <div
              className={cn(
                "mx-auto shrink-0 transition-[width] duration-200",
                widths[device],
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs text-faint">
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
            onUpdateExperience={updateExperience}
            coverPreviewUrl={resolveMedia(
              snapshot.experience.coverMediaId ?? "",
              snapshot.experience.coverImageUrl ?? "",
            )}
            onUploadExperienceCover={(file) =>
              void uploadInvitationImage(file, (mediaId) =>
                updateExperience({
                  coverMediaId: mediaId,
                  coverImageUrl: null,
                }),
              )
            }
            device={device}
            uploadingMedia={uploadingMedia}
            onUploadImage={uploadInvitationImage}
            onChooseTemplate={() => setTemplateOpen(true)}
            onOpenWorkflow={() => setWorkflowOpen(true)}
            onResolveCheck={resolveReadinessCheck}
            onPublish={requestPublish}
            preflight={preflight}
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
          structuralLocked={Boolean(activeVariantId)}
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
          onUpdateExperience={updateExperience}
          coverPreviewUrl={resolveMedia(
            snapshot.experience.coverMediaId ?? "",
            snapshot.experience.coverImageUrl ?? "",
          )}
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
        />
      </Drawer>

      <Modal
        open={canvasPreviewOpen}
        onClose={() => setCanvasPreviewOpen(false)}
        title="Previzualizarea completă"
        description={`Invitația este randată la lățimea reală pentru ${device === "desktop" ? "desktop" : device === "tablet" ? "tabletă" : "mobil"}, fără controalele editorului.`}
        size="full"
      >
        <div className="overflow-auto rounded-xl bg-sunken p-2 sm:p-4">
          <div
            className={cn(
              "mx-auto overflow-hidden rounded-xl shadow-overlay",
              widths[device],
            )}
          >
            <InvitationRenderer
              snapshot={snapshot}
              resolveMedia={resolveMedia}
            />
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
            const Icon = icons[entry.type];
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
            const Icon = advancedIcons[entry.blockKind];
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
          onClick={() => onTabChange("blocks")}
          className={cn(
            "flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg text-xs font-semibold",
            tab === "blocks"
              ? "bg-brand text-on-brand"
              : "text-muted hover:bg-subtle hover:text-ink",
          )}
        >
          <Plus className="size-3.5" />
          Adaugă secțiune
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
              const Icon = icons[entry.type];
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
              const Icon = advancedIcons[entry.blockKind];
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
        <SectionsPanel
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
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

function SectionsPanel({
  snapshot,
  selectedId,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  onAdd,
  structuralLocked,
}: {
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  structuralLocked: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-faint">
            Structură
          </p>
          <Badge variant="neutral">{snapshot.sections.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          {structuralLocked
            ? "În variantă poți schimba conținutul și vizibilitatea, nu structura."
            : "Ordinea de aici este ordinea invitației."}
        </p>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {snapshot.sections.map((section, index) => {
          const Icon = sectionIcon(section);
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
                      "truncate text-sm font-medium",
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
                    disabled={structuralLocked || index === 0}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mută mai sus"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onMove(section.id, 1)}
                    disabled={
                      structuralLocked || index === snapshot.sections.length - 1
                    }
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mută mai jos"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onDuplicate(section.id)}
                    disabled={structuralLocked}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Duplică secțiunea"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    onClick={() => onRemove(section.id)}
                    disabled={structuralLocked}
                    className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
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
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={structuralLocked}
          onClick={onAdd}
        >
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
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-4 border-b border-line bg-surface px-2 pt-2">
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
            onClick={() => onTabChange(value)}
            aria-label={ariaLabel}
            aria-current={tab === value ? "page" : undefined}
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
      <div className="border-b border-line px-3 py-2 sm:hidden">
        <Button
          className="w-full"
          variant="ghost"
          size="sm"
          onClick={onOpenWorkflow}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Sincronizare și versiuni
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "content" && selected && (
          <SectionInspector
            section={selected}
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
            {preflight ? (
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
                    ? "Verificările serverului sunt complete"
                    : `${preflight.errors.length} blocaje de publicare`}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {preflight.assignedRecipients} destinatari ·{" "}
                  {preflight.activeVariants} variante active
                </p>
                {preflight.errors.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-danger">
                    {preflight.errors.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
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
              disabled={readiness.completed !== readiness.total}
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

function SectionInspector({
  section,
  device,
  uploadingMedia,
  onUploadImage,
  onUpdateSection,
  onUpdateContent,
  onUpdateContentMany,
}: {
  section: InvitationSection;
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
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-brand-softer text-brand-strong">
          {React.createElement(sectionIcon(section), {
            className: "size-4",
            "aria-hidden": true,
          })}
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
      <EditorLayerStudio
        section={section}
        device={device}
        uploading={uploadingMedia}
        onUpdateContent={onUpdateContent}
        onUploadImage={onUploadImage}
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
          uploading={uploadingMedia}
          onUploadImage={onUploadImage}
          onUpdateContentMany={onUpdateContentMany}
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
          <p className="text-sm font-medium text-ink">
            Aranjarea copertei
          </p>
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
            value={numberValue(c.focalX, 50)}
            onChange={(event) => onUpdate("focalX", Number(event.target.value))}
            className="min-h-11 w-full accent-[var(--brand)]"
          />
        </Field>
        <Field label="Poziția imaginii — vertical">
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
          <option value="display">Fraunces — editorial</option>
          <option value="sans">Inter — modern</option>
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
  return (
    <InvitationRenderer
      snapshot={snapshot}
      resolveMedia={resolveMedia}
      className="border border-black/10"
      onContentChange={(sectionId, key, value) =>
        onUpdateContent(sectionId, key, value)
      }
      emptyState={
        <div className="grid min-h-96 place-items-center p-8 text-center text-sm opacity-60">
          Afișează sau adaugă o secțiune pentru a construi invitația.
        </div>
      }
      renderSectionFrame={({ section, children }) => (
        <div
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
          {children}
        </div>
      )}
    />
  );
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

function sectionIcon(section: InvitationSection) {
  const blockKind = section.content.blockKind;
  if (
    section.type === "custom" &&
    (blockKind === "artwork" ||
      blockKind === "video" ||
      blockKind === "media_text" ||
      blockKind === "divider")
  )
    return advancedIcons[blockKind];
  return icons[section.type];
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
