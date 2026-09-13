"use client";

import Link from "next/link";
import * as React from "react";
import type {
  GuestMessagingOverview,
  GuestMessageInput,
} from "@weddingos/contracts";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  ConfirmDialog,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

const statuses: Record<string, string> = {
  QUEUED: "În coadă",
  SENDING: "Se trimite",
  ACCEPTED: "Acceptat de furnizor",
  SENT: "Trimis",
  DELIVERED: "Livrat",
  READ: "Citit",
  FAILED: "Eșuat",
  CANCELLED: "Anulat",
  UNKNOWN: "Livrare neconfirmată; nu retrimite automat",
};
const templates: Record<GuestMessageInput["template"], string> = {
  event_update: "Noutăți despre eveniment",
  invitation: "Invitație",
  reminder: "Reamintire",
};

type AudienceType = "manual" | "all" | "group" | "household";

export function GuestMessagingCenter({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = React.useState<GuestMessagingOverview | null>(null);
  const [channel, setChannel] =
    React.useState<GuestMessageInput["channel"]>("SMS");
  const [template, setTemplate] =
    React.useState<GuestMessageInput["template"]>("event_update");
  const [body, setBody] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [audienceType, setAudienceType] =
    React.useState<AudienceType>("manual");
  const [audienceValue, setAudienceValue] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [consentGuest, setConsentGuest] = React.useState<string | null>(null);
  const [evidence, setEvidence] = React.useState("");
  const pending = React.useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const load = React.useCallback(async () => {
    try {
      setData(await weddingOsApi.guestMessaging(workspaceId));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }, [workspaceId]);
  React.useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 10_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
    };
  }, [load]);
  const selectedGuestIds = React.useMemo(() => {
    if (!data || audienceType === "manual") return selected;
    const candidateIds =
      audienceType === "all"
        ? data.guests.map((guest) => guest.id)
        : audienceType === "group"
          ? (data.groups.find((group) => group.id === audienceValue)
              ?.guestIds ?? [])
          : (data.households.find(
              (household) => household.id === audienceValue,
            )?.guestIds ?? []);
    return data.guests
      .filter(
        (guest) =>
          candidateIds.includes(guest.id) &&
          guest.phone &&
          (channel === "SMS" ? guest.sms : guest.whatsapp),
      )
      .map((guest) => guest.id);
  }, [audienceType, audienceValue, channel, data, selected]);
  async function saveConsent(guestId: string, allowed: boolean) {
    setBusy(true);
    setError("");
    try {
      await weddingOsApi.saveGuestMessageConsent(workspaceId, guestId, {
        channel,
        allowed,
        evidence: allowed ? evidence : "Acord retras de organizator.",
      });
      setConsentGuest(null);
      setEvidence("");
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (busy) return;
    const input = {
      guestIds: [...selectedGuestIds].sort(),
      channel,
      template,
      body: body.trim(),
    };
    const fingerprint = JSON.stringify(input);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await weddingOsApi.sendGuestMessage(
        workspaceId,
        input,
        pending.current.key,
      );
      setNotice(
        `${result.ids.length} ${result.ids.length === 1 ? "mesaj înregistrat" : "mesaje înregistrate"}. Urmărește mai jos confirmarea livrării.`,
      );
      pending.current = null;
      setSelected([]);
      setAudienceType("manual");
      setAudienceValue("");
      setConfirm(false);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  const optedIn = React.useCallback(
    (guest: NonNullable<typeof data>["guests"][number]) =>
      channel === "SMS" ? guest.sms : guest.whatsapp,
    [channel],
  );
  const eligible = React.useCallback(
    (guest: NonNullable<typeof data>["guests"][number]) =>
      Boolean(guest.phone) && optedIn(guest),
    [optedIn],
  );
  const audienceGuestIds = React.useMemo(() => {
    if (!data || audienceType === "manual") return [];
    if (audienceType === "all") return data.guests.map((guest) => guest.id);
    const source =
      audienceType === "group"
        ? data.groups.find((group) => group.id === audienceValue)
        : data.households.find(
            (household) => household.id === audienceValue,
          );
    return source?.guestIds ?? [];
  }, [audienceType, audienceValue, data]);
  const audienceSummary = React.useMemo(() => {
    if (!data || audienceType === "manual") return null;
    const candidates = data.guests.filter((guest) =>
      audienceGuestIds.includes(guest.id),
    );
    return {
      total: candidates.length,
      eligible: candidates.filter(eligible).length,
      withoutConsent: candidates.filter(
        (guest) => guest.phone && !optedIn(guest),
      ).length,
      withoutPhone: candidates.filter((guest) => !guest.phone).length,
    };
  }, [audienceGuestIds, audienceType, data, eligible, optedIn]);
  const canSend =
    Boolean(data?.channels[channel]) &&
    selectedGuestIds.length > 0 &&
    selectedGuestIds.length <= 500 &&
    selectedGuestIds.length <= (data?.remainingToday ?? 0) &&
    body.trim().length > 0 &&
    !busy &&
    (channel !== "WHATSAPP" || data?.templates.includes(template));
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>SMS și WhatsApp</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Anunță invitații despre program, confirmări sau schimbări. Mesajele
            se trimit numai celor care și-au dat acordul.
          </p>
        </div>
        <Link
          href="/guests"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Lista și grupurile
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        ) : null}
        {!data ? (
          <p className="text-sm text-muted">
            Se încarcă opțiunile de comunicare…
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <label className="block text-sm">
                  Canal
                  <Select
                    value={channel}
                    onChange={(e) => {
                      setChannel(e.target.value as typeof channel);
                      setSelected([]);
                      setAudienceType("manual");
                      setAudienceValue("");
                      setConsentGuest(null);
                    }}
                  >
                    <option value="SMS">
                      SMS{!data.channels.SMS ? " (în curs de activare)" : ""}
                    </option>
                    <option value="WHATSAPP">
                      WhatsApp
                      {!data.channels.WHATSAPP ? " (în curs de activare)" : ""}
                    </option>
                  </Select>
                </label>
                {!data.channels[channel] ? (
                  <p className="rounded-lg bg-subtle p-3 text-sm text-muted">
                    Trimiterea automată pe acest canal nu este activată încă.
                    Poți folosi e-mailul sau distribuirea manuală din această
                    pagină.
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    Cui trimiți
                    <Select
                      value={audienceType}
                      onChange={(event) => {
                        const value = event.target.value as AudienceType;
                        setAudienceType(value);
                        setAudienceValue("");
                        setSelected([]);
                      }}
                    >
                      <option value="manual">Aleg persoane</option>
                      <option value="group">Un grup</option>
                      <option value="household">Un grup / o familie</option>
                      <option value="all">Toți cu acord activ</option>
                    </Select>
                  </label>
                  {audienceType === "group" ? (
                    <label className="block text-sm">
                      Grup
                      <Select
                        value={audienceValue}
                        onChange={(event) =>
                          setAudienceValue(event.target.value)
                        }
                      >
                        <option value="">Alege grupul</option>
                        {data.groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} · {group.guestIds.length}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                  {audienceType === "household" ? (
                    <label className="block text-sm">
                      Grup / familie
                      <Select
                        value={audienceValue}
                        onChange={(event) =>
                          setAudienceValue(event.target.value)
                        }
                      >
                        <option value="">Alege grupul sau familia</option>
                        {data.households.map((household) => (
                          <option key={household.id} value={household.id}>
                            {household.name} · {household.guestIds.length}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                </div>
                {audienceSummary ? (
                  <div className="rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">
                    <p className="font-semibold text-ink">
                      {audienceSummary.eligible} din {audienceSummary.total}{" "}
                      pot primi mesajul prin {channel}.
                    </p>
                    {audienceSummary.withoutConsent ||
                    audienceSummary.withoutPhone ? (
                      <p className="mt-1">
                        Excluși automat: {audienceSummary.withoutConsent} fără
                        acord activ și {audienceSummary.withoutPhone} fără
                        telefon.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <label className="block text-sm">
                  Caută invitați
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nume, email, telefon, etichetă sau grup"
                  />
                </label>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-line divide-y divide-line">
                  {data.guests
                    .filter((g) =>
                      `${g.name} ${g.email ?? ""} ${g.phone ?? ""} ${g.householdName} ${g.groups.map((group) => group.name).join(" ")}`
                        .toLocaleLowerCase("ro")
                        .includes(search.toLocaleLowerCase("ro")),
                    )
                    .map((g) => (
                      <div key={g.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedGuestIds.includes(g.id)}
                              disabled={
                                audienceType !== "manual" ||
                                !g.phone ||
                                !optedIn(g) ||
                                busy
                              }
                              onChange={(e) =>
                                setSelected((ids) =>
                                  e.target.checked
                                    ? [...ids, g.id]
                                    : ids.filter((id) => id !== g.id),
                                )
                              }
                            />
                            <span className="min-w-0 break-words">
                              {g.name}
                              <span className="block text-xs text-muted">
                                {g.phone ?? "Telefon lipsă"} ·{" "}
                                {g.householdName}
                              </span>
                              {g.groups.length ? (
                                <span className="mt-1 block text-xs text-faint">
                                  {g.groups
                                    .map((group) => group.name)
                                    .join(" · ")}
                                </span>
                              ) : null}
                            </span>
                          </label>
                          {g.phone ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                if (optedIn(g)) {
                                  setSelected((ids) =>
                                    ids.filter((id) => id !== g.id),
                                  );
                                  void saveConsent(g.id, false);
                                } else {
                                  setConsentGuest(g.id);
                                  setEvidence("");
                                }
                              }}
                            >
                              {optedIn(g)
                                ? "Retrage acordul"
                                : "Înregistrează acordul"}
                            </Button>
                          ) : null}
                        </div>
                        {consentGuest === g.id ? (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs text-muted">
                              Cum și când a acceptat invitatul mesajele pe{" "}
                              {channel}?
                              <Input
                                value={evidence}
                                onChange={(e) => setEvidence(e.target.value)}
                                maxLength={300}
                                placeholder="De exemplu: a confirmat prin formular, la data…"
                              />
                            </label>
                            <Button
                              size="sm"
                              disabled={busy || evidence.trim().length < 10}
                              onClick={() => void saveConsent(g.id, true)}
                            >
                              Confirm acordul primit
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  {!data.guests.length ? (
                    <p className="p-3 text-sm text-muted">
                      Adaugă întâi invitații și telefoanele lor în lista de
                      invitați.
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  {selectedGuestIds.length} selectați · {data.remainingToday}{" "}
                  mesaje disponibile azi din {data.dailyLimit}
                </p>
                {selectedGuestIds.length > data.remainingToday ? (
                  <p role="alert" className="text-xs text-danger">
                    Selecția depășește limita rămasă pentru astăzi. Restrânge
                    grupul sau continuă după resetarea limitei.
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 space-y-3">
                {channel === "WHATSAPP" ? (
                  <label className="block text-sm">
                    Tip de mesaj
                    <Select
                      value={template}
                      onChange={(e) =>
                        setTemplate(e.target.value as typeof template)
                      }
                    >
                      {(
                        Object.keys(
                          templates,
                        ) as GuestMessageInput["template"][]
                      ).map((key) => (
                        <option
                          key={key}
                          value={key}
                          disabled={!data.templates.includes(key)}
                        >
                          {templates[key]}
                          {!data.templates.includes(key)
                            ? " (indisponibil)"
                            : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
                <label className="block text-sm">
                  Mesaj
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={1000}
                    rows={6}
                    placeholder="Bună! Vă așteptăm sâmbătă la ora 18:00. Programul actualizat este…"
                  />
                </label>
                <p className="text-xs text-muted">
                  {body.length}/1000 caractere. SMS-urile lungi și diacriticele
                  pot consuma mai multe segmente. WhatsApp folosește șabloanele
                  disponibile pentru acest canal și același număr salvat în
                  profilul invitatului.
                </p>
                <Button
                  disabled={!canSend}
                  loading={busy}
                  onClick={() => setConfirm(true)}
                >
                  Verifică și trimite
                </Button>
                <p className="text-xs text-muted">
                  Un mesaj „acceptat” nu înseamnă încă „livrat”. Statusul se
                  actualizează după confirmarea furnizorului.
                </p>
              </div>
            </div>
            <div className="border-t border-line pt-4">
              <h3 className="font-brand text-lg font-semibold">
                Ultimele mesaje
              </h3>
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                {data.messages.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap justify-between gap-2 rounded-lg bg-subtle p-3 text-sm"
                  >
                    <span>
                      {m.guestName} · {m.channel}
                    </span>
                    <span>
                      {statuses[m.status] ?? m.status}
                      {m.errorCode ? ` (${m.errorCode})` : ""}
                    </span>
                  </div>
                ))}
                {!data.messages.length ? (
                  <p className="text-sm text-muted">
                    Nu ai trimis încă mesaje SMS sau WhatsApp.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        )}
        <ConfirmDialog
          open={confirm}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          onConfirm={() => void send()}
          loading={busy}
          title={`Trimite ${selectedGuestIds.length} ${selectedGuestIds.length === 1 ? "mesaj" : "mesaje"} prin ${channel}`}
          description={`Destinatarii selectați vor primi: „${body.trim()}”. Costurile canalului și segmentele SMS se aplică potrivit configurației platformei.`}
          confirmLabel="Trimite notificările"
        />
      </CardContent>
    </Card>
  );
}
