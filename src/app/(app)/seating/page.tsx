"use client";

import Link from "next/link";
import * as React from "react";
import type { MenuResource } from "@weddingos/contracts";
import {
  AlertCircle,
  Armchair,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Download,
  Ellipsis,
  EyeOff,
  FileSpreadsheet,
  GripVertical,
  LayoutGrid,
  Link2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Unlock,
  UserMinus,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  apiErrorMessage,
  type OperationResource,
  type SeatingPlanResource,
  type SeatingSuggestionResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
} from "@/components/ui";

type WeddingEventOption = { id: string; title: string };
type SeatingTable = SeatingPlanResource["tables"][number];
type SeatingGuest = SeatingPlanResource["guests"][number];
type SeatingAssignment = SeatingPlanResource["assignments"][number];
type TableDraft = {
  id: string | null;
  name: string;
  label: string;
  capacity: string;
  minimumCapacity: string;
  shape: SeatingTable["shape"];
  zone: string;
  notesPrivate: string;
};

const blankTableDraft: TableDraft = {
  id: null,
  name: "",
  label: "",
  capacity: "8",
  minimumCapacity: "",
  shape: "round",
  zone: "",
  notesPrivate: "",
};

const constraintLabels: Record<string, string> = {
  keep_together: "Așază împreună",
  keep_apart: "Așază separat",
  prefer_together: "Preferă împreună",
  prefer_apart: "Preferă separat",
  must_be_at_table: "Trebuie la masa indicată",
  must_not_be_at_table: "Nu poate sta la masa indicată",
  accessible_seat_required: "Necesită loc accesibil",
  near_exit: "Aproape de ieșire",
  near_stage: "Aproape de scenă",
  custom: "Regulă personalizată",
};

const issueLabels: Record<string, string> = {
  capacity_exceeded: "Capacitate depășită",
  minimum_capacity_not_met: "Masă sub capacitatea minimă",
  duplicate_assignment: "Invitat alocat de mai multe ori",
  ineligible_guest: "Invitat neeligibil",
  constraint_violation: "Regulă de așezare încălcată",
  accessible_seat_missing: "Lipsește un loc accesibil",
  seat_unavailable: "Loc indisponibil",
  household_split: "Familie împărțită",
  table_overlap: "Mese suprapuse",
  unassigned_confirmed_guest: "Invitat confirmat fără masă",
};

export default function SeatingPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<OperationResource[]>([]);
  const [plan, setPlan] = React.useState<SeatingPlanResource | null>(null);
  const [spaces, setSpaces] = React.useState<OperationResource[]>([]);
  const [events, setEvents] = React.useState<WeddingEventOption[]>([]);
  const [menus, setMenus] = React.useState<MenuResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [planEditOpen, setPlanEditOpen] = React.useState(false);
  const [deletePlanOpen, setDeletePlanOpen] = React.useState(false);
  const [tableOpen, setTableOpen] = React.useState(false);
  const [tableDraft, setTableDraft] =
    React.useState<TableDraft>(blankTableDraft);
  const [planName, setPlanName] = React.useState("Plan principal");
  const [planEditName, setPlanEditName] = React.useState("");
  const [eventId, setEventId] = React.useState("");
  const [spaceId, setSpaceId] = React.useState("");
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(
    null,
  );
  const [selectedGuestId, setSelectedGuestId] = React.useState<string | null>(
    null,
  );
  const [draggedGuestId, setDraggedGuestId] = React.useState<string | null>(
    null,
  );
  const [guestQuery, setGuestQuery] = React.useState("");
  const [deleteTable, setDeleteTable] = React.useState<SeatingTable | null>(
    null,
  );
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishReason, setPublishReason] = React.useState("");
  const [constraintOpen, setConstraintOpen] = React.useState(false);
  const [constraintType, setConstraintType] = React.useState("keep_together");
  const [relatedGuestId, setRelatedGuestId] = React.useState("");
  const [constraintReason, setConstraintReason] = React.useState("");
  const [suggestion, setSuggestion] =
    React.useState<SeatingSuggestionResource | null>(null);
  const [suggestionOpen, setSuggestionOpen] = React.useState(false);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("seating.write");
  const canAssign = capabilities.includes("seating.assign");
  const canPublish = capabilities.includes("seating.publish");
  const canSuggest = capabilities.includes("seating.generate_suggestion");
  const canExport = capabilities.includes("seating.export");
  const canReadSensitive = capabilities.includes(
    "seating.read_sensitive_summary",
  );
  const canManageMenus = capabilities.includes("menu.write");

  const loadPlan = React.useCallback(
    async (planId: string, preferredTableId?: string | null) => {
      if (!currentWorkspace) return;
      const detail = await weddingOsApi.seatingPlan(
        currentWorkspace.id,
        planId,
      );
      setPlan(detail);
      setSelectedTableId((current) => {
        const requested = preferredTableId ?? current;
        return detail.tables.some((table) => table.id === requested)
          ? requested
          : (detail.tables[0]?.id ?? null);
      });
      setSelectedGuestId((current) =>
        detail.guests.some((guest) => guest.id === current) ? current : null,
      );
    },
    [currentWorkspace],
  );

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setLoading(true);
    setError(null);
    try {
      const [planList, venueList, calendar, menuList] = await Promise.all([
        weddingOsApi.seatingPlans(currentWorkspace.id),
        weddingOsApi.venueSpaces(currentWorkspace.id),
        weddingOsApi.calendar(currentWorkspace.id),
        weddingOsApi.menus(currentWorkspace.id),
      ]);
      setPlans(planList.items);
      setSpaces(venueList.items);
      setMenus(menuList.items.filter((menu) => menu.status === "active"));
      const weddingEvents = calendar.items
        .filter((item) => item.sourceType === "wedding_event")
        .map((item) => ({ id: item.sourceId, title: item.title }));
      setEvents(weddingEvents);
      setEventId((current) => current || weddingEvents[0]?.id || "");
      setSpaceId((current) => current || String(venueList.items[0]?.id ?? ""));
      const params = new URLSearchParams(window.location.search);
      const requestedPlan = params.get("plan");
      const requestedTable = params.get("table");
      const firstPlan =
        planList.items.find((item) => item.id === requestedPlan) ??
        planList.items[0];
      if (firstPlan) await loadPlan(firstPlan.id, requestedTable);
      else setPlan(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode, loadPlan]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = React.useCallback(async () => {
    if (!plan) return;
    await loadPlan(plan.id);
  }, [loadPlan, plan]);

  const choosePlan = async (planId: string) => {
    window.history.replaceState(
      null,
      "",
      `/seating?plan=${encodeURIComponent(planId)}`,
    );
    setSelectedTableId(null);
    await loadPlan(planId, null);
  };

  const createPlan = async () => {
    if (!currentWorkspace || !eventId || !planName.trim()) return;
    setAction("plan-create");
    try {
      let venueId = spaceId;
      if (!venueId) {
        const venue = await weddingOsApi.createVenueSpace(currentWorkspace.id, {
          weddingEventId: eventId,
          name: "Sala principală",
          widthUnits: 100,
          heightUnits: 70,
          unit: "arbitrary_grid",
        });
        venueId = venue.id;
      }
      const created = await weddingOsApi.createSeatingPlan(
        currentWorkspace.id,
        {
          weddingEventId: eventId,
          venueSpaceId: venueId,
          name: planName.trim(),
        },
      );
      setPlanOpen(false);
      await load();
      await choosePlan(created.id);
      toast({ title: "Planul de mese a fost creat", variant: "success" });
    } catch (cause) {
      toast({
        title: "Planul nu a putut fi creat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const updatePlan = async () => {
    if (!currentWorkspace || !plan || !planEditName.trim()) return;
    setAction("plan-update");
    try {
      const updated = await weddingOsApi.updateSeatingPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
        { name: planEditName.trim() },
      );
      setPlanEditOpen(false);
      setPlans((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      await loadPlan(plan.id);
      toast({ title: "Planul de mese a fost redenumit", variant: "success" });
    } catch (cause) {
      toast({
        title: "Planul nu a putut fi actualizat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const removePlan = async () => {
    if (!currentWorkspace || !plan) return;
    setAction("plan-delete");
    try {
      await weddingOsApi.deleteSeatingPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
      );
      setDeletePlanOpen(false);
      setPlan(null);
      await load();
      toast({ title: "Planul de mese a fost arhivat", variant: "success" });
    } catch (cause) {
      toast({
        title: "Planul nu a putut fi arhivat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const openNewTable = () => {
    const index = plan?.tables.length ?? 0;
    setTableDraft({
      ...blankTableDraft,
      name: `Masa ${index + 1}`,
      label: `M${index + 1}`,
    });
    setTableOpen(true);
  };

  const openEditTable = (table: SeatingTable) => {
    setTableDraft({
      id: table.id,
      name: String(table.name),
      label: table.label,
      capacity: String(table.capacity),
      minimumCapacity: table.minimumCapacity
        ? String(table.minimumCapacity)
        : "",
      shape: table.shape,
      zone: table.zone ?? "",
      notesPrivate: table.notesPrivate ?? "",
    });
    setTableOpen(true);
  };

  const saveTable = async () => {
    if (!currentWorkspace || !plan) return;
    const capacity = Number(tableDraft.capacity);
    if (!tableDraft.name.trim() || !tableDraft.label.trim() || capacity < 1)
      return;
    setAction("table-save");
    try {
      if (tableDraft.id) {
        const current = plan.tables.find((table) => table.id === tableDraft.id);
        if (!current) return;
        await weddingOsApi.updateSeatingTable(
          currentWorkspace.id,
          plan.id,
          current.id,
          current.version,
          {
            name: tableDraft.name.trim(),
            label: tableDraft.label.trim(),
            capacity,
            minimumCapacity: tableDraft.minimumCapacity
              ? Number(tableDraft.minimumCapacity)
              : null,
            shape: tableDraft.shape,
            zone: tableDraft.zone.trim() || null,
            notesPrivate: tableDraft.notesPrivate.trim() || null,
          },
        );
      } else {
        const index = plan.tables.length;
        await weddingOsApi.createSeatingTable(currentWorkspace.id, plan.id, {
          name: tableDraft.name.trim(),
          label: tableDraft.label.trim(),
          shape: tableDraft.shape,
          capacity,
          minimumCapacity: tableDraft.minimumCapacity
            ? Number(tableDraft.minimumCapacity)
            : null,
          x: 48 + (index % 4) * 205,
          y: 64 + Math.floor(index / 4) * 155,
          width: tableDraft.shape === "rectangle" ? 176 : 144,
          height: tableDraft.shape === "rectangle" ? 96 : 112,
          rotation: 0,
          position: index,
          zone: tableDraft.zone.trim() || null,
          notesPrivate: tableDraft.notesPrivate.trim() || null,
          locked: false,
          seats: Array.from({ length: capacity }, (_, indexValue) => ({
            label: String(indexValue + 1),
            position: indexValue,
            accessible: false,
            status: "available",
          })),
        });
      }
      setTableOpen(false);
      await refresh();
      toast({
        title: tableDraft.id
          ? "Masa a fost actualizată"
          : "Masa a fost adăugată",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Masa nu a putut fi salvată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const removeTable = async () => {
    if (!currentWorkspace || !plan || !deleteTable) return;
    setAction("table-delete");
    try {
      await weddingOsApi.deleteSeatingTable(
        currentWorkspace.id,
        plan.id,
        deleteTable.id,
        deleteTable.version,
      );
      setDeleteTable(null);
      await refresh();
      toast({ title: "Masa a fost eliminată", variant: "success" });
    } catch (cause) {
      toast({
        title: "Masa nu a putut fi eliminată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const updateTable = async (
    table: SeatingTable,
    input: Record<string, unknown>,
  ) => {
    if (!currentWorkspace || !plan) return;
    setAction(`table-${table.id}`);
    try {
      await weddingOsApi.updateSeatingTable(
        currentWorkspace.id,
        plan.id,
        table.id,
        table.version,
        input,
      );
      await refresh();
    } catch (cause) {
      toast({
        title: "Masa nu a putut fi actualizată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const assign = async (
    guestId: string,
    tableId: string,
    seatId?: string | null,
  ) => {
    if (!currentWorkspace || !plan || !canAssign) return;
    setAction(`guest-${guestId}`);
    try {
      await weddingOsApi.replaceSeatingAssignments(
        currentWorkspace.id,
        plan.id,
        plan.version,
        {
          assignments: [
            {
              guestId,
              tableId,
              seatId: seatId || null,
              source: "manual",
              locked: false,
            },
          ],
          removeAssignmentIds: [],
          confirmWarnings: true,
        },
      );
      await refresh();
    } catch (cause) {
      toast({
        title: "Locul nu a putut fi salvat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const unassign = async (assignment: SeatingAssignment) => {
    if (!currentWorkspace || !plan || !canAssign) return;
    setAction(`guest-${assignment.guestId}`);
    try {
      await weddingOsApi.removeSeatingAssignment(
        currentWorkspace.id,
        plan.id,
        assignment.id,
        assignment.version,
      );
      await refresh();
      toast({ title: "Invitatul nu mai are masă", variant: "success" });
    } catch (cause) {
      toast({
        title: "Invitatul nu a putut fi scos de la masă",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const setMenu = async (guest: SeatingGuest, menuId: string) => {
    if (!currentWorkspace || !canManageMenus) return;
    setAction(`menu-${guest.id}`);
    try {
      await weddingOsApi.setGuestMenuSelection(currentWorkspace.id, guest.id, {
        menuId: menuId || null,
        selectionVersion: guest.menu?.selectionVersion ?? null,
      });
      await refresh();
      toast({
        title: "Meniul invitatului a fost actualizat",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Meniul nu a putut fi actualizat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const openConstraintForGuest = (guestId: string) => {
    setSelectedGuestId(guestId);
    setConstraintType("keep_together");
    setRelatedGuestId("");
    setConstraintReason("");
    setConstraintOpen(true);
  };

  const createConstraint = async () => {
    if (!currentWorkspace || !plan || !selectedGuestId) return;
    const needsRelated = [
      "keep_together",
      "keep_apart",
      "prefer_together",
      "prefer_apart",
    ].includes(constraintType);
    if (needsRelated && !relatedGuestId) return;
    setAction("constraint-create");
    try {
      await weddingOsApi.createSeatingConstraint(currentWorkspace.id, plan.id, {
        type: constraintType,
        guestId: selectedGuestId,
        relatedGuestId: needsRelated ? relatedGuestId : null,
        priority: [
          "accessible_seat_required",
          "keep_apart",
          "keep_together",
        ].includes(constraintType)
          ? "high"
          : "medium",
        required: [
          "accessible_seat_required",
          "keep_apart",
          "keep_together",
        ].includes(constraintType),
        reason: constraintReason.trim() || null,
      });
      setConstraintOpen(false);
      await refresh();
      toast({ title: "Regula de așezare a fost adăugată", variant: "success" });
    } catch (cause) {
      toast({
        title: "Regula nu a putut fi adăugată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const deleteConstraint = async (constraint: OperationResource) => {
    if (!currentWorkspace || !plan) return;
    setAction(`constraint-${constraint.id}`);
    try {
      await weddingOsApi.deleteSeatingConstraint(
        currentWorkspace.id,
        plan.id,
        constraint.id,
        constraint.version,
      );
      await refresh();
    } catch (cause) {
      toast({
        title: "Regula nu a putut fi eliminată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const resolveIssue = async (issue: OperationResource) => {
    if (!currentWorkspace || !plan) return;
    setAction(`issue-${issue.id}`);
    try {
      await weddingOsApi.resolveSeatingIssue(
        currentWorkspace.id,
        plan.id,
        issue.id,
        issue.version,
        { status: "resolved", reason: "Verificat în Plan de mese." },
      );
      await refresh();
    } catch (cause) {
      toast({
        title: "Problema nu a putut fi închisă",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const requestSuggestion = async () => {
    if (!currentWorkspace || !plan) return;
    setAction("suggestion");
    try {
      const requested = await weddingOsApi.requestSeatingSuggestion(
        currentWorkspace.id,
        plan.id,
        plan.version,
      );
      toast({
        title: "Construim propunerea",
        description:
          "Păstrăm alocările manuale și analizăm regulile existente.",
        variant: "info",
      });
      let suggestionId = "";
      for (let attempt = 0; attempt < 45; attempt += 1) {
        const job = await weddingOsApi.job(requested.job.id);
        if (job.status === "completed") {
          const result = (job.result ?? {}) as Record<string, unknown>;
          const slice = (result.slice3 ?? {}) as Record<string, unknown>;
          suggestionId = String(slice.suggestionId ?? "");
          break;
        }
        if (job.status === "failed" || job.status === "cancelled")
          throw new Error("Propunerea nu a putut fi calculată.");
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (!suggestionId)
        throw new Error("Propunerea a durat prea mult. Reîncearcă.");
      const next = await weddingOsApi.seatingSuggestion(
        currentWorkspace.id,
        plan.id,
        suggestionId,
      );
      setSuggestion(next);
      setSuggestionOpen(true);
    } catch (cause) {
      toast({
        title: "Propunerea nu este disponibilă",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const applySuggestion = async () => {
    if (!currentWorkspace || !plan || !suggestion) return;
    setAction("suggestion-apply");
    try {
      await weddingOsApi.applySeatingSuggestion(
        currentWorkspace.id,
        plan.id,
        suggestion.id,
        suggestion.version,
        {
          replaceUnlockedAssignments: true,
          confirmConflicts: suggestion.hardConflicts.length > 0,
        },
      );
      setSuggestionOpen(false);
      await refresh();
      toast({ title: "Propunerea a fost aplicată", variant: "success" });
    } catch (cause) {
      toast({
        title: "Propunerea nu a putut fi aplicată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const publish = async () => {
    if (!currentWorkspace || !plan) return;
    setAction("publish");
    try {
      await weddingOsApi.publishSeatingPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
        publishReason.trim() || undefined,
      );
      setPublishOpen(false);
      setPublishReason("");
      await refresh();
      toast({
        title:
          plan.status === "published"
            ? "Planul a fost republicat"
            : "Planul a fost publicat",
        description: "Invitații alocați văd acum ultima versiune.",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Planul nu a fost publicat",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const unpublish = async () => {
    if (!currentWorkspace || !plan) return;
    setAction("unpublish");
    try {
      await weddingOsApi.unpublishSeatingPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
      );
      await refresh();
      toast({
        title: "Planul nu mai este vizibil invitaților",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Planul nu a putut fi retras",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  const exportPlan = async (
    kind:
      | "table_list"
      | "guest_by_table"
      | "table_cards"
      | "visual_plan"
      | "catering_summary",
    format: "csv" | "svg",
  ) => {
    if (!currentWorkspace || !plan) return;
    setAction(`export-${kind}`);
    try {
      const result = await weddingOsApi.createSeatingExport(
        currentWorkspace.id,
        plan.id,
        {
          format,
          kind,
          includeSensitive: kind === "catering_summary",
        },
      );
      toast({
        title: "Exportul este în curs",
        description: `Job ${result.job.id.slice(0, 8)} va produce un fișier securizat.`,
        variant: "info",
      });
    } catch (cause) {
      toast({
        title: "Exportul nu a pornit",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setAction(null);
    }
  };

  if (demoMode)
    return (
      <EmptyState
        icon={Armchair}
        title="Planul de mese este izolat în demo"
        description="Ieși din modul demo pentru a lucra cu invitații și mesele persistente."
      />
    );
  if (loading) return <SeatingLoading />;
  if (error)
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Planul de mese nu este disponibil"
        description={error}
        action={{ label: "Reîncearcă", onClick: () => void load() }}
      />
    );

  if (!plan)
    return (
      <>
        <EmptyState
          icon={Armchair}
          title={
            !canWrite
              ? "Planul de mese este disponibil în Plus"
              : events.length === 0
                ? "Adaugă mai întâi evenimentul nunții"
                : "Nu există încă un plan de mese"
          }
          description={
            !canWrite
              ? "Poți consulta planurile existente după revenirea la Free, dar crearea și așezarea invitaților necesită funcțiile logistice din Plus."
              : events.length === 0
                ? "Planul de mese trebuie legat de un eveniment confirmat. Completează programul nunții, apoi revino aici pentru primul draft."
                : "Creează spațiul și primul draft. Vei așeza doar invitații care au confirmat participarea."
          }
          action={
            !canWrite
              ? {
                  label: "Vezi opțiunile Plus",
                  onClick: () =>
                    window.location.assign("/settings?tab=billing"),
                  icon: <Lock className="size-4" />,
                }
              : events.length
              ? {
                  label: "Creează plan",
                  onClick: () => setPlanOpen(true),
                  icon: <Plus className="size-4" />,
                }
              : {
                  label: "Completează programul",
                  onClick: () => window.location.assign("/onboarding"),
                  icon: <ArrowRight className="size-4" />,
                }
          }
        />
        <PlanModal
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          events={events}
          spaces={spaces}
          eventId={eventId}
          setEventId={setEventId}
          spaceId={spaceId}
          setSpaceId={setSpaceId}
          planName={planName}
          setPlanName={setPlanName}
          save={createPlan}
          saving={action === "plan-create"}
        />
      </>
    );

  const assignmentByGuest = new Map(
    plan.assignments.map((item) => [item.guestId, item]),
  );
  const eligibleGuests = plan.guests.filter((guest) => guest.eligible);
  const unseated = eligibleGuests.filter(
    (guest) => !assignmentByGuest.has(guest.id),
  );
  const selectedTable =
    plan.tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedTableGuests = selectedTable
    ? eligibleGuests.filter(
        (guest) =>
          assignmentByGuest.get(guest.id)?.seatingTableId === selectedTable.id,
      )
    : [];
  const normalizedQuery = guestQuery.trim().toLocaleLowerCase("ro");
  const matchesQuery = (guest: SeatingGuest) =>
    !normalizedQuery ||
    `${guest.firstName} ${guest.lastName} ${guest.householdName ?? ""} ${guest.menu?.name ?? ""}`
      .toLocaleLowerCase("ro")
      .includes(normalizedQuery);
  const searchedUnseated = unseated.filter(matchesQuery);
  const searchedGuests = eligibleGuests.filter(matchesQuery);
  const openIssues = plan.issues.filter((issue) =>
    ["open", "acknowledged"].includes(String(issue.status)),
  );
  const criticalIssues = openIssues.filter(
    (issue) => String(issue.severity) === "critical",
  );
  const occupancy = eligibleGuests.length
    ? Math.round(
        ((eligibleGuests.length - unseated.length) / eligibleGuests.length) *
          100,
      )
    : 0;

  return (
    <div
      className="mx-auto max-w-[1560px] space-y-5"
      data-testid="seating-page"
    >
      <PageHeader
        title="Plan de mese"
        description="Așază invitații confirmați, verifică meniurile și publică doar când planul este gata."
        actions={
          <>
            {plans.length > 1 && (
              <Select
                aria-label="Alege planul de mese"
                value={plan.id}
                onChange={(event) => void choosePlan(event.target.value)}
              >
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {String(item.name)}
                  </option>
                ))}
              </Select>
            )}
            <Badge
              variant={
                plan.hasUnpublishedChanges
                  ? "warning"
                  : plan.status === "published"
                    ? "success"
                    : "neutral"
              }
            >
              {plan.hasUnpublishedChanges
                ? "Modificări nepublicate"
                : plan.status === "published"
                  ? "Publicat"
                  : "Draft"}
            </Badge>
            <Tooltip content="Reîncarcă datele planului">
              <Button
                variant="outline"
                size="icon"
                aria-label="Reîncarcă planul"
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-4" />
              </Button>
            </Tooltip>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void requestSuggestion()}
              disabled={!canSuggest}
              loading={action === "suggestion"}
            >
              <Sparkles className="size-4 text-accent" /> Propunere
            </Button>
            <ExportMenu
              disabled={!canExport}
              canReadSensitive={canReadSensitive}
              onExport={exportPlan}
            />
            <Dropdown>
              <DropdownTrigger>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Mai multe acțiuni"
                >
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownLabel>Plan</DropdownLabel>
                <DropdownItem
                  icon={<Plus />}
                  onSelect={() => setPlanOpen(true)}
                  disabled={!canWrite}
                >
                  Plan nou
                </DropdownItem>
                <DropdownItem
                  icon={<Pencil />}
                  onSelect={() => {
                    setPlanEditName(String(plan.name));
                    setPlanEditOpen(true);
                  }}
                  disabled={!canWrite}
                >
                  Redenumește planul
                </DropdownItem>
                <DropdownItem
                  icon={<UtensilsCrossed />}
                  onSelect={() => window.location.assign("/menus")}
                >
                  Meniuri și alergii
                </DropdownItem>
                {plan.status === "published" && (
                  <>
                    <DropdownSeparator />
                    <DropdownItem
                      icon={<EyeOff />}
                      onSelect={() => void unpublish()}
                      disabled={!canPublish}
                    >
                      Retrage din portalul invitaților
                    </DropdownItem>
                  </>
                )}
                {plan.status !== "published" && (
                  <>
                    <DropdownSeparator />
                    <DropdownItem
                      icon={<Trash2 />}
                      destructive
                      onSelect={() => setDeletePlanOpen(true)}
                      disabled={!canWrite}
                    >
                      Arhivează planul
                    </DropdownItem>
                  </>
                )}
              </DropdownContent>
            </Dropdown>
            <Button
              size="sm"
              onClick={() => setPublishOpen(true)}
              disabled={!canPublish || !plan.tables.length}
            >
              <CheckCircle2 className="size-4" />
              {plan.status === "published" ? "Republică" : "Publică"}
            </Button>
          </>
        }
      />

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Rezumat plan de mese"
      >
        <SummaryCard
          label="Așezați"
          value={eligibleGuests.length - unseated.length}
          helper={`din ${eligibleGuests.length} confirmați`}
          tone="success"
        />
        <SummaryCard
          label="Fără masă"
          value={unseated.length}
          helper={unseated.length ? "necesită atenție" : "toți au loc"}
          tone={unseated.length ? "warning" : "success"}
        />
        <SummaryCard
          label="Mese"
          value={plan.tables.length}
          helper={`${plan.tables.reduce((sum, table) => sum + table.capacity, 0)} locuri disponibile`}
          tone="neutral"
        />
        <SummaryCard
          label="Probleme deschise"
          value={openIssues.length}
          helper={
            criticalIssues.length
              ? `${criticalIssues.length} critice`
              : "fără blocaje critice"
          }
          tone={
            criticalIssues.length
              ? "danger"
              : openIssues.length
                ? "warning"
                : "success"
          }
        />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-ink">
                {String(plan.name)}
              </p>
              <Badge variant="neutral">{occupancy}% complet</Badge>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              Selectează o masă, apoi adaugă sau mută invitații. Modificările se
              salvează imediat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/guests"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Users className="size-4" /> Gestionează invitații
            </Link>
            <Button size="sm" onClick={openNewTable} disabled={!canWrite}>
              <Plus className="size-4" /> Adaugă masă
            </Button>
          </div>
        </div>
        <Progress
          value={occupancy}
          aria-label={`${occupancy}% dintre invitații confirmați sunt așezați`}
          className="rounded-none"
        />
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Card className="order-3 min-w-0 xl:order-1">
          <Tabs defaultValue="unseated">
            <div className="border-b border-line p-3 pb-0">
              <TabsList className="w-full">
                <TabsTrigger
                  value="unseated"
                  badge={
                    <Badge variant={unseated.length ? "warning" : "success"}>
                      {unseated.length}
                    </Badge>
                  }
                >
                  Neașezați
                </TabsTrigger>
                <TabsTrigger value="people">Toți</TabsTrigger>
                <TabsTrigger
                  value="issues"
                  badge={
                    <Badge variant={openIssues.length ? "danger" : "success"}>
                      {openIssues.length}
                    </Badge>
                  }
                >
                  Probleme
                </TabsTrigger>
                <TabsTrigger
                  value="rules"
                  badge={
                    <Badge variant="neutral">{plan.constraints.length}</Badge>
                  }
                >
                  Reguli
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="unseated">
              <GuestListPanel
                guests={searchedUnseated}
                query={guestQuery}
                onQuery={setGuestQuery}
                selectedTable={selectedTable}
                action={action}
                canAssign={canAssign}
                onAssign={assign}
                onDragStart={setDraggedGuestId}
                onRule={openConstraintForGuest}
                emptyTitle={
                  unseated.length
                    ? "Niciun invitat nu corespunde căutării"
                    : "Toți invitații confirmați au masă"
                }
              />
            </TabsContent>
            <TabsContent value="people">
              <GuestListPanel
                guests={searchedGuests}
                query={guestQuery}
                onQuery={setGuestQuery}
                selectedTable={selectedTable}
                action={action}
                canAssign={canAssign}
                assignmentByGuest={assignmentByGuest}
                tables={plan.tables}
                onAssign={assign}
                onDragStart={setDraggedGuestId}
                onRule={openConstraintForGuest}
                emptyTitle="Niciun invitat nu corespunde căutării"
              />
            </TabsContent>
            <TabsContent
              value="issues"
              className="max-h-[680px] overflow-y-auto p-3"
            >
              {openIssues.length ? (
                <div className="space-y-2">
                  {openIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      loading={action === `issue-${issue.id}`}
                      canWrite={canWrite}
                      onSelectTable={(tableId) => setSelectedTableId(tableId)}
                      onResolve={() => void resolveIssue(issue)}
                    />
                  ))}
                </div>
              ) : (
                <PanelEmpty
                  icon={CheckCircle2}
                  title="Nu există probleme deschise"
                  description="Capacitatea, regulile și alocările sunt coerente."
                />
              )}
            </TabsContent>
            <TabsContent
              value="rules"
              className="max-h-[680px] overflow-y-auto p-3"
            >
              {plan.constraints.length ? (
                <div className="space-y-2">
                  {plan.constraints.map((constraint) => (
                    <ConstraintCard
                      key={constraint.id}
                      constraint={constraint}
                      guests={plan.guests}
                      loading={action === `constraint-${constraint.id}`}
                      canWrite={canWrite}
                      onDelete={() => void deleteConstraint(constraint)}
                    />
                  ))}
                </div>
              ) : (
                <PanelEmpty
                  icon={Link2}
                  title="Nu ai adăugat reguli"
                  description="Poți ține familii împreună, separa invitați sau marca nevoi de accesibilitate."
                />
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="order-1 min-w-0 overflow-hidden xl:order-2">
          <SeatingCanvas
            tables={plan.tables}
            guests={plan.guests}
            assignmentByGuest={assignmentByGuest}
            selectedTableId={selectedTableId}
            canAssign={canAssign}
            draggedGuestId={draggedGuestId}
            onSelectTable={setSelectedTableId}
            onAssign={assign}
            onClearDrag={() => setDraggedGuestId(null)}
            onAddTable={openNewTable}
            canWrite={canWrite}
          />
        </Card>

        <Card className="order-2 min-w-0 xl:order-3">
          <CardContent className="p-4">
            {selectedTable ? (
              <TableDetail
                table={selectedTable}
                tables={plan.tables}
                guests={selectedTableGuests}
                assignmentByGuest={assignmentByGuest}
                menus={menus}
                action={action}
                canWrite={canWrite}
                canAssign={canAssign}
                canManageMenus={canManageMenus}
                canReadSensitive={canReadSensitive}
                onEdit={() => openEditTable(selectedTable)}
                onDelete={() => setDeleteTable(selectedTable)}
                onUpdate={(input) => void updateTable(selectedTable, input)}
                onAssign={assign}
                onUnassign={unassign}
                onMenu={setMenu}
              />
            ) : (
              <PanelEmpty
                icon={Armchair}
                title="Selectează o masă"
                description="Aici vei vedea invitații, meniurile și acțiunile mesei."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <PlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        events={events}
        spaces={spaces}
        eventId={eventId}
        setEventId={setEventId}
        spaceId={spaceId}
        setSpaceId={setSpaceId}
        planName={planName}
        setPlanName={setPlanName}
        save={createPlan}
        saving={action === "plan-create"}
      />
      <TableModal
        open={tableOpen}
        draft={tableDraft}
        setDraft={setTableDraft}
        saving={action === "table-save"}
        onClose={() => setTableOpen(false)}
        onSave={saveTable}
      />
      <ConstraintModal
        open={constraintOpen}
        guest={
          plan.guests.find((guest) => guest.id === selectedGuestId) ?? null
        }
        guests={plan.guests}
        type={constraintType}
        setType={setConstraintType}
        relatedGuestId={relatedGuestId}
        setRelatedGuestId={setRelatedGuestId}
        reason={constraintReason}
        setReason={setConstraintReason}
        saving={action === "constraint-create"}
        onClose={() => setConstraintOpen(false)}
        onSave={createConstraint}
      />
      <SuggestionModal
        open={suggestionOpen}
        suggestion={suggestion}
        guests={plan.guests}
        tables={plan.tables}
        applying={action === "suggestion-apply"}
        onClose={() => setSuggestionOpen(false)}
        onApply={applySuggestion}
      />
      <PublishModal
        open={publishOpen}
        plan={plan}
        openIssues={openIssues}
        reason={publishReason}
        setReason={setPublishReason}
        publishing={action === "publish"}
        onClose={() => setPublishOpen(false)}
        onPublish={publish}
      />
      <Modal
        open={planEditOpen}
        onClose={() => setPlanEditOpen(false)}
        title="Redenumește planul de mese"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPlanEditOpen(false)}>
              Renunță
            </Button>
            <Button
              loading={action === "plan-update"}
              disabled={!planEditName.trim() || action === "plan-update"}
              onClick={() => void updatePlan()}
            >
              Salvează
            </Button>
          </>
        }
      >
        <Field label="Numele planului">
          <Input
            autoFocus
            value={planEditName}
            onChange={(event) => setPlanEditName(event.target.value)}
          />
        </Field>
      </Modal>
      <ConfirmDialog
        open={deletePlanOpen}
        onClose={() => setDeletePlanOpen(false)}
        onConfirm={() => void removePlan()}
        title="Arhivezi planul de mese?"
        description="Planul și mesele lui nu vor mai apărea în lucru. Lista invitaților și meniurile nu sunt șterse."
        confirmLabel="Arhivează planul"
        destructive
        loading={action === "plan-delete"}
      />
      <ConfirmDialog
        open={Boolean(deleteTable)}
        onClose={() => setDeleteTable(null)}
        onConfirm={() => void removeTable()}
        title="Elimini masa?"
        description={
          deleteTable?.assigned
            ? "Masa are invitați alocați. Mută-i sau scoate-i de la masă înainte de eliminare."
            : "Masa va fi eliminată din plan. Acțiunea nu afectează lista de invitați."
        }
        confirmLabel="Elimină masa"
        destructive
        loading={action === "table-delete"}
      />
    </div>
  );
}

function SeatingLoading() {
  return (
    <div
      className="mx-auto max-w-[1560px] space-y-5"
      role="status"
      aria-label="Se încarcă planul de mese"
    >
      <div className="space-y-2">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Skeleton className="h-[680px]" />
        <Skeleton className="h-[680px]" />
        <Skeleton className="h-[680px]" />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "bg-subtle",
    success: "bg-success-soft",
    warning: "bg-warning-soft",
    danger: "bg-danger-soft",
  }[tone];
  return (
    <div className={cn("min-w-0 rounded-xl border border-line p-4", toneClass)}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-faint">{helper}</p>
    </div>
  );
}

function GuestListPanel(props: {
  guests: SeatingGuest[];
  query: string;
  onQuery: (value: string) => void;
  selectedTable: SeatingTable | null;
  action: string | null;
  canAssign: boolean;
  assignmentByGuest?: Map<string, SeatingAssignment>;
  tables?: SeatingTable[];
  onAssign: (guestId: string, tableId: string) => Promise<void>;
  onDragStart: (guestId: string) => void;
  onRule: (guestId: string) => void;
  emptyTitle: string;
}) {
  return (
    <div>
      <div className="border-b border-line p-3">
        <Field label="Caută invitat">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              placeholder="Nume, familie sau meniu"
              className="pl-9"
            />
          </div>
        </Field>
      </div>
      <div className="max-h-[620px] overflow-y-auto p-2">
        {props.guests.length ? (
          <ul className="space-y-1">
            {props.guests.map((guest) => {
              const assignment = props.assignmentByGuest?.get(guest.id);
              const table = props.tables?.find(
                (item) => item.id === assignment?.seatingTableId,
              );
              return (
                <li key={guest.id}>
                  <div
                    draggable={props.canAssign}
                    onDragStart={() => props.onDragStart(guest.id)}
                    className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 hover:bg-subtle"
                  >
                    <GripVertical
                      className="size-4 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                    <Avatar
                      name={`${guest.firstName} ${guest.lastName}`}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {guest.firstName} {guest.lastName}
                      </p>
                      <p className="truncate text-xs text-faint">
                        {table
                          ? table.label
                          : (guest.householdName ?? "Fără familie")}
                        {guest.menu ? ` · ${guest.menu.name}` : " · fără meniu"}
                      </p>
                    </div>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Acțiuni pentru ${guest.firstName} ${guest.lastName}`}
                        >
                          <Ellipsis className="size-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownContent align="end">
                        <DropdownLabel>Așezare</DropdownLabel>
                        {props.selectedTable && (
                          <DropdownItem
                            icon={<Armchair />}
                            disabled={
                              !props.canAssign ||
                              props.action === `guest-${guest.id}`
                            }
                            onSelect={() =>
                              void props.onAssign(
                                guest.id,
                                props.selectedTable!.id,
                              )
                            }
                          >
                            Așază la {props.selectedTable.label}
                          </DropdownItem>
                        )}
                        <DropdownItem
                          icon={<Link2 />}
                          onSelect={() => props.onRule(guest.id)}
                        >
                          Adaugă regulă
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <PanelEmpty
            icon={Users}
            title={props.emptyTitle}
            description="Poți schimba căutarea sau gestiona confirmările în CRM Invitați."
          />
        )}
      </div>
    </div>
  );
}

function SeatingCanvas(props: {
  tables: SeatingTable[];
  guests: SeatingGuest[];
  assignmentByGuest: Map<string, SeatingAssignment>;
  selectedTableId: string | null;
  canAssign: boolean;
  canWrite: boolean;
  draggedGuestId: string | null;
  onSelectTable: (tableId: string) => void;
  onAssign: (guestId: string, tableId: string) => Promise<void>;
  onClearDrag: () => void;
  onAddTable: () => void;
}) {
  return (
    <div
      className="relative min-h-[620px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-line)_1px,transparent_0)] bg-[size:24px_24px]"
      data-testid="seating-canvas"
    >
      <div className="relative h-[620px] min-w-[920px] p-6">
        {props.tables.length ? (
          props.tables.map((table) => {
            const guests = props.guests.filter(
              (guest) =>
                props.assignmentByGuest.get(guest.id)?.seatingTableId ===
                table.id,
            );
            const selected = props.selectedTableId === table.id;
            return (
              <button
                type="button"
                key={table.id}
                onClick={() => props.onSelectTable(table.id)}
                onDragOver={(event) => {
                  if (props.canAssign) event.preventDefault();
                }}
                onDrop={() => {
                  if (props.draggedGuestId)
                    void props.onAssign(props.draggedGuestId, table.id);
                  props.onClearDrag();
                }}
                aria-pressed={selected}
                aria-label={`${table.name}, ${guests.length} din ${table.capacity} locuri`}
                className={cn(
                  "absolute min-w-[128px] border-2 bg-surface px-4 py-3 text-center shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  tableShapeClass(table.shape),
                  selected
                    ? "border-brand shadow-card ring-4 ring-brand/10"
                    : "border-line",
                  table.locked && "border-warning/60",
                )}
                style={{
                  left: `${Math.max(24, Math.min(760, Number(table.x)))}px`,
                  top: `${Math.max(24, Math.min(500, Number(table.y)))}px`,
                  width: `${Math.max(128, Math.min(210, Number(table.width)))}px`,
                  minHeight: `${Math.max(92, Math.min(150, Number(table.height)))}px`,
                  transform: `rotate(${Number(table.rotation)}deg)`,
                }}
                data-testid={`seating-table-${table.id}`}
              >
                <span className="block truncate text-sm font-semibold text-ink">
                  {table.label}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-faint">
                  {guests.length}/{table.capacity} locuri
                </span>
                <span className="mt-2 block line-clamp-2 text-xs leading-4 text-muted">
                  {guests.map((guest) => guest.firstName).join(", ") ||
                    "Masă liberă"}
                </span>
                {table.zone && (
                  <span className="mt-2 inline-flex rounded-full bg-subtle px-2 py-0.5 text-xs text-faint">
                    {table.zone}
                  </span>
                )}
                {table.locked && (
                  <Lock className="absolute right-2 top-2 size-3.5 text-warning" />
                )}
              </button>
            );
          })
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <EmptyState
              icon={Armchair}
              title="Adaugă prima masă"
              description="Alege forma și capacitatea; locurile se creează automat."
              action={
                props.canWrite
                  ? {
                      label: "Adaugă masă",
                      onClick: props.onAddTable,
                      icon: <Plus className="size-4" />,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TableDetail(props: {
  table: SeatingTable;
  tables: SeatingTable[];
  guests: SeatingGuest[];
  assignmentByGuest: Map<string, SeatingAssignment>;
  menus: MenuResource[];
  action: string | null;
  canWrite: boolean;
  canAssign: boolean;
  canManageMenus: boolean;
  canReadSensitive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (input: Record<string, unknown>) => void;
  onAssign: (
    guestId: string,
    tableId: string,
    seatId?: string | null,
  ) => Promise<void>;
  onUnassign: (assignment: SeatingAssignment) => Promise<void>;
  onMenu: (guest: SeatingGuest, menuId: string) => Promise<void>;
}) {
  const menuCounts = new Map<string, number>();
  for (const guest of props.guests)
    menuCounts.set(
      guest.menu?.name ?? "Fără meniu",
      (menuCounts.get(guest.menu?.name ?? "Fără meniu") ?? 0) + 1,
    );
  const occupiedSeats = new Set(
    props.guests
      .map((guest) => props.assignmentByGuest.get(guest.id)?.seatingSeatId)
      .filter(Boolean),
  );
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-ink">
              {String(props.table.name)}
            </p>
            {props.table.locked && <Badge variant="warning">Blocată</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-faint">
            {props.table.assigned}/{props.table.capacity} locuri
            {props.table.zone ? ` · ${props.table.zone}` : ""}
          </p>
        </div>
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Acțiuni pentru masă"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownItem
              icon={<Pencil />}
              onSelect={props.onEdit}
              disabled={!props.canWrite}
            >
              Editează masa
            </DropdownItem>
            <DropdownItem
              icon={props.table.locked ? <Unlock /> : <Lock />}
              onSelect={() => props.onUpdate({ locked: !props.table.locked })}
              disabled={!props.canWrite}
            >
              {props.table.locked ? "Deblochează" : "Blochează"}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 />}
              destructive
              onSelect={props.onDelete}
              disabled={!props.canWrite || props.table.assigned > 0}
            >
              Elimină masa
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
      <div className="mt-4 rounded-xl bg-subtle p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Poziție în sală
          </p>
          <span className="text-xs tabular-nums text-faint">
            {Math.round(Number(props.table.x))},{" "}
            {Math.round(Number(props.table.y))}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mută masa la stânga"
            onClick={() =>
              props.onUpdate({ x: Math.max(0, Number(props.table.x) - 24) })
            }
            disabled={
              !props.canWrite || props.action === `table-${props.table.id}`
            }
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mută masa în sus"
            onClick={() =>
              props.onUpdate({ y: Math.max(0, Number(props.table.y) - 24) })
            }
            disabled={
              !props.canWrite || props.action === `table-${props.table.id}`
            }
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mută masa în jos"
            onClick={() => props.onUpdate({ y: Number(props.table.y) + 24 })}
            disabled={
              !props.canWrite || props.action === `table-${props.table.id}`
            }
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mută masa la dreapta"
            onClick={() => props.onUpdate({ x: Number(props.table.x) + 24 })}
            disabled={
              !props.canWrite || props.action === `table-${props.table.id}`
            }
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Meniuri la masă
          </p>
          <Link
            href="/menus"
            className="text-xs font-medium text-brand hover:underline"
          >
            Gestionează
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {menuCounts.size ? (
            [...menuCounts.entries()].map(([name, count]) => (
              <Badge
                key={name}
                variant={name === "Fără meniu" ? "warning" : "neutral"}
              >
                {name} · {count}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-faint">
              Nu există invitați la această masă.
            </span>
          )}
        </div>
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Invitați
        </p>
        {props.guests.length ? (
          <ul className="mt-2 space-y-3">
            {props.guests.map((guest) => {
              const assignment = props.assignmentByGuest.get(guest.id)!;
              const currentSeat = assignment.seatingSeatId ?? "";
              return (
                <li
                  key={guest.id}
                  className="rounded-xl border border-line bg-surface p-3"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={`${guest.firstName} ${guest.lastName}`}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {guest.firstName} {guest.lastName}
                      </p>
                      <p className="truncate text-xs text-faint">
                        {guest.householdName ?? "Fără familie"}
                      </p>
                    </div>
                    <Tooltip content="Scoate invitatul de la masă">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Scoate ${guest.firstName} de la masă`}
                        onClick={() => void props.onUnassign(assignment)}
                        disabled={
                          !props.canAssign ||
                          assignment.locked ||
                          props.action === `guest-${guest.id}`
                        }
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <Field label="Masă">
                      <Select
                        value={props.table.id}
                        onChange={(event) =>
                          void props.onAssign(guest.id, event.target.value)
                        }
                        disabled={
                          !props.canAssign ||
                          assignment.locked ||
                          props.action === `guest-${guest.id}`
                        }
                      >
                        {props.tables.map((table) => (
                          <option
                            key={table.id}
                            value={table.id}
                            disabled={
                              table.locked ||
                              (table.assigned >= table.capacity &&
                                table.id !== props.table.id)
                            }
                          >
                            {table.label} · {table.assigned}/{table.capacity}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {props.table.seats.length > 0 && (
                      <Field label="Loc">
                        <Select
                          value={currentSeat}
                          onChange={(event) =>
                            void props.onAssign(
                              guest.id,
                              props.table.id,
                              event.target.value || null,
                            )
                          }
                          disabled={
                            !props.canAssign ||
                            assignment.locked ||
                            props.action === `guest-${guest.id}`
                          }
                        >
                          <option value="">Fără loc exact</option>
                          {props.table.seats.map((seat) => (
                            <option
                              key={seat.id}
                              value={seat.id}
                              disabled={
                                seat.status !== "available" ||
                                (occupiedSeats.has(seat.id) &&
                                  seat.id !== currentSeat)
                              }
                            >
                              Loc {seat.label}
                              {seat.accessible ? " · accesibil" : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <Field
                      label="Meniu"
                      className="sm:col-span-2 xl:col-span-1"
                    >
                      <Select
                        value={guest.menu?.id ?? ""}
                        onChange={(event) =>
                          void props.onMenu(guest, event.target.value)
                        }
                        disabled={
                          !props.canManageMenus ||
                          props.action === `menu-${guest.id}`
                        }
                      >
                        <option value="">Fără meniu</option>
                        {props.menus
                          .filter(
                            (menu) =>
                              menu.audience === "all" ||
                              (guest.isChild
                                ? menu.audience === "child"
                                : menu.audience === "adult"),
                          )
                          .map((menu) => (
                            <option key={menu.id} value={menu.id}>
                              {menu.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  </div>
                  {props.canReadSensitive && guest.allergies?.length ? (
                    <div
                      className="mt-2 flex flex-wrap gap-1.5"
                      aria-label={`Alergii pentru ${guest.firstName}`}
                    >
                      <AlertCircle className="mt-0.5 size-4 text-danger" />
                      {guest.allergies.map((allergy) => (
                        <Badge
                          key={allergy.id}
                          variant={
                            allergy.severity === "life_threatening" ||
                            allergy.severity === "high"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {allergy.label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <PanelEmpty
            icon={Users}
            title="Masa este liberă"
            description="Selectează masa, apoi adaugă invitați din lista Neașezați."
          />
        )}
      </div>
      {props.table.notesPrivate && (
        <div className="mt-4 rounded-lg border border-line bg-subtle p-3">
          <p className="text-xs font-semibold text-muted">Notă internă</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink">
            {props.table.notesPrivate}
          </p>
        </div>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  loading,
  canWrite,
  onSelectTable,
  onResolve,
}: {
  issue: OperationResource;
  loading: boolean;
  canWrite: boolean;
  onSelectTable: (tableId: string) => void;
  onResolve: () => void;
}) {
  const severity = String(issue.severity);
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        severity === "critical"
          ? "border-danger/40 bg-danger-soft"
          : "border-warning/40 bg-warning-soft",
      )}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert
          className={cn(
            "mt-0.5 size-4 shrink-0",
            severity === "critical" ? "text-danger" : "text-warning",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {issueLabels[String(issue.type)] ?? humanize(String(issue.type))}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {String(issue.detailsRedacted ?? "Necesită verificare manuală.")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Boolean(issue.tableId) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectTable(String(issue.tableId))}
          >
            Vezi masa
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onResolve}
          disabled={!canWrite}
          loading={loading}
        >
          Marchează verificat
        </Button>
      </div>
    </div>
  );
}

function ConstraintCard({
  constraint,
  guests,
  loading,
  canWrite,
  onDelete,
}: {
  constraint: OperationResource;
  guests: SeatingGuest[];
  loading: boolean;
  canWrite: boolean;
  onDelete: () => void;
}) {
  const guest = guests.find((item) => item.id === constraint.guestId);
  const related = guests.find((item) => item.id === constraint.relatedGuestId);
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {constraintLabels[String(constraint.type)] ??
              humanize(String(constraint.type))}
          </p>
          <p className="mt-1 text-xs text-muted">
            {guest ? `${guest.firstName} ${guest.lastName}` : "Invitat"}
            {related ? ` · ${related.firstName} ${related.lastName}` : ""}
          </p>
          {Boolean(constraint.reason) && (
            <p className="mt-1 text-xs leading-5 text-faint">
              {String(constraint.reason)}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Elimină regula"
          onClick={onDelete}
          disabled={!canWrite || loading}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function PanelEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-subtle">
        <Icon className="size-5 text-faint" />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-64 text-xs leading-5 text-muted">
        {description}
      </p>
    </div>
  );
}

function ExportMenu({
  disabled,
  canReadSensitive,
  onExport,
}: {
  disabled: boolean;
  canReadSensitive: boolean;
  onExport: (
    kind:
      | "table_list"
      | "guest_by_table"
      | "table_cards"
      | "visual_plan"
      | "catering_summary",
    format: "csv" | "svg",
  ) => Promise<void>;
}) {
  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="size-4" /> Export{" "}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" widthClass="w-64">
        <DropdownLabel>Fișiere pentru locație</DropdownLabel>
        <DropdownItem
          icon={<LayoutGrid />}
          onSelect={() => void onExport("visual_plan", "svg")}
        >
          Plan vizual SVG
        </DropdownItem>
        <DropdownItem
          icon={<FileSpreadsheet />}
          onSelect={() => void onExport("table_list", "csv")}
        >
          Lista meselor CSV
        </DropdownItem>
        <DropdownItem
          icon={<Users />}
          onSelect={() => void onExport("guest_by_table", "csv")}
        >
          Invitați pe mese CSV
        </DropdownItem>
        <DropdownItem
          icon={<Armchair />}
          onSelect={() => void onExport("table_cards", "csv")}
        >
          Carduri de masă CSV
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          icon={<UtensilsCrossed />}
          disabled={!canReadSensitive}
          onSelect={() => void onExport("catering_summary", "csv")}
        >
          Sumar catering protejat
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function TableModal({
  open,
  draft,
  setDraft,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  draft: TableDraft;
  setDraft: React.Dispatch<React.SetStateAction<TableDraft>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft.id ? "Editează masa" : "Masă nouă"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button
            onClick={onSave}
            loading={saving}
            disabled={
              !draft.name.trim() ||
              !draft.label.trim() ||
              Number(draft.capacity) < 1
            }
          >
            {draft.id ? "Salvează masa" : "Adaugă masa"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Numele mesei" className="sm:col-span-2">
          <Input
            value={draft.name}
            maxLength={180}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Familia miresei"
          />
        </Field>
        <Field label="Etichetă scurtă">
          <Input
            value={draft.label}
            maxLength={80}
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
            }
            placeholder="M1"
          />
        </Field>
        <Field label="Formă">
          <Select
            value={draft.shape}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                shape: event.target.value as TableDraft["shape"],
              }))
            }
          >
            <option value="round">Rotundă</option>
            <option value="oval">Ovală</option>
            <option value="rectangle">Dreptunghiulară</option>
            <option value="square">Pătrată</option>
            <option value="custom">Personalizată</option>
          </Select>
        </Field>
        <Field label="Capacitate">
          <Input
            type="number"
            min="1"
            max="100"
            value={draft.capacity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                capacity: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Minim recomandat">
          <Input
            type="number"
            min="1"
            max="100"
            value={draft.minimumCapacity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minimumCapacity: event.target.value,
              }))
            }
            placeholder="Opțional"
          />
        </Field>
        <Field label="Zonă" className="sm:col-span-2">
          <Input
            value={draft.zone}
            maxLength={100}
            onChange={(event) =>
              setDraft((current) => ({ ...current, zone: event.target.value }))
            }
            placeholder="Lângă scenă, terasă…"
          />
        </Field>
        <Field label="Notă internă" className="sm:col-span-2">
          <Textarea
            value={draft.notesPrivate}
            maxLength={2000}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                notesPrivate: event.target.value,
              }))
            }
            placeholder="Detalii utile doar organizatorilor"
            rows={3}
          />
        </Field>
        {!draft.id && (
          <p className="sm:col-span-2 rounded-lg bg-info-soft px-3 py-2 text-xs leading-5 text-muted">
            Se vor crea automat {Math.max(0, Number(draft.capacity) || 0)}{" "}
            locuri numerotate. Poți aloca și fără un loc exact.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ConstraintModal(props: {
  open: boolean;
  guest: SeatingGuest | null;
  guests: SeatingGuest[];
  type: string;
  setType: (value: string) => void;
  relatedGuestId: string;
  setRelatedGuestId: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const needsRelated = [
    "keep_together",
    "keep_apart",
    "prefer_together",
    "prefer_apart",
  ].includes(props.type);
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Regulă de așezare"
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Renunță
          </Button>
          <Button
            onClick={props.onSave}
            loading={props.saving}
            disabled={!props.guest || (needsRelated && !props.relatedGuestId)}
          >
            Adaugă regula
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Regulă pentru{" "}
        <span className="font-semibold text-ink">
          {props.guest
            ? `${props.guest.firstName} ${props.guest.lastName}`
            : "invitat"}
        </span>
        . Propunerea automată și verificările o vor respecta.
      </p>
      <div className="space-y-4">
        <Field label="Tipul regulii">
          <Select
            value={props.type}
            onChange={(event) => props.setType(event.target.value)}
          >
            <option value="keep_together">Trebuie așezați împreună</option>
            <option value="prefer_together">Preferă să fie împreună</option>
            <option value="keep_apart">Trebuie așezați separat</option>
            <option value="prefer_apart">Preferă să fie separați</option>
            <option value="accessible_seat_required">
              Necesită loc accesibil
            </option>
            <option value="near_stage">Aproape de scenă</option>
            <option value="near_exit">Aproape de ieșire</option>
          </Select>
        </Field>
        {needsRelated && (
          <Field label="Împreună / separat de">
            <Select
              value={props.relatedGuestId}
              onChange={(event) => props.setRelatedGuestId(event.target.value)}
            >
              <option value="">Alege invitatul</option>
              {props.guests
                .filter(
                  (guest) => guest.id !== props.guest?.id && guest.eligible,
                )
                .map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.firstName} {guest.lastName}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="Motiv / context">
          <Textarea
            value={props.reason}
            maxLength={1000}
            onChange={(event) => props.setReason(event.target.value)}
            placeholder="Opțional, dar util pentru colaboratori"
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  );
}

function SuggestionModal({
  open,
  suggestion,
  guests,
  tables,
  applying,
  onClose,
  onApply,
}: {
  open: boolean;
  suggestion: SeatingSuggestionResource | null;
  guests: SeatingGuest[];
  tables: SeatingTable[];
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!suggestion) return null;
  const guestMap = new Map(guests.map((guest) => [guest.id, guest]));
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Revizuiește propunerea"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Păstrează planul actual
          </Button>
          <Button
            onClick={onApply}
            loading={applying}
            disabled={suggestion.status !== "ready_for_review"}
          >
            Aplică propunerea
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Scor"
          value={suggestion.score}
          helper="din 100"
          tone="neutral"
        />
        <SummaryCard
          label="Alocări"
          value={suggestion.assignments.length}
          helper="propuse"
          tone="success"
        />
        <SummaryCard
          label="Neașezați"
          value={suggestion.unassignedGuestIds.length}
          helper="după propunere"
          tone={suggestion.unassignedGuestIds.length ? "warning" : "success"}
        />
        <SummaryCard
          label="Conflicte"
          value={suggestion.hardConflicts.length}
          helper="necesită confirmare"
          tone={suggestion.hardConflicts.length ? "danger" : "success"}
        />
      </div>
      {suggestion.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-muted">
          <p className="font-semibold text-ink">Avertismente</p>
          <p className="mt-1">
            Propunerea are {suggestion.warnings.length} avertismente. Aplicarea
            le confirmă, dar acestea rămân vizibile în plan.
          </p>
        </div>
      )}
      <div className="mt-5 max-h-80 overflow-y-auto rounded-xl border border-line">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-line bg-subtle px-3 py-2 text-xs font-semibold text-muted">
          <span>Invitat</span>
          <span>Masă propusă</span>
        </div>
        {suggestion.assignments.map((assignment) => {
          const guest = guestMap.get(assignment.guestId);
          const table = tableMap.get(assignment.tableId);
          return (
            <div
              key={assignment.id}
              className="grid grid-cols-[1fr_auto] gap-3 border-b border-line px-3 py-2.5 text-sm last:border-0"
            >
              <span className="truncate text-ink">
                {guest ? `${guest.firstName} ${guest.lastName}` : "Invitat"}
              </span>
              <Badge variant="neutral">{table?.label ?? "Masă"}</Badge>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function PublishModal({
  open,
  plan,
  openIssues,
  reason,
  setReason,
  publishing,
  onClose,
  onPublish,
}: {
  open: boolean;
  plan: SeatingPlanResource;
  openIssues: OperationResource[];
  reason: string;
  setReason: (value: string) => void;
  publishing: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  const critical = openIssues.filter(
    (issue) => String(issue.severity) === "critical",
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        plan.status === "published" ? "Republici planul?" : "Publici planul?"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Mai verific
          </Button>
          <Button
            onClick={onPublish}
            loading={publishing}
            disabled={critical.length > 0 && reason.trim().length < 3}
          >
            {plan.status === "published" ? "Republică" : "Publică"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-muted">
        Invitații care au o masă alocată vor vedea această versiune în portal.
        Modificările ulterioare vor necesita o nouă publicare.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-lg font-semibold text-ink">
            {plan.assignments.length}
          </p>
          <p className="text-xs text-faint">invitați așezați</p>
        </div>
        <div className="rounded-lg bg-subtle p-3 text-center">
          <p className="text-lg font-semibold text-ink">{plan.tables.length}</p>
          <p className="text-xs text-faint">mese</p>
        </div>
        <div
          className={cn(
            "rounded-lg p-3 text-center",
            openIssues.length ? "bg-warning-soft" : "bg-success-soft",
          )}
        >
          <p className="text-lg font-semibold text-ink">{openIssues.length}</p>
          <p className="text-xs text-faint">probleme deschise</p>
        </div>
      </div>
      {critical.length > 0 && (
        <div className="mt-4 space-y-3 rounded-xl border border-danger/40 bg-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <TriangleAlert className="size-4" /> {critical.length} probleme
            critice
          </p>
          <Field label="Justificare obligatorie">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explică de ce publici înainte de rezolvare"
              maxLength={1000}
              rows={3}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function PlanModal(props: {
  open: boolean;
  onClose: () => void;
  events: WeddingEventOption[];
  spaces: OperationResource[];
  eventId: string;
  setEventId: (value: string) => void;
  spaceId: string;
  setSpaceId: (value: string) => void;
  planName: string;
  setPlanName: (value: string) => void;
  save: () => void;
  saving: boolean;
}) {
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Plan de mese nou"
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            Renunță
          </Button>
          <Button
            onClick={props.save}
            loading={props.saving}
            disabled={!props.eventId || !props.planName.trim()}
          >
            Creează planul
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Numele planului">
          <Input
            value={props.planName}
            maxLength={180}
            onChange={(event) => props.setPlanName(event.target.value)}
          />
        </Field>
        <Field label="Eveniment">
          <Select
            value={props.eventId}
            onChange={(event) => props.setEventId(event.target.value)}
          >
            {props.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Spațiu">
          <Select
            value={props.spaceId}
            onChange={(event) => props.setSpaceId(event.target.value)}
          >
            <option value="">Creează automat sala principală</option>
            {props.spaces
              .filter(
                (space) =>
                  !props.eventId || space.weddingEventId === props.eventId,
              )
              .map((space) => (
                <option key={space.id} value={space.id}>
                  {String(space.name)}
                </option>
              ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function tableShapeClass(shape: SeatingTable["shape"]) {
  if (shape === "round") return "rounded-full";
  if (shape === "oval") return "rounded-[48%]";
  if (shape === "square") return "rounded-xl";
  if (shape === "rectangle") return "rounded-lg";
  return "rounded-2xl border-dashed";
}

function humanize(value: string) {
  const text = value.replaceAll("_", " ").trim();
  return text
    ? `${text.charAt(0).toLocaleUpperCase("ro")}${text.slice(1)}`
    : "Necesită verificare";
}
