"use client";

import * as React from "react";
import {
  ArrowLeft,
  Download,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Card, CardContent, Field, Input, PageHeader, Select, useToast } from "@/components/ui";

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

const categories = ["Toate", "Locație", "Ceremonie", "Mese", "Flori", "Iluminat", "Invitații", "Modă", "Tort", "Detalii"];

const initialItems: BoardItem[] = [
  { id: "i-1", kind: "image", label: "Arc din crengi + bujori", category: "Ceremonie", hue: "from-sage to-brand", source: "Pinterest", budget: "2.400 lei" },
  { id: "i-2", kind: "image", label: "Ghirlande în copaci", category: "Iluminat", hue: "from-accent to-sand", source: "Instagram", budget: "2.100 lei" },
  { id: "i-3", kind: "color", label: "Sofran de salvie", category: "Detalii", hue: "#91A899" },
  { id: "i-4", kind: "text", label: "„Mese lungi de lemn, căi de in, farfurii de ceramică mată”", category: "Mese", note: "idee centrală pentru styling" },
  { id: "i-5", kind: "image", label: "Buchet șampanie deconstruit", category: "Flori", hue: "from-sand to-sage-soft", source: "Pinterest", budget: "650 lei" },
  { id: "i-6", kind: "link", label: "Referință: nunta de la Villa B.", category: "Locație", source: "vogue.ro" },
  { id: "i-7", kind: "color", label: "Cupru mat", category: "Detalii", hue: "#B4774B" },
  { id: "i-8", kind: "image", label: "Meniu tipărit pe carton reciclat", category: "Invitații", hue: "from-sage-soft to-surface", budget: "9 lei/buc" },
  { id: "i-9", kind: "vendor", label: "Atelier Floral Iris — stil compatibil", category: "Flori", source: "Marketplace" },
  { id: "i-10", kind: "image", label: "Rochie cu spatele deschis, dantelă fină", category: "Modă", hue: "from-surface to-sand" },
  { id: "i-11", kind: "image", label: "Tort semi-naked cu flori naturale", category: "Tort", hue: "from-sand to-accent-soft", budget: "1.900 lei" },
  { id: "i-12", kind: "text", label: "Lumânări flotante pe alei după apus", category: "Iluminat" },
];

export default function MoodboardsPage() {
  const { toast } = useToast();
  const [boardOpen, setBoardOpen] = React.useState(true);
  const [items, setItems] = React.useState(initialItems);
  const [history, setHistory] = React.useState<BoardItem[][]>([]);
  const [future, setFuture] = React.useState<BoardItem[][]>([]);
  const [category, setCategory] = React.useState("Toate");
  const [selected, setSelected] = React.useState<BoardItem | null>(null);

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
    commit([...items, { id: `i-${Date.now()}`, kind, label: labels[kind], category: "Detalii", hue: kind === "color" ? "#D9B98A" : "from-sage-soft to-sand" }]);
  };

  const visible = items.filter((i) => category === "Toate" || i.category === category);

  if (!boardOpen) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title="Moodboarduri" description="Colecțiile vizuale ale nunții." actions={<Button size="sm" onClick={() => setBoardOpen(true)}><Plus className="size-4" aria-hidden />Moodboard nou</Button>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {["Grădină de seară", "Ceremonie — arc & alei", "Mese & lumini"].map((name, i) => (
            <Card key={name} interactive onClick={() => setBoardOpen(true)}>
              <div className="grid h-32 grid-cols-3 gap-0.5 overflow-hidden rounded-t-xl">
                {Array.from({ length: 6 }).map((_, j) => (
                  <span key={j} style={{ backgroundColor: ["#91A899", "#E9E1D5", "#B4774B", "#21483A", "#D9B98A", "#F7F4EE"][(i + j) % 6] }} aria-hidden />
                ))}
              </div>
              <CardContent className="p-4">
                <p className="font-medium text-ink">{name}</p>
                <p className="text-xs text-faint">{18 + i * 4} elemente</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <button onClick={() => setBoardOpen(false)} aria-label="Înapoi la moodboarduri" className="cursor-pointer text-faint hover:text-ink">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            Grădină de seară
          </span>
        }
        description="Moodboardul principal · 12 elemente · partajat cu Elena"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} aria-label="Anulează"><Undo2 className="size-3.5" aria-hidden /></Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={!future.length} aria-label="Refă"><Redo2 className="size-3.5" aria-hidden /></Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Link de partajare copiat", description: "Vizualizare fără cont, expiră în 30 de zile.", variant: "success" })}>
              <Share2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Partajează</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Moodboard exportat (PDF)", variant: "success" })}>
              <Download className="size-3.5" aria-hidden />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { addItem("image"); toast({ title: "Imagine generată de AI", description: "„Arc ceremonial în stil grădină englezească, tonuri șampanie” — adăugată pe canvas.", variant: "success" }); }}>
              <Sparkles className="size-3.5 text-accent" aria-hidden />
              Generează
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => addItem("image")}><Images className="size-3.5" aria-hidden />Imagine</Button>
        <Button variant="outline" size="sm" onClick={() => addItem("text")}><Type className="size-3.5" aria-hidden />Text</Button>
        <Button variant="outline" size="sm" onClick={() => addItem("color")}><Palette className="size-3.5" aria-hidden />Culoare</Button>
        <Button variant="outline" size="sm" onClick={() => addItem("link")}><Link2 className="size-3.5" aria-hidden />Link</Button>
        <Button variant="outline" size="sm" onClick={() => addItem("vendor")}><Store className="size-3.5" aria-hidden />Furnizor</Button>
        <span className="mx-2 h-5 w-px bg-line" aria-hidden />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                category === c ? "border-brand bg-brand-soft text-brand-strong dark:text-brand" : "border-line bg-surface text-muted",
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
                selected?.id === item.id ? "border-brand shadow-pop" : "border-line hover:border-line-strong",
              )}
            >
              {item.kind === "color" ? (
                <span className="block h-28" style={{ backgroundColor: item.hue }} aria-hidden />
              ) : item.kind === "image" ? (
                <span className={cn("block h-32 bg-gradient-to-br", item.hue)} aria-hidden />
              ) : item.kind === "text" ? (
                <span className="block bg-accent-soft/50 p-4 font-display text-[15px] italic leading-snug text-ink dark:bg-accent-soft/20">{item.label}</span>
              ) : (
                <span className="flex h-20 items-center justify-center bg-subtle/70 px-3 text-center text-xs text-muted">
                  {item.kind === "vendor" ? <Store className="mr-1.5 inline size-4" aria-hidden /> : <Link2 className="mr-1.5 inline size-4" aria-hidden />}
                  {item.source}
                </span>
              )}
              {item.kind !== "text" && (
                <span className="block bg-surface px-3 py-2.5">
                  <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
                  <span className="text-[11px] text-faint">{item.category}{item.budget ? ` · ${item.budget}` : ""}</span>
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
                  <p className="text-sm font-semibold text-ink">{selected.label}</p>
                  <button
                    onClick={() => {
                      commit(items.filter((i) => i.id !== selected.id));
                      setSelected(null);
                      toast({ title: "Element șters", action: { label: "Anulează", onClick: undo } });
                    }}
                    aria-label="Șterge elementul"
                    className="cursor-pointer text-faint hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  <Field label="Categorie">
                    <Select value={selected.category} onChange={(e) => {
                      const cat = e.target.value;
                      setItems((prev) => prev.map((i) => (i.id === selected.id ? { ...i, category: cat } : i)));
                      setSelected({ ...selected, category: cat });
                    }}>
                      {categories.slice(1).map((c) => <option key={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Field label="Notiță">
                    <Input defaultValue={selected.note ?? ""} placeholder="de ce îți place…" />
                  </Field>
                  <Field label="Sursă">
                    <Input defaultValue={selected.source ?? ""} placeholder="Pinterest, Instagram…" />
                  </Field>
                  <Field label="Buget estimat">
                    <Input defaultValue={selected.budget ?? ""} placeholder="ex. 1.200 lei" />
                  </Field>
                  <Field label="Furnizor legat">
                    <Select defaultValue="">
                      <option value="">Niciunul</option>
                      <option>Atelier Floral Iris</option>
                      <option>Lumina Events</option>
                    </Select>
                  </Field>
                  <Button size="sm" className="w-full" onClick={() => toast({ title: "Proprietăți salvate", variant: "success" })}>
                    Salvează
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Images className="size-8 text-faint" aria-hidden />
                <p className="mt-3 text-sm font-medium text-ink">Selectează un element</p>
                <p className="mt-1 text-xs text-muted">Vezi notițe, sursa, bugetul și furnizorul legat.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
