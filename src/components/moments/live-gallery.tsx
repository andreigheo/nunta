"use client";

import * as React from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  FileVideo,
  Images,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import type { MediaPortalPublicGalleryResource } from "@weddingos/contracts";
import { Button } from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

export function LiveGallery({
  token,
  eventName,
}: {
  token: string;
  eventName: string;
}) {
  const [resource, setResource] =
    React.useState<MediaPortalPublicGalleryResource | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const dialog = React.useRef<HTMLDivElement>(null);
  const closeButton = React.useRef<HTMLButtonElement>(null);

  const load = React.useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const result = await weddingOsApi.publicMediaGallery(token);
        setResource(result);
        setError("");
        setSelected((current) =>
          Math.min(
            current,
            Math.max(0, (result.gallery?.items.length ?? 1) - 1),
          ),
        );
      } catch (cause) {
        if (!quiet) setError(apiErrorMessage(cause));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [token],
  );

  React.useEffect(() => {
    let active = true;
    weddingOsApi
      .publicMediaGallery(token)
      .then((result) => {
        if (!active) return;
        setResource(result);
        setError("");
        setSelected((current) =>
          Math.min(
            current,
            Math.max(0, (result.gallery?.items.length ?? 1) - 1),
          ),
        );
      })
      .catch((cause) => {
        if (active) setError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 12_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [load, token]);

  const items = resource?.gallery?.items ?? [];
  const current = items[selected];
  const close = React.useCallback(() => {
    setOpen(false);
    setPlaying(false);
  }, []);
  const move = React.useCallback(
    (delta: number) => {
      if (!items.length) return;
      setSelected((value) => (value + delta + items.length) % items.length);
    },
    [items.length],
  );

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
      if (event.key === "Tab" && dialog.current) {
        const focusable = dialog.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], video[controls], [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("keydown", keyboard);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [close, move, open]);

  React.useEffect(() => {
    if (!open || !playing || items.length < 2 || current?.mediaType === "VIDEO")
      return;
    const timer = window.setTimeout(() => move(1), 5_500);
    return () => window.clearTimeout(timer);
  }, [current?.mediaType, items.length, move, open, playing, selected]);

  if (loading && !resource)
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl bg-surface">
        <Loader2
          className="size-7 animate-spin text-success"
          aria-label="Se încarcă galeria"
        />
      </div>
    );

  if (error)
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center">
        <p className="text-sm font-medium text-ink">
          Galeria nu poate fi încărcată momentan.
        </p>
        <p className="mt-1 text-xs text-muted">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Reîncearcă
        </Button>
      </div>
    );

  if (!resource?.enabled)
    return (
      <div className="rounded-xl border border-line bg-surface p-7 text-center">
        <Images className="mx-auto size-8 text-faint" aria-hidden />
        <h2 className="mt-3 font-brand text-2xl font-semibold text-ink">
          Galeria nu este publicată
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Organizatorul poate activa galeria live în același cod QR.
        </p>
      </div>
    );

  if (!items.length)
    return (
      <div className="rounded-xl border border-line bg-surface p-7 text-center">
        <Images className="mx-auto size-8 text-success" aria-hidden />
        <h2 className="mt-3 font-brand text-2xl font-semibold text-ink">
          Primele momente apar în curând
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          Materialele devin vizibile aici după verificarea organizatorului.
          Pagina se actualizează automat.
        </p>
      </div>
    );

  return (
    <section aria-labelledby="live-gallery-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="live-gallery-title"
            className="font-brand text-2xl font-semibold text-ink"
          >
            {resource.gallery?.name ?? "Galeria live"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {items.length}{" "}
            {items.length === 1 ? "moment aprobat" : "momente aprobate"} ·
            actualizare automată
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(0);
            setPlaying(true);
            setOpen(true);
          }}
        >
          <Maximize2 className="size-4" />
          Pornește prezentarea
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSelected(index);
              setOpen(true);
            }}
            aria-label={`Deschide momentul ${index + 1}${item.contributorName ? ` de la ${item.contributorName}` : ""}`}
            className="group relative aspect-square overflow-hidden rounded-lg bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Image
              unoptimized
              src={item.previewUrl}
              alt={item.caption || `Moment de la ${eventName}`}
              fill
              sizes="(max-width: 640px) 50vw, 180px"
              className="object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.025]"
            />
            {item.mediaType === "VIDEO" && (
              <span className="absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
            )}
            {item.contributorName && (
              <span className="absolute inset-x-2 bottom-2 ml-9 truncate rounded bg-black/70 px-2 py-1 text-left text-[11px] text-white">
                {item.contributorName}
              </span>
            )}
          </button>
        ))}
      </div>
      {open && current && (
        <div
          ref={dialog}
          className="fixed inset-0 z-[120] flex flex-col bg-brand-panel-strong text-white"
          role="dialog"
          aria-modal="true"
          aria-label={`Prezentarea galeriei ${eventName}`}
        >
          <div className="flex min-h-16 items-center justify-between gap-3 px-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{eventName}</p>
              <p className="text-xs text-white/70">
                {selected + 1} din {items.length}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 1 && (
                <button
                  type="button"
                  className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={
                    playing
                      ? "Oprește redarea automată"
                      : "Pornește redarea automată"
                  }
                >
                  {playing ? (
                    <Pause className="size-5" />
                  ) : (
                    <Play className="size-5" />
                  )}
                </button>
              )}
              <button
                ref={closeButton}
                type="button"
                className="flex size-11 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                onClick={close}
                aria-label="Închide prezentarea"
              >
                <X className="size-6" />
              </button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-4 sm:px-20">
            {current.mediaType === "VIDEO" ? (
              <video
                key={current.id}
                src={current.contentUrl}
                poster={current.previewUrl}
                controls
                autoPlay={playing}
                playsInline
                className="max-h-full max-w-full rounded-lg"
                onEnded={() => playing && move(1)}
              />
            ) : (
              <div className="relative size-full">
                <Image
                  unoptimized
                  src={current.contentUrl}
                  alt={current.caption || `Moment de la ${eventName}`}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority
                />
              </div>
            )}
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-1 flex size-11 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:left-4"
                  onClick={() => move(-1)}
                  aria-label="Momentul anterior"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  className="absolute right-1 flex size-11 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:right-4"
                  onClick={() => move(1)}
                  aria-label="Momentul următor"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          <div className="mx-auto w-full max-w-3xl px-5 pb-5 text-center">
            {current.caption && (
              <p className="text-sm leading-relaxed text-white">
                {current.caption}
              </p>
            )}
            {current.contributorName && (
              <p className="mt-1 text-xs text-white/70">
                Trimis de {current.contributorName}
              </p>
            )}
            {current.mediaType === "VIDEO" && !current.caption && (
              <p className="flex items-center justify-center gap-2 text-xs text-white/70">
                <FileVideo className="size-4" /> Clip video de la eveniment
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
