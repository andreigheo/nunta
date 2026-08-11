"use client";

import * as React from "react";
import {
  Armchair,
  BedDouble,
  Bus,
  CalendarDays,
  CheckCircle2,
  ImageIcon,
  MapPin,
  Navigation,
  QrCode,
  Radio,
  Save,
  Upload,
  Users,
} from "lucide-react";
import type { GuestCompanionBootstrapResource } from "@weddingos/contracts";
import type { GuestAccommodationRecommendationResource } from "@weddingos/contracts";
import { PublishedInvitation } from "@/components/invitations/published-invitation";
import { GuestAccommodationRecommendations } from "@/components/guest/accommodation-recommendations";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { PortalShell } from "@/components/portals/portal-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Progress,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

type Member = {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isChild?: boolean;
  isPlusOne?: boolean;
  plusOneAllowed?: boolean;
};
type EventItem = {
  id: string;
  title?: string;
  startAt?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  directions?: {
    googleMaps?: string;
    waze?: string;
    appleMaps?: string;
  } | null;
};
type MenuItem = { id: string; name?: string; audience?: string };
type GuestOperations = {
  seating?: Array<Record<string, unknown>>;
  transport?: Array<Record<string, unknown>>;
  accommodation?: Array<Record<string, unknown>>;
};
type GuestBootstrap = GuestCompanionBootstrapResource & {
  operations?: GuestOperations;
  accommodationRecommendations?: GuestAccommodationRecommendationResource[];
};

export default function GuestCompanionPage() {
  const { toast } = useToast();
  const [token, setToken] = React.useState("");
  const [data, setData] = React.useState<GuestBootstrap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [attendance, setAttendance] = React.useState<
    Record<string, "CONFIRMED" | "DECLINED" | "UNSURE">
  >({});
  const [menus, setMenus] = React.useState<Record<string, string>>({});
  const [transport, setTransport] = React.useState<Record<string, boolean>>({});
  const [accommodation, setAccommodation] = React.useState<
    Record<string, boolean>
  >({});
  const [allergies, setAllergies] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState("");
  const [plusOneAttending, setPlusOneAttending] = React.useState(false);
  const [plusOneFirstName, setPlusOneFirstName] = React.useState("");
  const [plusOneLastName, setPlusOneLastName] = React.useState("");
  const [plusOneMenuId, setPlusOneMenuId] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const value =
        new URLSearchParams(window.location.search).get("token") ?? "";
      setToken(value);
      if (!value) {
        setLoading(false);
        setError(
          "Linkul personal lipsește. Folosește linkul sau codul QR primit de la organizatori.",
        );
        return;
      }
      void weddingOsApi
        .guestBootstrap(value)
        .then((bootstrap) => {
          setData(bootstrap);
          const rsvp = bootstrap.rsvp as Record<string, unknown>;
          const responses = Array.isArray(rsvp.responses)
            ? (rsvp.responses as Array<Record<string, unknown>>)
            : [];
          const selections = Array.isArray(rsvp.selections)
            ? (rsvp.selections as Array<Record<string, unknown>>)
            : [];
          const householdMembers = (bootstrap.household.members ??
            []) as Member[];
          const existingPlusOne = householdMembers.find(
            (member) => member.isPlusOne,
          );
          setAttendance(
            Object.fromEntries(
              responses.map((response) => [
                `${String(response.guestId)}:${String(response.eventId)}`,
                String(response.attendance).toUpperCase() as
                  "CONFIRMED" | "DECLINED" | "UNSURE",
              ]),
            ),
          );
          setMenus(
            Object.fromEntries(
              selections.map((selection) => [
                String(selection.guestId),
                String(selection.menuId),
              ]),
            ),
          );
          setPlusOneAttending(Boolean(existingPlusOne));
          setPlusOneFirstName(existingPlusOne?.firstName ?? "");
          setPlusOneLastName(existingPlusOne?.lastName ?? "");
          setPlusOneMenuId(
            existingPlusOne
              ? String(
                  selections.find(
                    (selection) =>
                      String(selection.guestId) === existingPlusOne.id,
                  )?.menuId ?? "",
                )
              : "",
          );
          setMessage(typeof rsvp.message === "string" ? rsvp.message : "");
        })
        .catch((caught) => setError(apiErrorMessage(caught)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const householdMembers = (data?.household.members ?? []) as Member[];
  const members = householdMembers.filter((member) => !member.isPlusOne);
  const events = (data?.events ?? []) as EventItem[];
  const menuOptions = (data?.menus ?? []) as MenuItem[];
  const rsvp = (data?.rsvp ?? {}) as Record<string, unknown>;
  const plusOneAllowed = members.some((member) => member.plusOneAllowed);
  const submit = async () => {
    if (!data || !token || !data.allowEdits) return;
    const missing = members.some((member) =>
      events.some((event) => !attendance[`${member.id}:${event.id}`]),
    );
    if (missing) {
      toast({
        title: "Răspuns incomplet",
        description:
          "Alege participarea fiecărei persoane la fiecare eveniment.",
        variant: "warning",
      });
      return;
    }
    if (
      plusOneAttending &&
      (!plusOneFirstName.trim() || !plusOneLastName.trim())
    ) {
      toast({
        title: "Numele însoțitorului lipsește",
        description: "Completează prenumele și numele persoanei plus-one.",
        variant: "warning",
      });
      return;
    }
    setSaving(true);
    try {
      await weddingOsApi.submitGuestRsvp({
        token,
        version: Number(rsvp.version ?? 1),
        idempotencyKey: crypto.randomUUID(),
        members: members.map((member) => ({
          guestId: member.id,
          events: events.map((event) => ({
            eventId: event.id,
            attendance: attendance[`${member.id}:${event.id}`],
          })),
          ...(menus[member.id] ? { menuId: menus[member.id] } : {}),
          allergies: allergies[member.id]
            ? allergies[member.id]
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
          needsTransport: Boolean(transport[member.id]),
          needsAccommodation: Boolean(accommodation[member.id]),
        })),
        ...(plusOneAllowed
          ? {
              plusOne: {
                attending: plusOneAttending,
                ...(plusOneAttending
                  ? {
                      firstName: plusOneFirstName.trim(),
                      lastName: plusOneLastName.trim(),
                      ...(plusOneMenuId ? { menuId: plusOneMenuId } : {}),
                    }
                  : {}),
              },
            }
          : {}),
        message,
      });
      setSaved(true);
      toast({
        title: "Răspuns salvat",
        description:
          "Organizatorii au primit actualizarea. Reîncărcarea paginii păstrează datele.",
        variant: "success",
      });
      setData(await weddingOsApi.guestBootstrap(token));
    } catch (caught) {
      toast({
        title: "Răspunsul nu a fost salvat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };
  const addCalendar = () => {
    if (!events.length) return;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sarbato//Guest Companion//RO",
      ...events.flatMap((event) => [
        "BEGIN:VEVENT",
        `UID:${event.id}@sarbato.space`,
        `DTSTART:${icsDate(event.startAt)}`,
        `SUMMARY:${icsEscape(event.title ?? "Eveniment")}`,
        `LOCATION:${icsEscape(event.locationAddress ?? event.locationName ?? "")}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    downloadBlob(
      new Blob([lines], { type: "text/calendar" }),
      "sarbato-invitatie.ics",
    );
  };

  const operations = data?.operations ?? {};
  return (
    <PortalShell
      role="Spațiul invitaților"
      title={
        data ? `Bine ai venit, ${data.household.name}` : "Invitația Sarbato"
      }
      subtitle="Invitația, programul și confirmarea familiei tale, într-un singur spațiu privat."
      backHref="/sign-in"
      backLabel="Sarbato"
    >
      {loading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted">
            Se verifică linkul personal…
          </CardContent>
        </Card>
      ) : error || !data ? (
        <EmptyState
          icon={Users}
          title="Accesul invitației nu este disponibil"
          description={error ?? "Token invalid sau expirat."}
        />
      ) : (
        <>
          <PublishedInvitation invitation={data.invitation} token={token} onAddCalendar={addCalendar} />
          <GuestAccommodationRecommendations
            items={data.accommodationRecommendations ?? []}
            eventTitles={Object.fromEntries(
              events.map((event) => [event.id, event.title || "Eveniment"]),
            )}
          />
          <section id="confirmare-rsvp" className="mt-8 grid scroll-mt-6 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Confirmarea familiei</CardTitle>
                  <CardDescription>
                    Răspunde pentru fiecare persoană și fiecare moment din program.
                  </CardDescription>
                </div>
                {saved ? (
                  <Badge variant="success" dot>
                    Salvat
                  </Badge>
                ) : (
                  <Badge variant={data.allowEdits ? "warning" : "neutral"} dot>
                    {data.allowEdits ? "Necesită confirmare" : "Închis"}
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <Progress
                  value={Object.keys(attendance).length}
                  max={Math.max(1, members.length * events.length)}
                />
                <div className="mt-7 space-y-7">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="border-t border-line pt-6 first:border-t-0 first:pt-0"
                    >
                      <h3 className="font-semibold text-ink">
                        {member.displayName ??
                          `${member.firstName ?? ""} ${member.lastName ?? ""}`}
                      </h3>
                      <div className="mt-4 space-y-3">
                        {events.map((event) => (
                          <Field
                            key={event.id}
                            label={event.title ?? "Eveniment"}
                          >
                            <Select
                              value={
                                attendance[`${member.id}:${event.id}`] ?? ""
                              }
                              onChange={(change) =>
                                setAttendance((current) => ({
                                  ...current,
                                  [`${member.id}:${event.id}`]: change.target
                                    .value as
                                    "CONFIRMED" | "DECLINED" | "UNSURE",
                                }))
                              }
                            >
                              <option value="">Alege răspunsul</option>
                              <option value="CONFIRMED">Particip</option>
                              <option value="DECLINED">Nu particip</option>
                              <option value="UNSURE">Încă nu știu</option>
                            </Select>
                          </Field>
                        ))}
                        <Field label="Meniu">
                          <Select
                            value={menus[member.id] ?? ""}
                            onChange={(change) =>
                              setMenus((current) => ({
                                ...current,
                                [member.id]: change.target.value,
                              }))
                            }
                          >
                            <option value="">Neselectat</option>
                            {menuOptions
                              .filter(
                                (menu) =>
                                  !member.isChild ||
                                  menu.audience === "child" ||
                                  menu.audience === "all",
                              )
                              .map((menu) => (
                                <option key={menu.id} value={menu.id}>
                                  {menu.name ?? "Meniu"}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <Field
                          label="Alergii"
                          hint="Separate prin virgulă; informația este protejată."
                        >
                          <Textarea
                            value={allergies[member.id] ?? ""}
                            onChange={(change) =>
                              setAllergies((current) => ({
                                ...current,
                                [member.id]: change.target.value,
                              }))
                            }
                          />
                        </Field>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Checkbox
                            checked={Boolean(transport[member.id])}
                            onCheckedChange={(value) =>
                              setTransport((current) => ({
                                ...current,
                                [member.id]: value,
                              }))
                            }
                            label="Am nevoie de transport"
                          />
                          <Checkbox
                            checked={Boolean(accommodation[member.id])}
                            onCheckedChange={(value) =>
                              setAccommodation((current) => ({
                                ...current,
                                [member.id]: value,
                              }))
                            }
                            label="Am nevoie de cazare"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Field label="Mesaj pentru organizatori">
                    <Textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  </Field>
                  {!data.allowEdits && (
                    <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
                      {data.closedMessage}
                    </p>
                  )}
                  <Button
                    className="w-full sm:w-auto"
                    disabled={!data.allowEdits || saving}
                    onClick={() => void submit()}
                  >
                    {saved ? (
                      <CheckCircle2 className="size-4" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {saving ? "Se salvează…" : "Salvează RSVP"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Programul evenimentului</CardTitle>
                    <CardDescription>Orele, locațiile și traseele publicate de organizatori.</CardDescription>
                  </div>
                  <CalendarDays className="size-4 text-faint" />
                </CardHeader>
                <CardContent>
                  {events.map((event) => (
                    <div key={event.id} className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {event.startAt
                          ? new Date(event.startAt).toLocaleString("ro-RO")
                          : "Ora va fi anunțată"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3" />
                        {event.locationName ??
                          event.locationAddress ??
                          "Locația va fi anunțată"}
                      </p>
                      {event.directions?.googleMaps && (
                        <Button
                          size="sm"
                          variant="link"
                          className="mt-2 h-auto px-0 py-1"
                          onClick={() =>
                            window.open(
                              event.directions?.googleMaps,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <Navigation className="size-3" />
                          Deschide traseul
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <GuestOperationsCards operations={operations} />
              {plusOneAllowed && (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Însoțitorul tău</CardTitle>
                      <CardDescription>Adaugă detaliile persoanei care vine cu tine.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Checkbox
                      checked={plusOneAttending}
                      onCheckedChange={setPlusOneAttending}
                      label="Vin cu un însoțitor"
                    />
                    {plusOneAttending && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Prenume" required>
                            <Input
                              aria-label="Prenume plus-one"
                              value={plusOneFirstName}
                              onChange={(event) =>
                                setPlusOneFirstName(event.target.value)
                              }
                            />
                          </Field>
                          <Field label="Nume" required>
                            <Input
                              aria-label="Nume plus-one"
                              value={plusOneLastName}
                              onChange={(event) =>
                                setPlusOneLastName(event.target.value)
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Meniu plus-one">
                          <Select
                            value={plusOneMenuId}
                            onChange={(event) =>
                              setPlusOneMenuId(event.target.value)
                            }
                          >
                            <option value="">Neselectat</option>
                            {menuOptions
                              .filter((menu) => menu.audience !== "child")
                              .map((menu) => (
                                <option key={menu.id} value={menu.id}>
                                  {menu.name ?? "Meniu"}
                                </option>
                              ))}
                          </Select>
                        </Field>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </section>
          <GuestWeddingDayPanel token={token} events={events} />
        </>
      )}
    </PortalShell>
  );
}

function GuestWeddingDayPanel({
  token,
  events,
}: {
  token: string;
  events: EventItem[];
}) {
  const { toast } = useToast();
  const [live, setLive] = React.useState<Record<string, unknown> | null>(null);
  const [credential, setCredential] = React.useState<Record<
    string,
    unknown
  > | null>(null);
  const [moments, setMoments] = React.useState<Array<Record<string, unknown>>>(
    [],
  );
  const [gallery, setGallery] = React.useState<Array<Record<string, unknown>>>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [nextLive, nextCredential, nextMoments, nextGallery] =
        await Promise.all([
          weddingOsApi.guestWeddingDayLive(token),
          weddingOsApi.guestCheckInCredential(token),
          weddingOsApi.guestMoments(token),
          weddingOsApi.guestGallery(token),
        ]);
      setLive(nextLive);
      setCredential(nextCredential);
      setMoments(nextMoments.items);
      setGallery(nextGallery.items);
    } catch (caught) {
      toast({
        title: "Datele live nu sunt disponibile",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, token]);

  React.useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    const stream = new EventSource(
      `/api/v1/guest/wedding-day/live/stream?token=${encodeURIComponent(token)}`,
    );
    const refresh = () => void load();
    for (const eventName of [
      "wedding_day.plan_live.v1",
      "wedding_day.plan_paused.v1",
      "wedding_day.announcement_published.v1",
    ])
      stream.addEventListener(eventName, refresh);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      stream.close();
    };
  }, [load, token]);

  const uploadMoment = async (file: File) => {
    const event = events[0];
    if (!event) {
      toast({ title: "Eveniment indisponibil", variant: "warning" });
      return;
    }
    setUploading(true);
    try {
      const checksumSha256 = await sha256(file);
      const mediaType = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
      const created = await weddingOsApi.createGuestMoment(token, {
        weddingEventId: event.id,
        mediaType,
        originalFileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256,
      });
      await weddingOsApi.putSignedUpload(
        created.upload.url,
        file,
        created.upload.headers,
      );
      await weddingOsApi.completeGuestMoment(
        token,
        created.moment.id,
        checksumSha256,
      );
      await load();
      toast({
        title: "Moment încărcat",
        description:
          "Fișierul este verificat anti-malware și intră în moderare înainte de publicare.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Încărcarea nu a reușit",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading)
    return (
      <Card className="mt-8">
        <CardContent className="p-6 text-sm text-muted">
          Se încarcă experiența live…
        </CardContent>
      </Card>
    );

  const announcements = Array.isArray(live?.announcements)
    ? (live.announcements as Array<Record<string, unknown>>)
    : [];
  const checkIns = Array.isArray(live?.checkIns)
    ? (live.checkIns as Array<Record<string, unknown>>)
    : [];

  return (
    <section
      className="mt-10 grid gap-5 lg:grid-cols-3"
      data-testid="guest-wedding-day-live"
    >
      <header className="lg:col-span-3">
        <h2 className="font-brand text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">
          În ziua evenimentului
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          Aici găsești accesul la check-in, anunțurile organizatorilor și momentele împărtășite de invitați.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Check-in rapid</CardTitle>
          <QrCode className="size-4 text-brand" />
        </CardHeader>
        <CardContent>
          {credential ? (
            <>
              {/* The SVG endpoint resolves the opaque, household-scoped credential server-side. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- QR access requires the current guest token and bypasses the image optimizer */}
              <img
                src={`/api/v1/guest/check-in/credential/qr?token=${encodeURIComponent(token)}`}
                alt="Cod QR personal pentru check-in"
                className="mx-auto aspect-square w-full max-w-52 rounded-xl border border-line bg-white p-2"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <Badge variant="success" dot>
                  {String(credential.status)}
                </Badge>
                <span className="text-xs text-faint">
                  {
                    checkIns.filter((item) => item.status === "CHECKED_IN")
                      .length
                  }{" "}
                  persoane înregistrate
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Prezintă acest cod la stația de check-in. Codul nu conține nume,
                e-mail sau alte date personale.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Check-in-ul nu este activ pentru acest eveniment.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anunțuri în timp real</CardTitle>
          <Radio className="size-4 text-brand" />
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.length ? (
            announcements.slice(0, 5).map((announcement) => (
              <div
                key={String(announcement.id)}
                className="rounded-lg bg-subtle p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {String(announcement.title)}
                  </p>
                  <Badge
                    variant={
                      announcement.priority === "URGENT" ? "danger" : "neutral"
                    }
                  >
                    {String(announcement.priority)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {String(announcement.body)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">Nu există anunțuri active.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Momentele invitaților</CardTitle>
          <ImageIcon className="size-4 text-brand" />
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft/40">
            <Upload className="size-4" />
            {uploading
              ? "Se încarcă și se verifică…"
              : "Adaugă o fotografie sau un videoclip"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              className="sr-only"
              disabled={uploading}
              onChange={(change) => {
                const file = change.target.files?.[0];
                if (file) void uploadMoment(file);
                change.target.value = "";
              }}
            />
          </label>
          <div className="mt-3 space-y-2">
            {moments.slice(0, 4).map((moment) => (
              <div
                key={String(moment.id)}
                className="flex items-center justify-between rounded-lg bg-subtle px-3 py-2 text-xs"
              >
                <span className="text-muted">
                  Moment {String(moment.id).slice(0, 8)}
                </span>
                <Badge
                  variant={
                    moment.status === "REJECTED"
                      ? "danger"
                      : moment.status === "PUBLISHED"
                        ? "success"
                        : "warning"
                  }
                >
                  {String(moment.status)}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">
            {gallery.reduce(
              (total, collection) =>
                total +
                (Array.isArray(collection.items) ? collection.items.length : 0),
              0,
            )}{" "}
            momente sunt publicate în galeria familiei.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function GuestOperationsCards({ operations }: { operations: GuestOperations }) {
  const seating = operations.seating ?? [];
  const transport = operations.transport ?? [];
  const accommodation = operations.accommodation ?? [];
  if (!seating.length && !transport.length && !accommodation.length)
    return null;
  return (
    <Card data-testid="guest-operations">
      <CardHeader>
        <div>
          <CardTitle>Detaliile familiei tale</CardTitle>
          <CardDescription>Locurile, transportul și cazarea publicate pentru grupul tău.</CardDescription>
        </div>
        <Badge variant="success">Publicate</Badge>
      </CardHeader>
      <CardContent>
        {seating.length > 0 && (
          <section className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Armchair className="size-4 text-brand" />
              Locuri la masă
            </p>
            {seating.map((item, index) => (
              <p
                key={`${String(item.guestId)}-${index}`}
                className="mt-2 text-xs text-muted"
              >
                <span className="font-medium text-ink">
                  {String(item.guestName)}
                </span>{" "}
                · {String(item.tableLabel)}
                {Boolean(item.seatLabel)
                  ? `, loc ${String(item.seatLabel)}`
                  : ""}{" "}
                · {String(item.eventTitle)}
              </p>
            ))}
          </section>
        )}
        {transport.length > 0 && (
          <section className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Bus className="size-4 text-brand" />
              Transport
            </p>
            {transport.map((item, index) => (
              <div
                key={`${String(item.guestId)}-${index}`}
                className="mt-2 text-xs text-muted"
              >
                <p>
                  <span className="font-medium text-ink">
                    {String(item.guestName)}
                  </span>{" "}
                  · {String(item.routeName)}
                </p>
                <p>
                  {new Date(String(item.departureAt)).toLocaleString("ro-RO")} ·{" "}
                  {String(item.originName)} → {String(item.destinationName)}
                </p>
                {Boolean(item.pickupStop) && (
                  <p>Îmbarcare: {String(item.pickupStop)}</p>
                )}
              </div>
            ))}
          </section>
        )}
        {accommodation.length > 0 && (
          <section className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <BedDouble className="size-4 text-brand" />
              Cazare
            </p>
            {accommodation.map((item, index) => (
              <div
                key={`${String(item.guestId)}-${index}`}
                className="mt-2 text-xs text-muted"
              >
                <p>
                  <span className="font-medium text-ink">
                    {String(item.guestName)}
                  </span>{" "}
                  · {String(item.propertyName)}, {String(item.roomName)}
                </p>
                <p>
                  {String(item.checkInDate).slice(0, 10)} →{" "}
                  {String(item.checkOutDate).slice(0, 10)} ·{" "}
                  {String(item.propertyAddress)}
                </p>
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function icsDate(value?: string | null) {
  return value
    ? new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")
    : "";
}
function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
