"use client";

import * as React from "react";
import {
  BedDouble,
  Building2,
  Download,
  LockKeyhole,
  Plus,
  Send,
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
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  StatCard,
  useToast,
} from "@/components/ui";

export function ManagedAccommodationTab() {
  const { currentWorkspace, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [properties, setProperties] = React.useState<OperationResource[]>([]);
  const [stays, setStays] = React.useState<OperationResource[]>([]);
  const [stay, setStay] = React.useState<AccommodationStayResource | null>(null);
  const [requests, setRequests] = React.useState<OperationResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [propertyOpen, setPropertyOpen] = React.useState(false);
  const [roomOpen, setRoomOpen] = React.useState(false);
  const [stayOpen, setStayOpen] = React.useState(false);
  const [propertyName, setPropertyName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [roomName, setRoomName] = React.useState("");
  const [roomAdults, setRoomAdults] = React.useState("2");
  const [roomChildren, setRoomChildren] = React.useState("0");
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
      if (stayList.items[0]) await loadStay(stayList.items[0].id);
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
    } catch (cause) {
      toast({
        title: "Operația nu a reușit",
        description: apiErrorMessage(cause),
        variant: "error",
      });
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
  const unassigned = requests.filter(
    (request) => request.requested === true && request.status !== "assigned",
  );

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
              onClick={() => setRoomOpen(true)}
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
              onClick={() => setPropertyOpen(true)}
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
                  onClick: () => (properties.length ? setStayOpen(true) : setPropertyOpen(true)),
                  icon: <Plus className="size-4" />,
                }
              : undefined
          }
        />
      ) : (
        <>
          {stay.issues.length > 0 && (
            <Card>
              <CardContent className="flex flex-wrap gap-2 p-3">
                {stay.issues.map((issue) => (
                  <Badge key={issue.id} variant="warning">
                    <TriangleAlert className="size-3" /> {String(issue.type).replaceAll("_", " ")}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">{stay.name}</h2>
                  <p className="text-xs text-muted">
                    {String(stay.property.name)} · {stay.checkInDate.slice(0, 10)} →{" "}
                    {stay.checkOutDate.slice(0, 10)}
                  </p>
                </div>
                <Badge variant="brand">{allocations}/{totalCapacity || "—"} persoane</Badge>
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
                      <p className="font-medium text-ink">{String(room.name)}</p>
                      <Badge variant={room.status === "available" ? "success" : "neutral"}>
                        {String(room.status)}
                      </Badge>
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
                  action={canWrite ? { label: "Adaugă cameră", onClick: () => setRoomOpen(true) } : undefined}
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
                          Cerere invitat {String(request.guestId).slice(0, 8)}
                        </p>
                        <p className="text-xs text-faint">
                          {String(request.arrivalDate ?? "Sosire nespecificată").slice(0, 10)} →{" "}
                          {String(request.departureDate ?? "Plecare nespecificată").slice(0, 10)}
                        </p>
                      </div>
                      <Select
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
        title="Proprietate nouă"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPropertyOpen(false)}>Renunță</Button>
            <Button
              disabled={saving || !propertyName || !address || !city}
              onClick={() =>
                void run(
                  () =>
                    weddingOsApi.createAccommodationProperty(currentWorkspace!.id, {
                      name: propertyName,
                      type: "hotel",
                      address,
                      city,
                      country: "România",
                    }),
                  "Proprietatea a fost adăugată",
                )
              }
            >
              Adaugă
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nume" className="col-span-2">
            <Input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} />
          </Field>
          <Field label="Adresă" className="col-span-2">
            <Input value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          <Field label="Oraș">
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>
          <Field label="Tip">
            <Select disabled><option>Hotel</option></Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        title="Cameră nouă"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoomOpen(false)}>Renunță</Button>
            <Button
              disabled={saving || !propertyId || !roomName}
              onClick={() =>
                void run(
                  () =>
                    weddingOsApi.createAccommodationRoom(currentWorkspace!.id, propertyId, {
                      name: roomName,
                      capacityAdults: Number(roomAdults),
                      capacityChildren: Number(roomChildren),
                      accessible: false,
                      status: "available",
                    }),
                  "Camera a fost adăugată",
                )
              }
            >
              Adaugă camera
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
          <Field label="Cameră" className="col-span-2">
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
        </div>
      </Modal>

      <Modal
        open={stayOpen}
        onClose={() => setStayOpen(false)}
        title="Sejur nou"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStayOpen(false)}>Renunță</Button>
            <Button
              disabled={saving || !propertyId || !stayName || !checkIn || !checkOut}
              onClick={() =>
                void run(
                  () =>
                    weddingOsApi.createAccommodationStay(currentWorkspace!.id, {
                      propertyId,
                      name: stayName,
                      checkInDate: checkIn,
                      checkOutDate: checkOut,
                    }),
                  "Sejurul a fost creat",
                )
              }
            >
              Creează sejurul
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
      </Modal>
    </div>
  );
}
