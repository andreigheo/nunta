"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Images,
  Link2,
  Palette,
  Plus,
  Redo2,
  Share2,
  Sparkles,
  Store,
  Trash2,
  Type,
  Undo2,
  Save,
} from "lucide-react";
import type {
  WorkspaceCreativeItem,
  WorkspaceCreativeState,
} from "@weddingos/contracts";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/api/workspace-context";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

interface BoardItem {
  id: string;
  kind: "image" | "text" | "color" | "link" | "vendor";
  label: string;
  category: string;
  note?: string;
  source?: string;
  budget?: string;
  hue?: string;
}

function ConnectedMoodboards({
  workspaceId,
  canWrite,
}: {
  workspaceId: string;
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const [state, setState] = React.useState<WorkspaceCreativeState | null>(null);
  const [draft, setDraft] = React.useState<WorkspaceCreativeState | null>(null);
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [boardModal, setBoardModal] = React.useState(false);
  const [boardName, setBoardName] = React.useState("");
  const [itemModal, setItemModal] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [mediaPreviews, setMediaPreviews] = React.useState<
    Record<string, string>
  >({});
  const previewUrls = React.useRef<string[]>([]);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [itemForm, setItemForm] = React.useState({
    kind: "image" as WorkspaceCreativeItem["kind"],
    label: "",
    category: "Detalii",
    note: "",
    sourceUrl: "",
    mediaId: "",
    fileName: "",
    colorHex: "#91A899",
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const value = await weddingOsApi.creativeState(workspaceId);
      setState(value);
      setDraft(value);
      setSelectedBoardId(value.boards[0]?.id ?? null);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  React.useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const save = async () => {
    if (!canWrite || !draft || !state) return;
    setSaving(true);
    try {
      const value = await weddingOsApi.updateCreativeState(
        workspaceId,
        state.version,
        {
          conceptTitle: draft.conceptTitle,
          conceptDescription: draft.conceptDescription,
          palette: draft.palette,
          boards: draft.boards,
        },
      );
      setState(value);
      setDraft(value);
      toast({
        title: "Moodboarduri salvate",
        description:
          "Colecțiile sunt acum persistente și disponibile colaboratorilor autorizați.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Moodboardurile nu au fost salvate",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!canWrite || !draft) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({
        title: "Format neacceptat",
        description: "Folosește JPEG, PNG sau WebP.",
        variant: "error",
      });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Imagine prea mare",
        description: "Limita este 20 MB.",
        variant: "error",
      });
      return;
    }
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const checksum = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const session = await weddingOsApi.createUploadSession(workspaceId, {
        purpose: "INVITATION_MEDIA",
        originalFileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256: checksum,
      });
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
      if (!mediaId) throw new Error("Storage-ul nu a returnat imaginea.");
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.push(previewUrl);
      setMediaPreviews((current) => ({
        ...current,
        [mediaId]: previewUrl,
      }));
      setItemForm((current) => ({
        ...current,
        mediaId,
        fileName: file.name,
        sourceUrl: "",
      }));
      toast({
        title: "Imagine încărcată",
        description: "Se scanează în fundal; salvează elementul în moodboard.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Imaginea nu a fost încărcată",
        description:
          caught instanceof Error ? caught.message : apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (error)
    return (
      <ErrorState
        title="Moodboardurile nu pot fi încărcate"
        description={error}
        onRetry={() => void load()}
      />
    );
  if (loading || !draft || !state)
    return <div className="h-72 animate-pulse rounded-xl bg-subtle" />;

  const selectedBoard =
    draft.boards.find((board) => board.id === selectedBoardId) ?? null;

  const createBoard = () => {
    if (!canWrite) return;
    const name = boardName.trim();
    if (!name || draft.boards.length >= 20) return;
    const board = { id: crypto.randomUUID(), name, items: [] };
    setDraft({ ...draft, boards: [...draft.boards, board] });
    setSelectedBoardId(board.id);
    setBoardName("");
    setBoardModal(false);
  };

  const addItem = () => {
    if (!canWrite) return;
    if (!selectedBoard || !itemForm.label.trim()) return;
    const item: WorkspaceCreativeItem = {
      id: crypto.randomUUID(),
      kind: itemForm.kind,
      label: itemForm.label.trim(),
      category: itemForm.category.trim() || "Detalii",
      note: itemForm.note.trim() || null,
      sourceUrl: itemForm.sourceUrl.trim() || null,
      mediaId: itemForm.mediaId || null,
      fileName: itemForm.fileName || null,
      colorHex: itemForm.kind === "color" ? itemForm.colorHex : null,
      position: selectedBoard.items.length,
    };
    setDraft({
      ...draft,
      boards: draft.boards.map((board) =>
        board.id === selectedBoard.id
          ? { ...board, items: [...board.items, item] }
          : board,
      ),
    });
    setItemForm({
      kind: "image",
      label: "",
      category: "Detalii",
      note: "",
      sourceUrl: "",
      mediaId: "",
      fileName: "",
      colorHex: "#91A899",
    });
    setItemModal(false);
  };

  const removeItem = (itemId: string) => {
    if (!canWrite || !selectedBoard) return;
    setDraft({
      ...draft,
      boards: draft.boards.map((board) =>
        board.id === selectedBoard.id
          ? {
              ...board,
              items: board.items.filter((item) => item.id !== itemId),
            }
          : board,
      ),
    });
  };

  const downloadBoard = () => {
    if (!selectedBoard) return;
    const blob = new Blob([JSON.stringify(selectedBoard, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedBoard.name.toLocaleLowerCase("ro-RO").replace(/[^a-z0-9]+/gi, "-") || "moodboard"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Moodboarduri"
        description="Colecții persistente de imagini, culori, idei, linkuri și furnizori pentru eveniment."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={state.version > 0 ? "success" : "neutral"}>
              {state.version > 0
                ? `salvat · v${state.version}`
                : "neconfigurat"}
            </Badge>
            {!canWrite ? <Badge variant="neutral">doar citire</Badge> : null}
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={!canWrite}
              onClick={() => setBoardModal(true)}
            >
              <Plus className="size-4" aria-hidden />
              Moodboard nou
            </Button>
            <Button
              variant="outline"
              disabled={!selectedBoard}
              onClick={downloadBoard}
            >
              <Download className="size-4" aria-hidden />
              Descarcă
            </Button>
            <Button
              disabled={!canWrite || saving}
              onClick={() => void save()}
            >
              <Save className="size-4" aria-hidden />
              {saving ? "Se salvează…" : "Salvează"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
              Colecțiile mele
            </p>
            {draft.boards.length ? (
              draft.boards.map((board) => (
                <button
                  key={board.id}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm",
                    board.id === selectedBoardId
                      ? "bg-brand-soft font-semibold text-brand"
                      : "text-muted hover:bg-subtle hover:text-ink",
                  )}
                  onClick={() => setSelectedBoardId(board.id)}
                >
                  <span className="truncate">{board.name}</span>
                  <Badge variant="neutral">{board.items.length}</Badge>
                </button>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
                Creează primul moodboard pentru a adăuga repere.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-5">
            {selectedBoard ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-ink">
                      {selectedBoard.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {selectedBoard.items.length} repere în colecție
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setItemModal(true)}
                    disabled={!canWrite || selectedBoard.items.length >= 200}
                  >
                    <Plus className="size-4" aria-hidden />
                    Adaugă reper
                  </Button>
                </div>
                {selectedBoard.items.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedBoard.items.map((item) => {
                      const imageUrl = item.mediaId
                        ? (mediaPreviews[item.mediaId] ??
                          `/api/v1/workspaces/${workspaceId}/invitation-media/${item.mediaId}`)
                        : item.sourceUrl;
                      return (
                        <article
                          key={item.id}
                          className="overflow-hidden rounded-xl border border-line bg-surface"
                        >
                          {item.kind === "image" && imageUrl ? (
                            <div className="relative aspect-[4/3] w-full">
                              <Image
                                src={imageUrl}
                                alt={item.label}
                                fill
                                unoptimized
                                sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                                className="object-cover"
                              />
                            </div>
                          ) : item.kind === "color" && item.colorHex ? (
                            <div
                              className="aspect-[4/3] w-full"
                              style={{ backgroundColor: item.colorHex }}
                              aria-label={item.colorHex}
                            />
                          ) : (
                            <div className="flex aspect-[4/3] items-center justify-center bg-subtle p-5 text-center text-sm text-muted">
                              {item.note || item.sourceUrl || item.kind}
                            </div>
                          )}
                          <div className="space-y-2 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-ink">
                                  {item.label}
                                </p>
                                <p className="mt-0.5 text-xs text-muted">
                                  {item.category}
                                </p>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Șterge ${item.label}`}
                                disabled={!canWrite}
                                onClick={() => removeItem(item.id)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                            {item.sourceUrl ? (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
                              >
                                <Link2 className="size-4" aria-hidden />
                                Deschide sursa
                              </a>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-line p-10 text-center">
                    <Images className="mx-auto size-9 text-faint" aria-hidden />
                    <p className="mt-3 font-semibold text-ink">
                      Moodboardul este gol
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Adaugă o imagine, culoare, idee, legătură sau furnizor.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-sm text-muted">
                Selectează sau creează un moodboard.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={boardModal}
        onClose={() => setBoardModal(false)}
        title="Moodboard nou"
        description="Numele poate fi schimbat ulterior printr-o versiune nouă."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBoardModal(false)}>
              Renunță
            </Button>
            <Button
              disabled={!canWrite || !boardName.trim()}
              onClick={createBoard}
            >
              Creează moodboardul
            </Button>
          </>
        }
      >
        <Field label="Nume" htmlFor="new-board-name">
          <Input
            id="new-board-name"
            maxLength={120}
            value={boardName}
            placeholder="Ex. Ceremonie și alei"
            onChange={(event) => setBoardName(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={itemModal}
        onClose={() => !uploading && setItemModal(false)}
        title="Adaugă un reper"
        description="Salvează numai materiale pe care ai dreptul să le folosești."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={uploading}
              onClick={() => setItemModal(false)}
            >
              Renunță
            </Button>
            <Button
              disabled={!canWrite || uploading || !itemForm.label.trim()}
              onClick={addItem}
            >
              Adaugă în moodboard
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Tip" htmlFor="moodboard-item-kind">
            <Select
              id="moodboard-item-kind"
              value={itemForm.kind}
              onChange={(event) =>
                setItemForm({
                  ...itemForm,
                  kind: event.target.value as WorkspaceCreativeItem["kind"],
                })
              }
            >
              <option value="image">Imagine</option>
              <option value="text">Notiță</option>
              <option value="color">Culoare</option>
              <option value="link">Link</option>
              <option value="vendor">Furnizor</option>
            </Select>
          </Field>
          <Field label="Titlu" htmlFor="moodboard-item-label">
            <Input
              id="moodboard-item-label"
              maxLength={240}
              value={itemForm.label}
              onChange={(event) =>
                setItemForm({ ...itemForm, label: event.target.value })
              }
            />
          </Field>
          <Field label="Categorie" htmlFor="moodboard-item-category">
            <Input
              id="moodboard-item-category"
              maxLength={80}
              value={itemForm.category}
              onChange={(event) =>
                setItemForm({ ...itemForm, category: event.target.value })
              }
            />
          </Field>
          {itemForm.kind === "image" ? (
            <div className="rounded-xl border border-dashed border-line p-4">
              <Button
                type="button"
                variant="outline"
                disabled={!canWrite || uploading}
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden />
                {uploading
                  ? "Se încarcă…"
                  : itemForm.fileName || "Încarcă imagine"}
              </Button>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
            </div>
          ) : null}
          {itemForm.kind === "color" ? (
            <Field label="Culoare" htmlFor="moodboard-item-color">
              <Input
                id="moodboard-item-color"
                type="color"
                value={itemForm.colorHex}
                onChange={(event) =>
                  setItemForm({ ...itemForm, colorHex: event.target.value })
                }
              />
            </Field>
          ) : null}
          <Field label="Link sursă (opțional)" htmlFor="moodboard-item-source">
            <Input
              id="moodboard-item-source"
              type="url"
              placeholder="https://…"
              value={itemForm.sourceUrl}
              onChange={(event) =>
                setItemForm({ ...itemForm, sourceUrl: event.target.value })
              }
            />
          </Field>
          <Field label="Notiță" htmlFor="moodboard-item-note">
            <Textarea
              id="moodboard-item-note"
              rows={3}
              maxLength={1000}
              value={itemForm.note}
              onChange={(event) =>
                setItemForm({ ...itemForm, note: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

const categories = [
  "Toate",
  "Locație",
  "Ceremonie",
  "Mese",
  "Flori",
  "Iluminat",
  "Invitații",
  "Modă",
  "Tort",
  "Detalii",
];

const initialItems: BoardItem[] = [
  {
    id: "i-1",
    kind: "image",
    label: "Arc din crengi + bujori",
    category: "Ceremonie",
    hue: "from-sage to-brand",
    source: "Pinterest",
    budget: "2.400 lei",
  },
  {
    id: "i-2",
    kind: "image",
    label: "Ghirlande în copaci",
    category: "Iluminat",
    hue: "from-accent to-sand",
    source: "Instagram",
    budget: "2.100 lei",
  },
  {
    id: "i-3",
    kind: "color",
    label: "Sofran de salvie",
    category: "Detalii",
    hue: "#91A899",
  },
  {
    id: "i-4",
    kind: "text",
    label: "„Mese lungi de lemn, căi de in, farfurii de ceramică mată”",
    category: "Mese",
    note: "idee centrală pentru styling",
  },
  {
    id: "i-5",
    kind: "image",
    label: "Buchet șampanie deconstruit",
    category: "Flori",
    hue: "from-sand to-sage-soft",
    source: "Pinterest",
    budget: "650 lei",
  },
  {
    id: "i-6",
    kind: "link",
    label: "Referință: nunta de la Villa B.",
    category: "Locație",
    source: "vogue.ro",
  },
  {
    id: "i-7",
    kind: "color",
    label: "Cupru mat",
    category: "Detalii",
    hue: "#B4774B",
  },
  {
    id: "i-8",
    kind: "image",
    label: "Meniu tipărit pe carton reciclat",
    category: "Invitații",
    hue: "from-sage-soft to-surface",
    budget: "9 lei/buc",
  },
  {
    id: "i-9",
    kind: "vendor",
    label: "Atelier Floral Iris — stil compatibil",
    category: "Flori",
    source: "Marketplace",
  },
  {
    id: "i-10",
    kind: "image",
    label: "Rochie cu spatele deschis, dantelă fină",
    category: "Modă",
    hue: "from-surface to-sand",
  },
  {
    id: "i-11",
    kind: "image",
    label: "Tort semi-naked cu flori naturale",
    category: "Tort",
    hue: "from-sand to-accent-soft",
    budget: "1.900 lei",
  },
  {
    id: "i-12",
    kind: "text",
    label: "Lumânări flotante pe alei după apus",
    category: "Iluminat",
  },
];

export default function MoodboardsPage() {
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [boardOpen, setBoardOpen] = React.useState(true);
  const [items, setItems] = React.useState(initialItems);
  const [history, setHistory] = React.useState<BoardItem[][]>([]);
  const [future, setFuture] = React.useState<BoardItem[][]>([]);
  const [category, setCategory] = React.useState("Toate");
  const [selected, setSelected] = React.useState<BoardItem | null>(null);

  if (!demoMode) {
    return currentWorkspace ? (
      <ConnectedMoodboards
        workspaceId={currentWorkspace.id}
        canWrite={
          bootstrap?.membership.capabilities.includes("invitation.write") ??
          false
        }
      />
    ) : null;
  }

  const commit = (next: BoardItem[]) => {
    setHistory((h) => [...h.slice(-19), items]);
    setFuture([]);
    setItems(next);
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [items, ...f]);
    setItems(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, items]);
    setItems(future[0]);
    setFuture((f) => f.slice(1));
  };

  const addItem = (kind: BoardItem["kind"]) => {
    const labels: Record<BoardItem["kind"], string> = {
      image: "Imagine nouă",
      text: "Notiță nouă",
      color: "Culoare nouă",
      link: "Link nou",
      vendor: "Furnizor legat",
    };
    commit([
      ...items,
      {
        id: `i-${Date.now()}`,
        kind,
        label: labels[kind],
        category: "Detalii",
        hue: kind === "color" ? "#D9B98A" : "from-sage-soft to-sand",
      },
    ]);
  };

  const visible = items.filter(
    (i) => category === "Toate" || i.category === category,
  );

  if (!boardOpen) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          title="Moodboarduri"
          description="Colecțiile vizuale ale evenimentului."
          actions={
            <Button size="sm" onClick={() => setBoardOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Moodboard nou
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {["Grădină de seară", "Ceremonie — arc & alei", "Mese & lumini"].map(
            (name, i) => (
              <Card key={name} interactive onClick={() => setBoardOpen(true)}>
                <div className="grid h-32 grid-cols-3 gap-0.5 overflow-hidden rounded-t-xl">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <span
                      key={j}
                      style={{
                        backgroundColor: [
                          "#91A899",
                          "#E9E1D5",
                          "#B4774B",
                          "#21483A",
                          "#D9B98A",
                          "#F7F4EE",
                        ][(i + j) % 6],
                      }}
                      aria-hidden
                    />
                  ))}
                </div>
                <CardContent className="p-4">
                  <p className="font-medium text-ink">{name}</p>
                  <p className="text-xs text-faint">{18 + i * 4} elemente</p>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <button
              onClick={() => setBoardOpen(false)}
              aria-label="Înapoi la moodboarduri"
              className="cursor-pointer text-faint hover:text-ink"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            Grădină de seară
          </span>
        }
        description="Moodboardul principal · 12 elemente · partajat cu Elena"
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!history.length}
              aria-label="Anulează"
            >
              <Undo2 className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!future.length}
              aria-label="Refă"
            >
              <Redo2 className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Link de partajare copiat",
                  description: "Vizualizare fără cont, expiră în 30 de zile.",
                  variant: "success",
                })
              }
            >
              <Share2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Partajează</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast({ title: "Moodboard exportat (PDF)", variant: "success" })
              }
            >
              <Download className="size-3.5" aria-hidden />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                addItem("image");
                toast({
                  title: "Imagine generată de AI",
                  description:
                    "„Arc ceremonial în stil grădină englezească, tonuri șampanie” — adăugată pe canvas.",
                  variant: "success",
                });
              }}
            >
              <Sparkles className="size-3.5 text-accent" aria-hidden />
              Generează
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => addItem("image")}>
          <Images className="size-3.5" aria-hidden />
          Imagine
        </Button>
        <Button variant="outline" size="sm" onClick={() => addItem("text")}>
          <Type className="size-3.5" aria-hidden />
          Text
        </Button>
        <Button variant="outline" size="sm" onClick={() => addItem("color")}>
          <Palette className="size-3.5" aria-hidden />
          Culoare
        </Button>
        <Button variant="outline" size="sm" onClick={() => addItem("link")}>
          <Link2 className="size-3.5" aria-hidden />
          Link
        </Button>
        <Button variant="outline" size="sm" onClick={() => addItem("vendor")}>
          <Store className="size-3.5" aria-hidden />
          Furnizor
        </Button>
        <span className="mx-2 h-5 w-px bg-line" aria-hidden />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                category === c
                  ? "border-brand bg-brand-soft text-brand-strong dark:text-brand"
                  : "border-line bg-surface text-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
        {/* Canvas */}
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={cn(
                "block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-xl border text-left transition-all",
                selected?.id === item.id
                  ? "border-brand shadow-pop"
                  : "border-line hover:border-line-strong",
              )}
            >
              {item.kind === "color" ? (
                <span
                  className="block h-28"
                  style={{ backgroundColor: item.hue }}
                  aria-hidden
                />
              ) : item.kind === "image" ? (
                <span
                  className={cn("block h-32 bg-gradient-to-br", item.hue)}
                  aria-hidden
                />
              ) : item.kind === "text" ? (
                <span className="block bg-accent-soft/50 p-4 font-display text-[15px] italic leading-snug text-ink dark:bg-accent-soft/20">
                  {item.label}
                </span>
              ) : (
                <span className="flex h-20 items-center justify-center bg-subtle/70 px-3 text-center text-xs text-muted">
                  {item.kind === "vendor" ? (
                    <Store className="mr-1.5 inline size-4" aria-hidden />
                  ) : (
                    <Link2 className="mr-1.5 inline size-4" aria-hidden />
                  )}
                  {item.source}
                </span>
              )}
              {item.kind !== "text" && (
                <span className="block bg-surface px-3 py-2.5">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-faint">
                    {item.category}
                    {item.budget ? ` · ${item.budget}` : ""}
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right panel */}
        <Card className="h-fit">
          <CardContent className="p-4">
            {selected ? (
              <>
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-ink">
                    {selected.label}
                  </p>
                  <button
                    onClick={() => {
                      commit(items.filter((i) => i.id !== selected.id));
                      setSelected(null);
                      toast({
                        title: "Element șters",
                        action: { label: "Anulează", onClick: undo },
                      });
                    }}
                    aria-label="Șterge elementul"
                    className="cursor-pointer text-faint hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  <Field label="Categorie">
                    <Select
                      value={selected.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        setItems((prev) =>
                          prev.map((i) =>
                            i.id === selected.id ? { ...i, category: cat } : i,
                          ),
                        );
                        setSelected({ ...selected, category: cat });
                      }}
                    >
                      {categories.slice(1).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Notiță">
                    <Input
                      defaultValue={selected.note ?? ""}
                      placeholder="de ce îți place…"
                    />
                  </Field>
                  <Field label="Sursă">
                    <Input
                      defaultValue={selected.source ?? ""}
                      placeholder="Pinterest, Instagram…"
                    />
                  </Field>
                  <Field label="Buget estimat">
                    <Input
                      defaultValue={selected.budget ?? ""}
                      placeholder="ex. 1.200 lei"
                    />
                  </Field>
                  <Field label="Furnizor legat">
                    <Select defaultValue="">
                      <option value="">Niciunul</option>
                      <option>Atelier Floral Iris</option>
                      <option>Lumina Events</option>
                    </Select>
                  </Field>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      toast({
                        title: "Proprietăți salvate",
                        variant: "success",
                      })
                    }
                  >
                    Salvează
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Images className="size-8 text-faint" aria-hidden />
                <p className="mt-3 text-sm font-medium text-ink">
                  Selectează un element
                </p>
                <p className="mt-1 text-xs text-muted">
                  Vezi notițe, sursa, bugetul și furnizorul legat.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
