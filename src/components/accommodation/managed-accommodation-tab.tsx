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
import {
  Badge,
  Button,
  Card,
  CardContent,
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [propertyOpen, setPropertyOpen] = React.useState(false);
  const [editingPropertyId, setEditingPropertyId] = React.useState<string | null>(null);
  const [deleteProperty, setDeleteProperty] = React.useState<OperationResource | null>(null);
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [editingRoomId, setEditingRoomId] = React.useState<string | null>(null);
  const [deleteRoom, setDeleteRoom] = React.useState<OperationResource | null>(null);
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
  const [propertyId, setPropertyId] = React.useState("");
  const [stayName, setStayName] = React.useState("Cazare nuntă");
  const [checkIn, setCheckIn] = React.useState("");
  const [checkOut, setCheckOut] = React.useState("");
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
      setStay(await weddingOsApi.accommodationStay(currentWorkspace.id, id));
    },
    [currentWorkspace],
  );

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [propertyList, stayList, requestList] = await Promise.all([
        weddingOsApi.accommodationProperties(currentWorkspace.id),
        weddingOsApi.accommodationStays(currentWorkspace.id),
        weddingOsApi.accommodationRequests(currentWorkspace.id),
      ]);
      setProperties(propertyList.items);
      setStays(stayList.items);
      setRequests(requestList.items);
      setPropertyId((current) => current || propertyList.items[0]?.id || "");
      const selected =
        stayList.items.find((item) => item.id === activeStayId.current) ??
        stayList.items[0];
      if (selected) await loadStay(selected.id);
      else setStay(null);
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

  const allocate = async (request: OperationResource, roomId: string) => {
    if (!currentWorkspace || !stay) return;
    await run(
      () =>
        weddingOsApi.replaceAccommodationAllocations(
          currentWorkspace.id,
          stay.id,
          stay.version,
          {
            allocations: [
              {
                roomId,
                guestId: request.guestId,
                householdId: request.householdId,
                requestId: request.id,
                checkInDate: String(request.arrivalDate ?? stay.checkInDate).slice(0, 10),
                checkOutDate: String(request.departureDate ?? stay.checkOutDate).slice(0, 10),
              },
            ],
            removeAllocationIds: [],
            confirmHouseholdSplit: true,
            reason: "Alocare confirmată de organizator",
          },
        ),
      "Invitatul a fost alocat în cameră",
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
    setRoomOpen(true);
  };

  const saveRoom = () => {
    const input = {
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

  const openNewStay = () => {
    setEditingStayId(null);
    setStayName("Cazare nuntă");
    setCheckIn("");
    setCheckOut("");
    setPropertyId(properties[0]?.id ?? "");
    setStayOpen(true);
  };

  const openEditStay = () => {
    if (!stay) return;
    setEditingStayId(stay.id);
    setStayName(String(stay.name));
    setCheckIn(stay.checkInDate.slice(0, 10));
    setCheckOut(stay.checkOutDate.slice(0, 10));
    setPropertyId(stay.propertyId);
    setStayOpen(true);
  };

  const saveStay = () => {
    const input = {
      propertyId,
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
  const unassigned = requests.filter(
    (request) =>
      request.requested === true && !assignedRequestIds.has(request.id),
  );
  const activeIssues = stay?.issues.filter((issue) => issue.status !== "resolved") ?? [];

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
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                    {String(item.name)}
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
          value={requests.filter((item) => item.requested === true).length}
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
                  <Badge variant="brand">{allocations}/{totalCapacity || "—"} persoane</Badge>
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
              {unassigned.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted">Nu există cereri nealocate.</p>
              ) : (
                <div className="space-y-2">
                  {unassigned.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {String(request.guestName ?? "Invitat")}
                        </p>
                        {request.householdName ? (
                          <p className="text-xs text-muted">
                            {String(request.householdName)}
                          </p>
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
                      </div>
                      <Select
                        aria-label={`Alocă ${String(request.guestName ?? "invitatul")} într-o cameră`}
                        className="max-w-56"
                        defaultValue=""
                        onChange={(event) => event.target.value && void allocate(request, event.target.value)}
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
    </div>
  );
}
