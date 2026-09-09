"use client";
import * as React from "react";
import Image from "next/image";
import {
  Camera,
  ImagePlus,
  CheckCircle2,
  FileVideo,
  ImageIcon,
  LockKeyhole,
  RefreshCw,
  X,
  Loader2,
  Upload,
} from "lucide-react";
import type { MediaPortalPublicResource } from "@weddingos/contracts";
import {
  Button,
  Field,
  Input,
  Textarea,
  ErrorState,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { LiveGallery } from "@/components/moments/live-gallery";
import { weddingOsApi, apiErrorMessage } from "@/lib/api/client";
import {
  fileChecksum,
  mediaFileError,
  mediaTypes,
  opaqueUploadToken,
  uploadWithProgress,
} from "@/lib/media-upload";

type QueuedFile = {
  id: string;
  file: File;
  preview: string;
  status: "ready" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};
export function EventUpload() {
  const [portal, setPortal] = React.useState<MediaPortalPublicResource | null>(
    null,
  );
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState("");
  const [files, setFiles] = React.useState<QueuedFile[]>([]);
  const [name, setName] = React.useState("");
  const [caption, setCaption] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [view, setView] = React.useState<"upload" | "gallery">("upload");
  const camera = React.useRef<HTMLInputElement>(null);
  const gallery = React.useRef<HTMLInputElement>(null);
  const abort = React.useRef<AbortController | null>(null);
  const filesRef = React.useRef(files);
  const urls = React.useRef(new Set<string>());
  React.useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const load = React.useCallback((access: string) => {
    return weddingOsApi
      .publicMediaPortal(access)
      .then((result) => {
        setPortal(result);
        setError("");
      })
      .catch((cause) => {
        setError(
          access
            ? apiErrorMessage(cause)
            : "Scanează codul QR al evenimentului sau deschide linkul primit de la organizator.",
        );
      })
      .finally(() => setToken(access));
  }, []);
  React.useEffect(() => {
    let access = window.location.hash.slice(1);
    try {
      access ||= sessionStorage.getItem("sarbato-media-access") || "";
      if (access) sessionStorage.setItem("sarbato-media-access", access);
    } catch {
      /* Private browsing may disable storage; the current upload still works. */
    }
    if (access) history.replaceState(null, "", window.location.pathname);
    void load(access);
    const previews = urls.current;
    return () => {
      abort.current?.abort();
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [load]);
  React.useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  function addFiles(incoming: FileList | null) {
    if (!incoming || busy) return;
    const additions: QueuedFile[] = [];
    const messages: string[] = [];
    for (const file of Array.from(incoming)) {
      if (files.length + additions.length >= 20) {
        messages.push("Poți trimite până la 20 de fișiere într-o serie.");
        break;
      }
      const invalid = mediaFileError(file);
      if (invalid) {
        messages.push(`${file.name}: ${invalid}`);
        continue;
      }
      if (
        [...files, ...additions].some(
          (item) =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified,
        )
      )
        continue;
      const preview = URL.createObjectURL(file);
      urls.current.add(preview);
      additions.push({
        id: opaqueUploadToken(),
        file,
        preview,
        status: "ready",
        progress: 0,
      });
    }
    setFiles((current) => [...current, ...additions]);
    setNotice(messages.join(" "));
  }
  function patch(id: string, update: Partial<QueuedFile>) {
    setFiles((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }
  function remove(item: QueuedFile) {
    URL.revokeObjectURL(item.preview);
    urls.current.delete(item.preview);
    setFiles((current) => current.filter((f) => f.id !== item.id));
  }
  async function send(onlyId?: string) {
    if (abort.current || !portal?.active) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setNotice("");
    try {
      for (const item of filesRef.current.filter(
        (f) => f.status !== "done" && (!onlyId || f.id === onlyId),
      )) {
        if (controller.signal.aborted) break;
        patch(item.id, { status: "uploading", progress: 0, error: undefined });
        try {
          const checksumSha256 = await fileChecksum(item.file);
          if (controller.signal.aborted) throw new Error("Încărcare oprită.");
          const created = await weddingOsApi.createPublicMoment(token, {
            uploadToken: item.id,
            consent: true,
            mediaType: item.file.type.startsWith("image/") ? "IMAGE" : "VIDEO",
            originalFileName: item.file.name,
            contentType: item.file.type,
            sizeBytes: item.file.size,
            checksumSha256,
            contributorName: name.trim() || undefined,
            caption: caption.trim() || undefined,
          });
          if (!created.completed) {
            if (!created.upload)
              throw new Error("Sesiunea de încărcare nu este disponibilă.");
            await uploadWithProgress(
              item.file,
              created.upload.url,
              created.upload.headers,
              (progress) => patch(item.id, { progress }),
              controller.signal,
            );
            await weddingOsApi.completePublicMoment(
              token,
              created.momentId,
              item.id,
            );
          }
          patch(item.id, { status: "done", progress: 100 });
        } catch (cause) {
          patch(item.id, {
            status: "error",
            error:
              cause instanceof Error ? cause.message : apiErrorMessage(cause),
          });
        }
      }
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }
  const done = files.filter((f) => f.status === "done").length;
  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg space-y-7">
        <SarbatoMark />
        {error ? (
          <ErrorState
            title="Link de încărcare indisponibil"
            description={error}
            onRetry={token ? () => void load(token) : undefined}
          />
        ) : !portal ? (
          <Skeleton className="h-72" />
        ) : (
          <>
            <header>
              <p className="mb-2 text-sm font-medium text-success">
                {portal.eventName}
              </p>
              <h1 className="font-brand text-4xl font-semibold tracking-tight text-ink">
                Adaugă momentele tale
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Distribuie fotografii și clipuri video de la eveniment.
              </p>
            </header>
            {portal.liveGalleryEnabled && (
              <SegmentedControl
                className="grid w-full grid-cols-2"
                ariaLabel="Alege între încărcare și galeria live"
                value={view}
                onChange={(value) => setView(value as "upload" | "gallery")}
                options={[
                  { value: "upload", label: "Contribuie" },
                  { value: "gallery", label: "Galerie live" },
                ]}
              />
            )}
            {view === "gallery" && portal.liveGalleryEnabled ? (
              <LiveGallery token={token} eventName={portal.eventName} />
            ) : !portal.active ? (
              <div
                role="status"
                className="rounded-xl border border-line bg-surface p-6"
              >
                <h2 className="font-brand text-2xl font-semibold">
                  Colectarea este închisă
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Organizatorul poate reactiva linkul. Materialele deja trimise
                  sunt păstrate.
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={camera}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Selectează din cameră"
                  tabIndex={-1}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={gallery}
                  type="file"
                  accept={mediaTypes.join(",")}
                  multiple
                  className="sr-only"
                  aria-label="Selectează din galerie"
                  tabIndex={-1}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div
                  className="grid grid-cols-2 divide-x divide-line rounded-xl border border-dashed border-line-strong bg-surface p-4"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => camera.current?.click()}
                    className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg p-3 text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                      <Camera className="size-7" />
                    </span>
                    Deschide camera
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => gallery.current?.click()}
                    className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg p-3 text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                      <ImagePlus className="size-7" />
                    </span>
                    Alege din galerie
                  </button>
                </div>
                <p className="!mt-2 text-xs text-muted">
                  Fotografii până la 20 MB · Video până la 100 MB · Maximum 20
                  de fișiere per serie
                </p>
                {notice && (
                  <p
                    role="alert"
                    className="rounded-lg bg-warning-soft p-3 text-sm text-ink"
                  >
                    {notice}
                  </p>
                )}
                {files.length > 0 && (
                  <section
                    aria-label="Fișiere selectate"
                    className="overflow-hidden rounded-xl border border-line bg-surface"
                  >
                    <h2 className="border-b border-line px-4 py-3 text-sm font-medium">
                      Coada de încărcare ({files.length})
                    </h2>
                    <ul className="divide-y divide-line">
                      {files.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 p-3"
                        >
                          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle">
                            {item.file.type.startsWith("image/") ? (
                              <Image
                                unoptimized
                                src={item.preview}
                                alt=""
                                width={48}
                                height={48}
                                className="size-full object-cover"
                              />
                            ) : (
                              <FileVideo className="size-6 text-muted" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.file.name}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {(item.file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                              {item.status === "done"
                                ? "Trimis"
                                : item.status === "uploading"
                                  ? item.progress >= 95
                                    ? "Se finalizează…"
                                    : `Se încarcă… ${item.progress}%`
                                  : item.status === "error"
                                    ? "Netrimis"
                                    : "Pregătit"}
                            </p>
                            {item.status === "uploading" && (
                              <progress
                                aria-label={`Progres ${item.file.name}`}
                                value={item.progress}
                                max={100}
                                className="mt-2 h-1.5 w-full accent-[var(--success)]"
                              />
                            )}
                            {item.error && (
                              <p
                                role="alert"
                                className="mt-1 text-xs text-danger"
                              >
                                {item.error}
                              </p>
                            )}
                            {item.status === "error" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() => void send(item.id)}
                              >
                                <RefreshCw className="size-3" />
                                Reîncearcă
                              </Button>
                            )}
                          </div>
                          {item.status === "done" ? (
                            <CheckCircle2
                              className="mt-2 size-5 text-success"
                              aria-label="Trimis"
                            />
                          ) : item.status === "uploading" ? (
                            <Loader2 className="mt-2 size-5 animate-spin text-success" />
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => remove(item)}
                              aria-label={`Elimină ${item.file.name}`}
                              className="flex size-10 items-center justify-center rounded-lg hover:bg-subtle"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <Field label="Numele tău (opțional)">
                  <Input
                    value={name}
                    maxLength={100}
                    disabled={busy}
                    placeholder="De exemplu, Andrei"
                    autoComplete="given-name"
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Un mesaj pentru organizator (opțional)">
                  <Textarea
                    value={caption}
                    maxLength={1000}
                    disabled={busy}
                    placeholder="Scrie un mesaj scurt…"
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </Field>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0" />
                  Materialele ajung în spațiul privat al organizatorului.
                  Trimite doar materiale pe care ai dreptul să le distribui.
                  Prin trimitere, accepți prelucrarea lor pentru acest
                  eveniment.
                </p>
                <Button
                  className="w-full"
                  disabled={busy || !files.some((f) => f.status !== "done")}
                  onClick={() => void send()}
                >
                  <Upload className="size-4" />
                  {busy ? "Se trimit materialele…" : "Trimite materialele"}
                </Button>
                {busy && (
                  <Button
                    className="w-full"
                    variant="ghost"
                    onClick={() => abort.current?.abort()}
                  >
                    Oprește încărcarea
                  </Button>
                )}
                {done > 0 && (
                  <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4"
                  >
                    <CheckCircle2 className="size-5 shrink-0 text-success" />
                    <div>
                      <p className="text-sm font-semibold">
                        Mulțumim.{" "}
                        {done === 1
                          ? "Un material a ajuns"
                          : `${done} materiale au ajuns`}{" "}
                        la organizator.
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Organizatorul le va vedea după verificarea fișierelor.
                      </p>
                      {done === files.length && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              files.forEach((f) => {
                                URL.revokeObjectURL(f.preview);
                                urls.current.delete(f.preview);
                              });
                              setFiles([]);
                              gallery.current?.click();
                            }}
                          >
                            <ImageIcon className="size-4" />
                            Adaugă alte momente
                          </Button>
                          {portal.liveGalleryEnabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setView("gallery")}
                            >
                              Vezi galeria live
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <footer className="border-t border-line pt-4 text-center text-xs text-faint">
          Momente împărtășite prin Sarbato ·{" "}
          <a className="underline" href="/confidentialitate">
            Confidențialitate
          </a>
        </footer>
      </div>
    </main>
  );
}
