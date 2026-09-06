"use client";
import * as React from "react";
import Image from "next/image";
import type { MediaPortalResource } from "@weddingos/contracts";
import {
  Copy,
  Download,
  LockKeyhole,
  Pause,
  Play,
  QrCode,
  RotateCw,
  Settings2,
  Check,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Modal,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export function CollectionControl({
  workspaceId,
  demoMode,
  canManage,
}: {
  workspaceId: string;
  demoMode: boolean;
  canManage: boolean;
}) {
  const [portals, setPortals] = React.useState<MediaPortalResource[]>([]);
  const [events, setEvents] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [eventId, setEventId] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState<"rotate" | "expiry" | null>(null);
  const [expiry, setExpiry] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();
  const load = React.useCallback(() => {
    if (demoMode || !canManage) return;
    return weddingOsApi
      .mediaPortals(workspaceId)
      .then((result) => {
        setPortals(result.items);
        setEvents(result.events);
        setEventId((current) =>
          result.events.some((e) => e.id === current)
            ? current
            : (result.events[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((cause) => {
        setError(apiErrorMessage(cause));
      })
      .finally(() => setLoading(false));
  }, [workspaceId, demoMode, canManage]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const portal = portals.find((p) => p.weddingEventId === eventId);
  const active = portal?.active && new Date(portal.expiresAt) > new Date();
  async function save(
    change: { rotate?: boolean; active?: boolean; expiresAt?: string } = {},
  ) {
    if (busy || demoMode || !canManage) return;
    setBusy(true);
    try {
      await weddingOsApi.saveMediaPortal(workspaceId, {
        weddingEventId: eventId,
        version: portal?.version,
        ...change,
      });
      await load();
      setDialog(null);
      toast({ title: "Colectarea a fost actualizată", variant: "success" });
    } catch (cause) {
      setError(apiErrorMessage(cause));
      if ((cause as { status?: number }).status === 409) await load();
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    if (!portal) return;
    try {
      await navigator.clipboard.writeText(portal.url);
      setCopied(true);
    } catch {
      toast({
        title: "Selectează și copiază linkul din câmp",
        variant: "error",
      });
    }
  }
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="font-brand text-xl font-semibold">
            Colectează momente de la participanți
          </h2>
          <p className="mt-1 text-xs text-muted">
            Un singur cod QR pentru fotografiile și clipurile tuturor.
          </p>
        </div>
        {portal && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void save({
                  active: !active,
                  ...(!active && new Date(portal.expiresAt) <= new Date()
                    ? {
                        expiresAt: new Date(
                          Date.now() + 30 * 86400_000,
                        ).toISOString(),
                      }
                    : {}),
                })
              }
            >
              {active ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {active ? "Pauză" : "Activează"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setDialog("rotate")}
            >
              <RotateCw className="size-3.5" />
              Rotește accesul
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger"
        >
          {error}
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Reîncearcă
          </Button>
        </div>
      )}
      {demoMode || !canManage ? (
        <p className="px-5 pb-5 text-sm text-muted">
          {demoMode
            ? "Codul QR devine disponibil într-un eveniment real. Modul demo nu colectează materiale."
            : "Organizatorul poate activa și distribui codul QR al evenimentului."}
        </p>
      ) : loading ? (
        <p className="px-5 pb-5 text-sm text-muted">Se încarcă setările…</p>
      ) : (
        <div className="flex flex-col gap-5 px-5 pb-5 sm:flex-row sm:items-center">
          <div className="flex size-36 shrink-0 items-center justify-center self-center rounded-lg border border-line bg-white p-2 sm:self-auto">
            {portal ? (
              <Image
                unoptimized
                src={portal.qrDataUrl}
                alt="Cod QR pentru încărcarea materialelor"
                width={144}
                height={144}
              />
            ) : (
              <QrCode className="size-20 text-neutral-300" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Field label="Eveniment" className="min-w-0 flex-1">
                <Select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  disabled={busy || !events.length}
                >
                  {!events.length && (
                    <option value="">Nu există evenimente</option>
                  )}
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {portal && (
                <Badge variant={active ? "success" : "neutral"}>
                  {active ? "Activ" : "Închis"}
                </Badge>
              )}
            </div>
            {portal ? (
              <>
                <Field label="Link pentru încărcare">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <Input
                      readOnly
                      value={portal.url}
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 text-xs"
                    />
                    <Button variant="outline" onClick={() => void copyLink()}>
                      {copied ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copied ? "Copiat" : "Copiază linkul"}
                    </Button>
                  </div>
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    download="sarbato-cod-qr.png"
                    href={portal.qrDataUrl}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-3 text-sm hover:bg-subtle"
                  >
                    <Download className="size-4" />
                    Descarcă QR
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setExpiry(portal.expiresAt.slice(0, 10));
                      setDialog("expiry");
                    }}
                  >
                    <Settings2 className="size-4" />
                    Până la{" "}
                    {new Date(portal.expiresAt).toLocaleDateString("ro-RO")}
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  {(portal.reservedBytes / 1024 ** 3).toFixed(2)} /{" "}
                  {portal.maximumBytes / 1024 ** 3} GB rezervați ·{" "}
                  {portal.uploadCount} / {portal.maximumFiles} fișiere
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  {events.length
                    ? "Activează colectarea pentru a primi materiale direct în această pagină. Linkul inițial este valabil 30 de zile."
                    : "Adaugă întâi evenimentul în pagina de invitați, apoi revino aici."}
                </p>
                <Button disabled={!eventId || busy} onClick={() => void save()}>
                  <QrCode className="size-4" />
                  {busy ? "Se activează…" : "Activează codul QR"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex items-start gap-3 border-t border-line bg-subtle/40 px-5 py-3 text-xs leading-relaxed text-muted">
        <LockKeyhole className="size-4 shrink-0 text-success" />
        Participanții pot încărca fără cont. Materialele ajung în spațiul tău
        privat și sunt verificate înainte să le deschizi.
      </div>
      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={
          dialog === "rotate" ? "Schimbi codul QR?" : "Perioada de colectare"
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Renunță
            </Button>
            <Button
              disabled={busy || (dialog === "expiry" && !expiry)}
              onClick={() =>
                void save(
                  dialog === "rotate"
                    ? { rotate: true }
                    : {
                        expiresAt: new Date(`${expiry}T23:59:59`).toISOString(),
                      },
                )
              }
            >
              {dialog === "rotate" ? "Generează cod nou" : "Salvează"}
            </Button>
          </>
        }
      >
        {dialog === "rotate" ? (
          <p className="text-sm leading-relaxed text-muted">
            Codul și linkul vechi vor înceta să funcționeze, inclusiv pentru
            încărcările în curs. Materialele deja trimise rămân păstrate.
            Distribuie noul QR participanților.
          </p>
        ) : (
          <Field label="Ultima zi pentru încărcări">
            <Input
              type="date"
              value={expiry}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>
        )}
      </Modal>
    </Card>
  );
}
