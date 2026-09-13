"use client";

import * as React from "react";
import {
  BedDouble,
  Building2,
  Download,
  LockKeyhole,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  apiErrorMessage,
  type AccommodationStayResource,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { planHouseholdRoomAssignments } from "./allocation-planner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  StatCard,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";

export function ManagedAccommodationTab() {
  const { currentWorkspace, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [properties, setProperties] = React.useState<OperationResource[]>([]);
  const [stays, setStays] = React.useState<OperationResource[]>([]);
  const [stay, setStay] = React.useState<AccommodationStayResource | null>(null);
  const activeStayId = React.useRef("");
  const [requests, setRequests] = React.useState<OperationResource[]>([]);
  const [events, setEvents] = React.useState<
    Array<{ id: string; title: string }>
  >([]);
  const [eventId, setEventId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [propertyOpen, setPropertyOpen] = React.useState(false);
  const [editingPropertyId, setEditingPropertyId] = React.useState<string | null>(null);
  const [deleteProperty, setDeleteProperty] = React.useState<OperationResource | null>(null);
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [editingRoomId, setEditingRoomId] = React.useState<string | null>(null);
  const [deleteRoom, setDeleteRoom] = React.useState<OperationResource | null>(null);
  const [roomTypeOpen, setRoomTypeOpen] = React.useState(false);
  const [editingRoomTypeId, setEditingRoomTypeId] = React.useState<string | null>(null);
  const [deleteRoomType, setDeleteRoomType] = React.useState<OperationResource | null>(null);
  const [stayOpen, setStayOpen] = React.useState(false);
  const [editingStayId, setEditingStayId] = React.useState<string | null>(null);
  const [deleteStay, setDeleteStay] = React.useState<OperationResource | null>(null);
  const [propertyName, setPropertyName] = React.useState("");
  const [propertyType, setPropertyType] = React.useState("hotel");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("Republica Moldova");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [checkInTime, setCheckInTime] = React.useState("");
  const [checkOutTime, setCheckOutTime] = React.useState("");
  const [propertyInstructions, setPropertyInstructions] = React.useState("");
  const [roomName, setRoomName] = React.useState("");
  const [roomAdults, setRoomAdults] = React.useState("2");
  const [roomChildren, setRoomChildren] = React.useState("0");
  const [roomFloor, setRoomFloor] = React.useState("");
  const [roomAccessible, setRoomAccessible] = React.useState(false);
  const [roomStatus, setRoomStatus] = React.useState("available");
  const [roomNotes, setRoomNotes] = React.useState("");
  const [roomTypeId, setRoomTypeId] = React.useState("");
  const [roomTypeName, setRoomTypeName] = React.useState("");
  const [roomTypeAdults, setRoomTypeAdults] = React.useState("2");
  const [roomTypeChildren, setRoomTypeChildren] = React.useState("0");
  const [roomTypeBeds, setRoomTypeBeds] = React.useState("1 pat dublu");
  const [roomTypeQuantity, setRoomTypeQuantity] = React.useState("1");
  const [roomTypeAccessible, setRoomTypeAccessible] = React.useState(false);
  const [roomTypeNotes, setRoomTypeNotes] = React.useState("");
  const [roomTypePrefix, setRoomTypePrefix] = React.useState("");
  const [roomTypeFloor, setRoomTypeFloor] = React.useState("");
  const [materializeRooms, setMaterializeRooms] = React.useState(true);
  const [propertyId, setPropertyId] = React.useState("");
  const [stayName, setStayName] = React.useState("Cazare nuntă");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
  const [pendingAssignment, setPendingAssignment] = React.useState<{
    guestId: string;
    guestName: string;
    householdId: string;
    requestId: string | null;
    roomId: string;
    checkInDate: string;
    checkOutDate: string;
  } | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [bulkRoomId, setBulkRoomId] = React.useState("");
  const [pendingBulkAssignments, setPendingBulkAssignments] = React.useState<
    Array<NonNullable<typeof pendingAssignment>>
  >([]);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("accommodation.write");
  const canAssign = capabilities.includes("accommodation.assign");
  const canPublish = capabilities.includes("accommodation.publish");
  const canExport = capabilities.includes("accommodation.export");
  const readOnly = !canWrite && !canAssign && !canPublish && !canExport;

  const loadStay = React.useCallback(
    async (id: string) => {
      if (!currentWorkspace) return;
      activeStayId.current = id;
      const selectedStay = await weddingOsApi.accommodationStay(
        currentWorkspace.id,
        id,
      );
      setStay(selectedStay);
      setEventId(selectedStay.weddingEventId);
      setSelectedRequestIds(new Set());
      setBulkRoomId("");
    },
    [currentWorkspace],
  );

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [propertyList, stayList, requestList, calendar] = await Promise.all([
        weddingOsApi.accommodationProperties(currentWorkspace.id),
        weddingOsApi.accommodationStays(currentWorkspace.id),
        weddingOsApi.accommodationRequests(currentWorkspace.id),
        weddingOsApi.workspaceEvents(currentWorkspace.id),
      ]);
      const eventList = calendar.items.map((item) => ({
        id: item.id,
        title: item.title,
      }));
      setProperties(propertyList.items);
      setStays(stayList.items);
      setRequests(requestList.items);
      setEvents(eventList);
      setPropertyId((current) => current || propertyList.items[0]?.id || "");
      const selected =
        stayList.items.find((item) => item.id === activeStayId.current) ??
        stayList.items[0];
      if (selected) await loadStay(selected.id);
      else setStay(null);
      setEventId((current) =>
        current && eventList.some((event) => event.id === current)
          ? current
          : String(selected?.weddingEventId ?? eventList[0]?.id ?? ""),
      );
      setError(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, loadStay]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await operation();
      await load();
      setPropertyOpen(false);
      setRoomOpen(false);
      setRoomTypeOpen(false);
      setStayOpen(false);
      toast({ title: success, variant: "success" });
      return true;
    } catch (cause) {
      toast({
        title: "Operația nu a reușit",
        description: apiErrorMessage(cause),
        variant: "error",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const applyAllocation = async (
    assignment: NonNullable<typeof pendingAssignment>,
    confirmHouseholdSplit: boolean,
  ) => {
    if (!currentWorkspace || !stay) return;
    return run(
      () =>
        weddingOsApi.replaceAccommodationAllocations(
          currentWorkspace.id,
          stay.id,
          stay.version,
          {
            allocations: [
              {
                roomId: assignment.roomId,
                guestId: assignment.guestId,
                householdId: assignment.householdId,
                requestId: assignment.requestId,
                checkInDate: assignment.checkInDate,
                checkOutDate: assignment.checkOutDate,
                overrideReason: assignment.requestId
                  ? null
                  : "Alocare manuală fără cerere RSVP",
              },
            ],
            removeAllocationIds: [],
            confirmHouseholdSplit,
            reason: confirmHouseholdSplit
              ? "Separare confirmată de organizator în editorul de cazare"
              : null,
          },
        ),
      "Invitatul a fost alocat în cameră",
    );
  };

  const applyAllocationBatch = async (
    assignments: Array<NonNullable<typeof pendingAssignment>>,
    confirmHouseholdSplit = false,
    reason: string | null = null,
  ) => {
    if (!currentWorkspace || !stay || assignments.length === 0) return false;
    const applied = await run(
      () =>
        weddingOsApi.replaceAccommodationAllocations(
          currentWorkspace.id,
          stay.id,
          stay.version,
          {
            allocations: assignments.map((assignment) => ({
              roomId: assignment.roomId,
              guestId: assignment.guestId,
              householdId: assignment.householdId,
              requestId: assignment.requestId,
              checkInDate: assignment.checkInDate,
              checkOutDate: assignment.checkOutDate,
              overrideReason: assignment.requestId
                ? null
                : "Alocare manuală fără cerere RSVP",
            })),
            removeAllocationIds: [],
            confirmHouseholdSplit,
            reason,
          },
        ),
      `${assignments.length} invitați au fost alocați`,
    );
    if (applied) setSelectedRequestIds(new Set());
    return applied;
  };

  const requestAllocation = (
    request: OperationResource,
    roomId: string,
  ) => {
    if (!stay) return;
    const assignment = {
      guestId: String(request.guestId),
      guestName: String(request.guestName ?? "Invitat"),
      householdId: String(request.householdId),
      requestId:
        "accommodationRequestId" in request
          ? request.accommodationRequestId
            ? String(request.accommodationRequestId)
            : null
          : request.id,
      roomId,
      checkInDate: String(request.arrivalDate ?? stay.checkInDate).slice(0, 10),
      checkOutDate: String(request.departureDate ?? stay.checkOutDate).slice(0, 10),
    };
    const householdRooms = new Set(
      stay.rooms.flatMap((room) =>
        room.allocations
          .filter(
            (allocation) =>
              allocation.householdId === assignment.householdId &&
              allocation.guestId !== assignment.guestId,
          )
          .map(() => room.id),
      ),
    );
    if (householdRooms.size > 0 && !householdRooms.has(roomId)) {
      setPendingAssignment(assignment);
      return;
    }
    void applyAllocation(assignment, false);
  };

  const moveAllocation = (allocation: OperationResource, roomId: string) => {
    if (!stay) return;
    requestAllocation(
      {
        ...allocation,
        guestName: allocation.guestName,
        arrivalDate: allocation.checkInDate,
        departureDate: allocation.checkOutDate,
      },
      roomId,
    );
  };

  const removeAllocation = async (allocationId: string) => {
    if (!currentWorkspace || !stay) return;
    await run(
      () =>
        weddingOsApi.replaceAccommodationAllocations(
          currentWorkspace.id,
          stay.id,
          stay.version,
          {
            allocations: [],
            removeAllocationIds: [allocationId],
            confirmHouseholdSplit: false,
          },
        ),
      "Alocarea a fost eliminată",
    );
  };

  const openNewProperty = () => {
    setEditingPropertyId(null);
    setPropertyName("");
    setPropertyType("hotel");
    setAddress("");
    setCity("");
    setCountry("Republica Moldova");
    setContactName("");
    setContactPhone("");
    setCheckInTime("");
    setCheckOutTime("");
    setPropertyInstructions("");
    setPropertyOpen(true);
  };

  const openEditProperty = (property: OperationResource) => {
    setEditingPropertyId(property.id);
    setPropertyName(String(property.name ?? ""));
    setPropertyType(String(property.type ?? "hotel"));
    setAddress(String(property.address ?? ""));
    setCity(String(property.city ?? ""));
    setCountry(String(property.country ?? ""));
    setContactName(String(property.contactName ?? ""));
    setContactPhone(String(property.contactPhone ?? ""));
    setCheckInTime(String(property.checkInTime ?? ""));
    setCheckOutTime(String(property.checkOutTime ?? ""));
    setPropertyInstructions(String(property.instructions ?? ""));
    setPropertyOpen(true);
  };

  const saveProperty = () => {
    const input = {
      name: propertyName.trim(),
      type: propertyType,
      address: address.trim(),
      city: city.trim(),
      country: country.trim(),
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      instructions: propertyInstructions.trim() || null,
    };
    const current = properties.find((item) => item.id === editingPropertyId);
    return run(
      () =>
        current
          ? weddingOsApi.updateAccommodationProperty(
              currentWorkspace!.id,
              current.id,
              current.version,
              input,
            )
          : weddingOsApi.createAccommodationProperty(
              currentWorkspace!.id,
              input,
            ),
      current
        ? "Proprietatea a fost actualizată"
        : "Proprietatea a fost adăugată",
    );
  };

  const openNewRoom = () => {
    setEditingRoomId(null);
    setRoomName("");
    setRoomAdults("2");
    setRoomChildren("0");
    setRoomFloor("");
    setRoomAccessible(false);
    setRoomStatus("available");
    setRoomNotes("");
    setRoomTypeId("");
    setPropertyId(stay?.propertyId ?? properties[0]?.id ?? "");
    setRoomOpen(true);
  };

  const openEditRoom = (room: OperationResource) => {
    setEditingRoomId(room.id);
    setPropertyId(stay?.propertyId ?? propertyId);
    setRoomName(String(room.name ?? ""));
    setRoomAdults(String(room.capacityAdults ?? 0));
    setRoomChildren(String(room.capacityChildren ?? 0));
    setRoomFloor(String(room.floor ?? ""));
    setRoomAccessible(room.accessible === true);
    setRoomStatus(String(room.status ?? "available"));
    setRoomNotes(String(room.notesPrivate ?? ""));
    setRoomTypeId(String(room.roomTypeId ?? ""));
    setRoomOpen(true);
  };

  const saveRoom = () => {
    const input = {
      roomTypeId: roomTypeId || null,
      name: roomName.trim(),
      floor: roomFloor.trim() || null,
      capacityAdults: Number(roomAdults),
      capacityChildren: Number(roomChildren),
      accessible: roomAccessible,
      status: roomStatus,
      notesPrivate: roomNotes.trim() || null,
    };
    const current = stay?.rooms.find((item) => item.id === editingRoomId);
    return run(
      () =>
        current
          ? weddingOsApi.updateAccommodationRoom(
              currentWorkspace!.id,
              propertyId,
              current.id,
              current.version,
              input,
            )
          : weddingOsApi.createAccommodationRoom(
              currentWorkspace!.id,
              propertyId,
              input,
            ),
      current ? "Camera a fost actualizată" : "Camera a fost adăugată",
    );
  };

  const openNewRoomType = () => {
    setEditingRoomTypeId(null);
    setPropertyId(stay?.propertyId ?? properties[0]?.id ?? "");
    setRoomTypeName("");
    setRoomTypeAdults("2");
    setRoomTypeChildren("0");
    setRoomTypeBeds("1 pat dublu");
    setRoomTypeQuantity("1");
    setRoomTypeAccessible(false);
    setRoomTypeNotes("");
    setRoomTypePrefix("");
    setRoomTypeFloor("");
    setMaterializeRooms(true);
    setRoomTypeOpen(true);
  };

  const openEditRoomType = (roomType: OperationResource) => {
    setEditingRoomTypeId(roomType.id);
    setPropertyId(stay?.propertyId ?? propertyId);
    setRoomTypeName(String(roomType.name ?? ""));
    setRoomTypeAdults(String(roomType.capacityAdults ?? 0));
    setRoomTypeChildren(String(roomType.capacityChildren ?? 0));
    setRoomTypeBeds(String(roomType.bedConfiguration ?? ""));
    setRoomTypeQuantity(String(roomType.quantity ?? 1));
    setRoomTypeAccessible(roomType.accessible === true);
    setRoomTypeNotes(String(roomType.notes ?? ""));
    setRoomTypeOpen(true);
  };

  const saveRoomType = () => {
    const current = stay?.roomTypes.find(
      (item) => item.id === editingRoomTypeId,
    );
    const common = {
      name: roomTypeName.trim(),
      capacityAdults: Number(roomTypeAdults),
      capacityChildren: Number(roomTypeChildren),
      bedConfiguration: roomTypeBeds.trim(),
      accessible: roomTypeAccessible,
      quantity: Number(roomTypeQuantity),
      notes: roomTypeNotes.trim() || null,
    };
    return run(
      () =>
        current
          ? weddingOsApi.updateAccommodationRoomType(
              currentWorkspace!.id,
              propertyId,
              current.id,
              current.version,
              common,
            )
          : weddingOsApi.createAccommodationRoomType(
              currentWorkspace!.id,
              propertyId,
              {
                ...common,
                materializeRooms,
                roomNamePrefix: roomTypePrefix.trim() || null,
                floor: roomTypeFloor.trim() || null,
              },
            ),
      current
        ? "Tipul de cameră a fost actualizat"
        : materializeRooms
          ? "Tipul și camerele au fost create"
          : "Tipul de cameră a fost creat",
    );
  };

  const openNewStay = () => {
    setEditingStayId(null);
    setStayName("Cazare eveniment");
    setCheckIn("");
    setCheckOut("");
    setPropertyId(properties[0]?.id ?? "");
    setEventId((current) => current || events[0]?.id || "");
    setStayOpen(true);
  };

  const openEditStay = () => {
    if (!stay) return;
    setEditingStayId(stay.id);
    setStayName(String(stay.name));
    setCheckIn(stay.checkInDate.slice(0, 10));
    setCheckOut(stay.checkOutDate.slice(0, 10));
    setPropertyId(stay.propertyId);
    setEventId(stay.weddingEventId);
    setStayOpen(true);
  };

  const saveStay = () => {
    const input = {
      propertyId,
      weddingEventId: eventId,
      name: stayName.trim(),
      checkInDate: checkIn,
      checkOutDate: checkOut,
    };
    return run(
      () =>
        stay && editingStayId === stay.id
          ? weddingOsApi.updateAccommodationStay(
              currentWorkspace!.id,
              stay.id,
              stay.version,
              input,
            )
          : weddingOsApi.createAccommodationStay(
              currentWorkspace!.id,
              input,
            ),
      editingStayId ? "Sejurul a fost actualizat" : "Sejurul a fost creat",
    );
  };

  if (loading)
    return <div className="py-24 text-center text-sm text-muted">Se încarcă inventarul de cazare…</div>;
  if (error)
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Camerele și alocările nu sunt disponibile"
        description={error}
        action={{ label: "Reîncearcă", onClick: () => void load() }}
      />
    );

  const totalRooms = stay?.rooms.length ?? 0;
  const allocations = stay?.rooms.flatMap((room) => room.allocations).length ?? 0;
  const totalCapacity =
    stay?.rooms.reduce(
      (sum, room) =>
        sum + Number(room.capacityAdults ?? 0) + Number(room.capacityChildren ?? 0),
      0,
    ) ?? 0;
  const assignedRequestIds = new Set(
    stay?.rooms.flatMap((room) =>
      room.allocations
        .map((allocation) => allocation.accommodationRequestId)
        .filter((requestId): requestId is string => Boolean(requestId)),
    ) ?? [],
  );
  const relevantRequests = requests.filter(
    (request) =>
      !stay || String(request.weddingEventId ?? "") === stay.weddingEventId,
  );
  const selfBookedRequests = relevantRequests.filter(
    (request) =>
      request.requested === true &&
      String(request.bookingMode) === "recommendations_only",
  );
  const unassigned = relevantRequests.filter(
    (request) =>
      request.requested === true &&
      String(request.bookingMode) !== "recommendations_only" &&
      !assignedRequestIds.has(request.id),
  );
  const activeIssues = stay?.issues.filter((issue) => issue.status !== "resolved") ?? [];
  const selectedProperty = properties.find((item) => item.id === propertyId);
  const propertyRoomTypes = Array.isArray(selectedProperty?.roomTypes)
    ? (selectedProperty.roomTypes as OperationResource[])
    : stay?.propertyId === propertyId
      ? stay.roomTypes
      : [];

  const assignmentFor = (request: OperationResource, targetRoomId: string) => ({
    guestId: String(request.guestId),
    guestName: String(request.guestName ?? "Invitat"),
    householdId: String(request.householdId),
    requestId: request.id,
    roomId: targetRoomId,
    checkInDate: String(request.arrivalDate ?? stay?.checkInDate ?? "").slice(
      0,
      10,
    ),
    checkOutDate: String(
      request.departureDate ?? stay?.checkOutDate ?? "",
    ).slice(0, 10),
  });

  const toggleHouseholdSelection = (householdId: string) => {
    const ids = unassigned
      .filter((request) => String(request.householdId) === householdId)
      .map((request) => request.id);
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      const select = ids.some((id) => !next.has(id));
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const allocateSelected = () => {
    if (!stay || !bulkRoomId) return;
    const assignments = unassigned
      .filter((request) => selectedRequestIds.has(request.id))
      .map((request) => assignmentFor(request, bulkRoomId));
    const incomingGuestIds = new Set(
      assignments.map((assignment) => assignment.guestId),
    );
    const split = assignments.some((assignment) =>
      stay.rooms.some((room) =>
        room.allocations.some(
          (allocation) =>
            String(allocation.householdId) === assignment.householdId &&
            !incomingGuestIds.has(String(allocation.guestId)) &&
            room.id !== assignment.roomId,
        ),
      ),
    );
    if (split) {
      setPendingBulkAssignments(assignments);
      return;
    }
    void applyAllocationBatch(assignments);
  };

  const autoAllocateHouseholds = () => {
    if (!stay) return;
    const plan = planHouseholdRoomAssignments(
      unassigned.map((request) => ({
        id: request.id,
        householdId: String(request.householdId),
        isChild: request.isChild === true,
        requiresAccessibleRoom: request.requiresAccessibleRoom === true,
      })),
      stay.rooms.map((room) => ({
        id: room.id,
        status: String(room.status),
        accessible: room.accessible === true,
        capacityAdults: Number(room.capacityAdults ?? 0),
        capacityChildren: Number(room.capacityChildren ?? 0),
        allocatedGuests: room.allocations.map((allocation) => ({
          isChild: allocation.isChild === true,
        })),
      })),
    );
    const requestsById = new Map(unassigned.map((request) => [request.id, request]));
    const assignments = plan.assignments.flatMap((assignment) => {
      const request = requestsById.get(assignment.requestId);
      return request ? [assignmentFor(request, assignment.roomId)] : [];
    });
    if (!assignments.length) {
      toast({
        title: "Nu există o combinație sigură",
        description:
          "Adaugă camere sau mărește capacitatea. Familiile nu sunt separate automat.",
        variant: "warning",
      });
      return;
    }
    if (plan.unassignedHouseholdIds.length) {
      toast({
        title: "Plan parțial pregătit",
        description: `${plan.unassignedHouseholdIds.length} familii nu încap fără separare și rămân nealocate.`,
        variant: "info",
      });
    }
    void applyAllocationBatch(assignments);
  };

  return (
    <div className="space-y-5" data-testid="managed-accommodation-tab">
      {readOnly ? (
        <div className="flex flex-col gap-3 rounded-xl border border-brand/20 bg-brand-softer/55 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">
                Inventar păstrat în mod doar citire
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                După downgrade, datele existente rămân vizibile. Crearea, alocarea,
                publicarea și exportul sunt disponibile în Plus și Pro.
              </p>
            </div>
          </div>
          <a
            href="/settings?tab=billing"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition-colors hover:border-action hover:bg-action hover:text-on-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Vezi abonamentele
          </a>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 border-b border-line pb-5 sm:pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-brand text-2xl font-semibold leading-tight tracking-[-0.02em] text-brand">
            Camere și alocări
          </h2>
          <p className="mt-2 max-w-3xl text-base leading-6 text-muted">
            Administrează numai proprietățile și camerele pe care le-ai confirmat deja.
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 lg:shrink-0">
          {stays.length > 1 && (
              <Select value={stay?.id ?? ""} onChange={(event) => void loadStay(event.target.value)}>
                {stays.map((item) => (
                  <option key={item.id} value={item.id}>
                    {String(item.name)} ·{" "}
                    {events.find((event) => event.id === item.weddingEventId)
                      ?.title ?? "Eveniment"}
                  </option>
                ))}
              </Select>
          )}
          {stay && (
              <Badge variant={stay.status === "published" ? "success" : "warning"}>
                {stay.status === "published" ? "Publicat" : "Draft"}
              </Badge>
          )}
          <Button
              variant="outline"
              size="sm"
              onClick={openNewRoomType}
              disabled={!canWrite || !properties.length}
            >
              <Plus className="size-3.5" /> Tip de cameră
          </Button>
          <Button
              variant="outline"
              size="sm"
              onClick={openNewRoom}
              disabled={!canWrite || !properties.length}
            >
              <BedDouble className="size-3.5" /> Cameră
          </Button>
          {stay && (
              <Button
                variant="outline"
                size="sm"
                disabled={!canExport}
                onClick={async () => {
                  try {
                    const result = await weddingOsApi.createRoomingList(
                      currentWorkspace!.id,
                      stay.id,
                    );
                    toast({
                      title: "Rooming list se generează",
                      description: `Job ${result.job.id.slice(0, 8)} este în coadă.`,
                      variant: "info",
                    });
                  } catch (cause) {
                    toast({
                      title: "Exportul nu a pornit",
                      description: apiErrorMessage(cause),
                      variant: "error",
                    });
                  }
                }}
              >
                <Download className="size-3.5" /> Rooming list
              </Button>
          )}
          {stay && (
              <Button
                size="sm"
                onClick={() =>
                  void run(
                    () =>
                      weddingOsApi.publishAccommodationStay(
                        currentWorkspace!.id,
                        stay.id,
                        stay.version,
                      ),
                    "Sejurul a fost publicat",
                  )
                }
                disabled={!canPublish || stay.status === "published"}
              >
                <Send className="size-3.5" /> Publică
              </Button>
          )}
          <Button
              size="sm"
              variant="secondary"
              onClick={openNewProperty}
              disabled={!canWrite}
            >
              <Plus className="size-4" /> Proprietate
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label="Cereri cazare"
          value={relevantRequests.filter((item) => item.requested === true).length}
          icon={Users}
        />
        <StatCard label="Proprietăți" value={properties.length} icon={Building2} />
        <StatCard label="Camere" value={totalRooms} icon={BedDouble} />
        <StatCard label="Alocați" value={allocations} />
        <StatCard
          label="Nealocați"
          value={unassigned.length}
          tone={unassigned.length ? "warning" : "default"}
        />
      </div>

      {properties.length ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Proprietăți confirmate</h2>
                <p className="text-xs text-muted">Corectează datele de contact și instrucțiunile înainte de alocare.</p>
              </div>
              <Badge variant="neutral">{properties.length}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {properties.map((property) => (
                <div key={property.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{String(property.name)}</p>
                      <p className="mt-1 text-xs text-muted">{String(property.type).replaceAll("_", " ")} · {String(property.city)}, {String(property.country)}</p>
                      <p className="mt-1 text-xs text-faint">{String(property.address)}</p>
                    </div>
                    {canWrite ? (
                      <div className="flex gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label={`Editează ${String(property.name)}`} onClick={() => openEditProperty(property)}><Pencil className="size-4" /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label={`Șterge ${String(property.name)}`} onClick={() => setDeleteProperty(property)}><Trash2 className="size-4 text-danger" /></Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!stay ? (
        <EmptyState
          icon={BedDouble}
          title={properties.length ? "Creează primul sejur" : "Adaugă prima proprietate"}
          description={
            properties.length
              ? "Un sejur stabilește intervalul și camerele disponibile pentru alocări."
              : "Inventarul începe cu hotelul, pensiunea sau proprietatea rezervată."
          }
          action={
            canWrite
              ? {
                  label: properties.length ? "Creează sejur" : "Adaugă proprietate",
                  onClick: () => (properties.length ? openNewStay() : openNewProperty()),
                  icon: <Plus className="size-4" />,
                }
              : undefined
          }
        />
      ) : (
        <>
          {activeIssues.length > 0 && (
            <Card>
              <CardContent className="flex flex-wrap gap-2 p-3">
                {activeIssues.map((issue) => (
                  <Badge key={issue.id} variant="warning">
                    <TriangleAlert className="size-3" /> {String(issue.type).replaceAll("_", " ")}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">{stay.name}</h2>
                  <p className="text-xs text-muted">
                    {String(stay.property.name)} · {stay.checkInDate.slice(0, 10)} →{" "}
                    {stay.checkOutDate.slice(0, 10)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="brand">
                    {totalCapacity
                      ? `${allocations}/${totalCapacity} persoane`
                      : `${allocations} persoane, capacitate nespecificată`}
                  </Badge>
                  {canWrite ? <Button size="icon-sm" variant="ghost" aria-label="Editează sejurul" onClick={openEditStay}><Pencil className="size-4" /></Button> : null}
                  {canWrite && stay.status !== "published" ? <Button size="icon-sm" variant="ghost" aria-label="Șterge sejurul" onClick={() => setDeleteStay(stay)}><Trash2 className="size-4 text-danger" /></Button> : null}
                </div>
              </div>
              <div className="mb-4">
                <Progress
                  value={allocations}
                  max={Math.max(totalCapacity, 1)}
                  tone={totalCapacity && allocations / totalCapacity > 0.9 ? "warning" : "brand"}
                />
              </div>
              {stay.roomTypes.length > 0 ? (
                <section className="mb-5 rounded-xl bg-subtle/70 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">
                        Blocuri de camere
                      </h3>
                      <p className="text-xs text-muted">
                        Inventarul contractat, grupat după tip și capacitate.
                      </p>
                    </div>
                    <Badge variant="neutral">{stay.roomTypes.length}</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stay.roomTypes.map((roomType) => (
                      <div
                        key={roomType.id}
                        className="rounded-lg border border-line bg-surface p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {String(roomType.name)}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {String(roomType.quantity)} camere · {String(roomType.capacityAdults)} adulți · {String(roomType.capacityChildren)} copii
                            </p>
                            <p className="mt-1 text-xs text-faint">
                              {String(roomType.bedConfiguration)}
                            </p>
                          </div>
                          {canWrite ? (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Editează tipul ${String(roomType.name)}`}
                                onClick={() => openEditRoomType(roomType)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Șterge tipul ${String(roomType.name)}`}
                                onClick={() => setDeleteRoomType(roomType)}
                              >
                                <Trash2 className="size-4 text-danger" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {stay.rooms.map((room) => (
                  <div key={room.id} className="rounded-xl border border-line p-3">
                    <div className="flex justify-between gap-3">
                      <div><p className="font-medium text-ink">{String(room.name)}</p><Badge className="mt-1" variant={room.status === "available" ? "success" : "neutral"}>{String(room.status)}</Badge></div>
                      {canWrite ? <div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={`Editează ${String(room.name)}`} onClick={() => openEditRoom(room)}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" aria-label={`Șterge ${String(room.name)}`} onClick={() => setDeleteRoom(room)}><Trash2 className="size-4 text-danger" /></Button></div> : null}
                    </div>
                    <p className="mt-1 text-xs text-faint">
                      {String(room.capacityAdults)} adulți · {String(room.capacityChildren)} copii
                    </p>
                    <p className="mt-3 text-xs text-muted">
                      {room.allocations.length
                        ? `${room.allocations.length} invitați alocați`
                        : "Cameră liberă"}
                    </p>
                    {room.allocations.length > 0 ? (
                      <ul className="mt-3 space-y-2 border-t border-line pt-3">
                        {room.allocations.map((allocation) => (
                          <li
                            key={allocation.id}
                            className="flex min-w-0 items-center justify-between gap-2"
                          >
                            <span className="min-w-0 truncate text-sm text-ink">
                              {String(allocation.guestName ?? "Invitat")}
                            </span>
                            {canAssign ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <Select
                                  aria-label={`Mută ${String(allocation.guestName ?? "invitatul")}`}
                                  className="max-w-36"
                                  value={room.id}
                                  onChange={(event) =>
                                    moveAllocation(allocation, event.target.value)
                                  }
                                >
                                  {stay.rooms.map((targetRoom) => (
                                    <option key={targetRoom.id} value={targetRoom.id}>
                                      {String(targetRoom.name)}
                                    </option>
                                  ))}
                                </Select>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Elimină alocarea pentru ${String(allocation.guestName ?? "invitat")}`}
                                  onClick={() => void removeAllocation(allocation.id)}
                                >
                                  <Trash2 className="size-4 text-danger" />
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
              {stay.rooms.length === 0 && (
                <EmptyState
                  className="mt-4"
                  icon={BedDouble}
                  title="Nu există camere în proprietate"
                  description="Adaugă camere cu capacitate separată pentru adulți și copii."
                  action={canWrite ? { label: "Adaugă cameră", onClick: openNewRoom } : undefined}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">Cereri nealocate</h2>
                  <p className="text-xs text-muted">
                    Datele provin din ultimul RSVP, fără a fi suprascrise de inventarul hotelului.
                  </p>
                </div>
                <Badge variant={unassigned.length ? "warning" : "success"}>{unassigned.length}</Badge>
              </div>
              {unassigned.length > 0 ? (
                <div className="mb-3 grid gap-3 rounded-xl bg-subtle/70 p-3 lg:grid-cols-[auto_minmax(180px,1fr)_auto_auto] lg:items-center">
                  <Checkbox
                    checked={
                      unassigned.length > 0 &&
                      unassigned.every((request) =>
                        selectedRequestIds.has(request.id),
                      )
                    }
                    onCheckedChange={(checked) =>
                      setSelectedRequestIds(
                        checked
                          ? new Set(unassigned.map((request) => request.id))
                          : new Set(),
                      )
                    }
                    label={`${selectedRequestIds.size} selectați`}
                    disabled={!canAssign}
                  />
                  <Select
                    aria-label="Camera pentru invitații selectați"
                    value={bulkRoomId}
                    onChange={(event) => setBulkRoomId(event.target.value)}
                    disabled={!canAssign || !stay.rooms.length}
                  >
                    <option value="">Alege camera pentru selecție…</option>
                    {stay.rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {String(room.name)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={allocateSelected}
                    disabled={
                      !canAssign || !bulkRoomId || selectedRequestIds.size === 0
                    }
                  >
                    Alocă selecția
                  </Button>
                  <Button
                    size="sm"
                    onClick={autoAllocateHouseholds}
                    disabled={!canAssign || !stay.rooms.length}
                  >
                    Alocă automat familiile
                  </Button>
                </div>
              ) : null}
              {selfBookedRequests.length > 0 ? (
                <p className="mb-3 rounded-lg border border-line px-3 py-2 text-xs text-muted">
                  {selfBookedRequests.length} invitați au cerut numai recomandări și își rezervă singuri; nu sunt incluși în alocarea camerelor.
                </p>
              ) : null}
              {unassigned.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted">Nu există cereri nealocate.</p>
              ) : (
                <div className="space-y-2">
                  {unassigned.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Checkbox
                          checked={selectedRequestIds.has(request.id)}
                          onCheckedChange={(checked) =>
                            setSelectedRequestIds((current) => {
                              const next = new Set(current);
                              if (checked) next.add(request.id);
                              else next.delete(request.id);
                              return next;
                            })
                          }
                          aria-label={`Selectează ${String(request.guestName ?? "invitatul")}`}
                          disabled={!canAssign}
                        />
                        <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {String(request.guestName ?? "Invitat")}
                        </p>
                        {request.householdName ? (
                          <button
                            type="button"
                            className="text-left text-xs font-medium text-brand underline decoration-brand/30 underline-offset-2"
                            onClick={() =>
                              toggleHouseholdSelection(
                                String(request.householdId),
                              )
                            }
                          >
                            {String(request.householdName)} · selectează familia
                          </button>
                        ) : null}
                        <p className="text-xs text-faint">
                          {request.arrivalDate
                            ? String(request.arrivalDate).slice(0, 10)
                            : "Sosire nespecificată"}{" "}
                          →{" "}
                          {request.departureDate
                            ? String(request.departureDate).slice(0, 10)
                            : "Plecare nespecificată"}
                        </p>
                        {request.requiresAccessibleRoom === true ? (
                          <Badge className="mt-1" variant="info">
                            Cameră accesibilă necesară
                          </Badge>
                        ) : null}
                        </div>
                      </div>
                      <Select
                        aria-label={`Alocă ${String(request.guestName ?? "invitatul")} într-o cameră`}
                        className="max-w-56"
                        defaultValue=""
                        onChange={(event) =>
                          event.target.value &&
                          requestAllocation(request, event.target.value)
                        }
                        disabled={!canAssign || !stay.rooms.length}
                      >
                        <option value="">Alocă în cameră…</option>
                        {stay.rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {String(room.name)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Modal
        open={propertyOpen}
        onClose={() => setPropertyOpen(false)}
        title={editingPropertyId ? "Editează proprietatea" : "Proprietate nouă"}
        description="Datele de contact și check-in vor fi disponibile echipei și în listele operaționale."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPropertyOpen(false)}>Renunță</Button>
            <Button
              disabled={saving || !propertyName.trim() || !address.trim() || !city.trim() || !country.trim()}
              onClick={() => void saveProperty()}
            >
              {editingPropertyId ? "Salvează" : "Adaugă"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nume" className="sm:col-span-2">
            <Input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} />
          </Field>
          <Field label="Adresă" className="sm:col-span-2">
            <Input value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          <Field label="Oraș">
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>
          <Field label="Țară">
            <Input value={country} onChange={(event) => setCountry(event.target.value)} />
          </Field>
          <Field label="Tip">
            <Select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}>
              <option value="hotel">Hotel</option>
              <option value="pension">Pensiune</option>
              <option value="apartment">Apartament</option>
              <option value="house">Casă</option>
              <option value="hostel">Hostel</option>
              <option value="other">Alt tip</option>
            </Select>
          </Field>
          <Field label="Persoană de contact">
            <Input value={contactName} onChange={(event) => setContactName(event.target.value)} />
          </Field>
          <Field label="Telefon contact">
            <Input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </Field>
          <Field label="Check-in">
            <Input type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} />
          </Field>
          <Field label="Check-out">
            <Input type="time" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} />
          </Field>
          <Field label="Instrucțiuni pentru oaspeți" className="sm:col-span-2">
            <Textarea rows={3} value={propertyInstructions} onChange={(event) => setPropertyInstructions(event.target.value)} placeholder="Acces, parcare, recepție sau alte detalii utile" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={roomTypeOpen}
        onClose={() => setRoomTypeOpen(false)}
        title={editingRoomTypeId ? "Editează tipul de cameră" : "Bloc de camere nou"}
        description="Definește o singură dată capacitatea și configurația. La creare poți genera automat toate camerele din bloc."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoomTypeOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={
                saving ||
                !propertyId ||
                !roomTypeName.trim() ||
                !roomTypeBeds.trim() ||
                Number(roomTypeQuantity) < 1 ||
                Number(roomTypeAdults) + Number(roomTypeChildren) < 1
              }
              onClick={() => void saveRoomType()}
            >
              {editingRoomTypeId ? "Salvează tipul" : "Creează blocul"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proprietate" className="sm:col-span-2">
            <Select
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              disabled={Boolean(editingRoomTypeId)}
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {String(property.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Denumire tip" className="sm:col-span-2">
            <Input
              value={roomTypeName}
              onChange={(event) => setRoomTypeName(event.target.value)}
              placeholder="Cameră dublă standard"
            />
          </Field>
          <Field label="Adulți / cameră">
            <Input
              type="number"
              min="0"
              value={roomTypeAdults}
              onChange={(event) => setRoomTypeAdults(event.target.value)}
            />
          </Field>
          <Field label="Copii / cameră">
            <Input
              type="number"
              min="0"
              value={roomTypeChildren}
              onChange={(event) => setRoomTypeChildren(event.target.value)}
            />
          </Field>
          <Field label="Număr de camere">
            <Input
              type="number"
              min="1"
              max="500"
              value={roomTypeQuantity}
              onChange={(event) => setRoomTypeQuantity(event.target.value)}
            />
          </Field>
          <Field label="Configurație paturi">
            <Input
              value={roomTypeBeds}
              onChange={(event) => setRoomTypeBeds(event.target.value)}
              placeholder="1 pat dublu + 1 canapea"
            />
          </Field>
          {!editingRoomTypeId ? (
            <>
              <Switch
                checked={materializeRooms}
                onCheckedChange={setMaterializeRooms}
                label="Creează automat camerele"
                description="Generează inventarul concret folosind numărul de camere de mai sus."
                className="sm:col-span-2"
              />
              {materializeRooms ? (
                <>
                  <Field label="Prefix camere">
                    <Input
                      value={roomTypePrefix}
                      onChange={(event) => setRoomTypePrefix(event.target.value)}
                      placeholder={roomTypeName || "Camera dublă"}
                    />
                  </Field>
                  <Field label="Etaj / zonă">
                    <Input
                      value={roomTypeFloor}
                      onChange={(event) => setRoomTypeFloor(event.target.value)}
                      placeholder="Etajul 1"
                    />
                  </Field>
                </>
              ) : null}
            </>
          ) : null}
          <Switch
            checked={roomTypeAccessible}
            onCheckedChange={setRoomTypeAccessible}
            label="Tip accesibil"
            description="Camere potrivite pentru invitați cu cerințe de accesibilitate."
            className="sm:col-span-2"
          />
          <Field label="Note" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={roomTypeNotes}
              onChange={(event) => setRoomTypeNotes(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        title={editingRoomId ? "Editează camera" : "Cameră nouă"}
        description="Definește capacitatea reală și cerințele de accesibilitate înainte de alocare."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoomOpen(false)}>Renunță</Button>
            <Button
              disabled={saving || !propertyId || !roomName}
              onClick={() => void saveRoom()}
            >
              {editingRoomId ? "Salvează camera" : "Adaugă camera"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proprietate" className="sm:col-span-2">
            <Select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{String(property.name)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cameră" className="sm:col-span-2">
            <Input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Camera 101"
            />
          </Field>
          <Field label="Tip de cameră" className="sm:col-span-2">
            <Select
              value={roomTypeId}
              onChange={(event) => setRoomTypeId(event.target.value)}
            >
              <option value="">Fără tip asociat</option>
              {propertyRoomTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {String(type.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Adulți">
            <Input
              type="number"
              min="0"
              value={roomAdults}
              onChange={(event) => setRoomAdults(event.target.value)}
            />
          </Field>
          <Field label="Copii">
            <Input
              type="number"
              min="0"
              value={roomChildren}
              onChange={(event) => setRoomChildren(event.target.value)}
            />
          </Field>
          <Field label="Etaj / zonă">
            <Input value={roomFloor} onChange={(event) => setRoomFloor(event.target.value)} placeholder="Etajul 1" />
          </Field>
          <Field label="Stare inițială">
            <Select value={roomStatus} onChange={(event) => setRoomStatus(event.target.value)}>
              <option value="available">Disponibilă</option>
              <option value="held">Rezervată temporar</option>
              <option value="occupied">Ocupată</option>
              <option value="unavailable">Indisponibilă</option>
            </Select>
          </Field>
          <Switch checked={roomAccessible} onCheckedChange={setRoomAccessible} label="Cameră accesibilă" description="Poate fi alocată invitaților cu cerințe de accesibilitate." className="sm:col-span-2" />
          <Field label="Note private" className="sm:col-span-2">
            <Textarea rows={3} value={roomNotes} onChange={(event) => setRoomNotes(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={stayOpen}
        onClose={() => setStayOpen(false)}
        title={editingStayId ? "Editează sejurul" : "Sejur nou"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStayOpen(false)}>Renunță</Button>
            <Button
              disabled={
                saving ||
                !propertyId ||
                !eventId ||
                !stayName.trim() ||
                !checkIn ||
                !checkOut ||
                checkOut <= checkIn
              }
              onClick={() => void saveStay()}
            >
              {editingStayId ? "Salvează sejurul" : "Creează sejurul"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Eveniment" className="col-span-2">
            <Select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              disabled={Boolean(stay?.rooms.some((room) => room.allocations.length))}
            >
              <option value="">Alege evenimentul</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Proprietate" className="col-span-2">
            <Select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{String(property.name)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nume" className="col-span-2">
            <Input value={stayName} onChange={(event) => setStayName(event.target.value)} />
          </Field>
          <Field label="Check-in">
            <Input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
          </Field>
          <Field label="Check-out">
            <Input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
          </Field>
        </div>
        {checkIn && checkOut && checkOut <= checkIn ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            Check-out trebuie să fie după check-in.
          </p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteProperty)}
        onClose={() => setDeleteProperty(null)}
        onConfirm={async () => {
          const current = deleteProperty;
          if (!current) return;
          const deleted = await run(
            () =>
              weddingOsApi.deleteAccommodationProperty(
                currentWorkspace!.id,
                current.id,
                current.version,
              ),
            "Proprietatea a fost eliminată",
          );
          if (deleted) setDeleteProperty(null);
        }}
        title="Ștergi proprietatea?"
        description="Proprietatea poate fi eliminată numai dacă nu mai are camere sau sejururi active."
        confirmLabel="Șterge proprietatea"
        destructive
        loading={saving}
      />
      <ConfirmDialog
        open={Boolean(deleteRoomType)}
        onClose={() => setDeleteRoomType(null)}
        onConfirm={async () => {
          const current = deleteRoomType;
          if (!current || !stay) return;
          const deleted = await run(
            () =>
              weddingOsApi.deleteAccommodationRoomType(
                currentWorkspace!.id,
                stay.propertyId,
                current.id,
                current.version,
              ),
            "Tipul de cameră a fost eliminat",
          );
          if (deleted) setDeleteRoomType(null);
        }}
        title="Ștergi tipul de cameră?"
        description="Tipul poate fi șters numai după ce nicio cameră activă nu îl mai folosește."
        confirmLabel="Șterge tipul"
        destructive
        loading={saving}
      />
      <ConfirmDialog
        open={Boolean(deleteRoom)}
        onClose={() => setDeleteRoom(null)}
        onConfirm={async () => {
          const current = deleteRoom;
          if (!current || !stay) return;
          const deleted = await run(
            () =>
              weddingOsApi.deleteAccommodationRoom(
                currentWorkspace!.id,
                stay.propertyId,
                current.id,
                current.version,
              ),
            "Camera a fost eliminată",
          );
          if (deleted) setDeleteRoom(null);
        }}
        title="Ștergi camera?"
        description="Camera poate fi eliminată numai dacă nu are invitați alocați."
        confirmLabel="Șterge camera"
        destructive
        loading={saving}
      />
      <ConfirmDialog
        open={Boolean(deleteStay)}
        onClose={() => setDeleteStay(null)}
        onConfirm={async () => {
          const current = deleteStay;
          if (!current) return;
          const deleted = await run(
            () =>
              weddingOsApi.deleteAccommodationStay(
                currentWorkspace!.id,
                current.id,
                current.version,
              ),
            "Sejurul a fost eliminat",
          );
          if (deleted) {
            activeStayId.current = "";
            setDeleteStay(null);
          }
        }}
        title="Ștergi sejurul?"
        description="Sejurul poate fi eliminat numai cât timp este draft și nu are alocări active."
        confirmLabel="Șterge sejurul"
        destructive
        loading={saving}
      />
      <ConfirmDialog
        open={pendingBulkAssignments.length > 0}
        onClose={() => setPendingBulkAssignments([])}
        onConfirm={async () => {
          const assignments = pendingBulkAssignments;
          const applied = await applyAllocationBatch(
            assignments,
            true,
            "Separare confirmată de organizator la alocarea multiplă",
          );
          if (applied) setPendingBulkAssignments([]);
        }}
        title="Separi una sau mai multe familii?"
        description="Cel puțin o familie are deja membri în altă cameră. Confirmă numai dacă separarea este intenționată."
        confirmLabel="Confirmă alocarea"
        loading={saving}
      />
      <ConfirmDialog
        open={Boolean(pendingAssignment)}
        onClose={() => setPendingAssignment(null)}
        onConfirm={async () => {
          const assignment = pendingAssignment;
          if (!assignment) return;
          const applied = await applyAllocation(assignment, true);
          if (applied !== false) setPendingAssignment(null);
        }}
        title="Separi membrii aceleiași familii?"
        description={`${pendingAssignment?.guestName ?? "Invitatul"} va fi cazat într-o altă cameră decât un membru al aceleiași familii. Confirmă numai dacă această separare este intenționată.`}
        confirmLabel="Confirmă separarea"
        loading={saving}
      />
    </div>
  );
}
