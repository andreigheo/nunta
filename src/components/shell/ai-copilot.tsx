"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  MessageCircle,
  Minimize2,
  Plus,
  Send,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Switch,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type CopilotMemoryResource,
  type CopilotMessageResource,
  type CopilotProposalResource,
  type CopilotRunResource,
  type CopilotSettingsResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

const pageContexts: Record<string, { label: string; suggestions: string[] }> = {
  "/overview": {
    label: "Prezentare generală",
    suggestions: [
      "Ce ar trebui să fac în continuare?",
      "Care sunt întârzierile reale?",
      "Rezumă starea planificării",
    ],
  },
  "/plan": {
    label: "Plan",
    suggestions: [
      "Ce taskuri sunt blocate?",
      "Creează un task pentru următoarea prioritate",
      "Ce lipsește din faza curentă?",
    ],
  },
  "/risks": {
    label: "Riscuri",
    suggestions: [
      "Care este riscul cu cel mai mare impact?",
      "Creează un risc pentru o posibilă întârziere",
      "Ce Plan B ar trebui verificat?",
    ],
  },
  "/calendar": {
    label: "Calendar",
    suggestions: [
      "Ce deadline-uri sunt apropiate?",
      "Există conflicte în calendar?",
      "Care este următorul milestone?",
    ],
  },
  "/budget": {
    label: "Buget",
    suggestions: [
      "Rezumă bugetul și diferențele față de estimări",
      "Ce plăți se apropie de termen?",
      "Pregătește un element nou de buget",
    ],
  },
  "/guests": {
    label: "Invitați",
    suggestions: [
      "Rezumă invitații fără date personale",
      "Ce gospodării au informații incomplete?",
      "Pregătește o gospodărie nouă",
    ],
  },
  "/invitations": {
    label: "Invitații",
    suggestions: [
      "Ce trebuie completat înainte de publicare?",
      "Sincronizează datele schimbate în invitație",
      "Pregătește o campanie în draft",
    ],
  },
  "/seating": {
    label: "Mese și așezare",
    suggestions: [
      "Verifică locurile și capacitatea meselor",
      "Ce invitați nu au încă masă?",
      "Pregătește o masă nouă",
    ],
  },
  "/transport": {
    label: "Transport",
    suggestions: [
      "Rezumă planurile și problemele de transport",
      "Pregătește un plan de transport",
      "Adaugă o oprire pentru verificare",
    ],
  },
  "/accommodation": {
    label: "Cazare",
    suggestions: [
      "Rezumă cazările și cererile neacoperite",
      "Pregătește o proprietate de cazare",
      "Ce informații lipsesc pentru oaspeți?",
    ],
  },
  "/vendors": {
    label: "Furnizori",
    suggestions: [
      "Rezumă cererile și ofertele active",
      "Pregătește o cerere către furnizori",
      "Ce contracte sau termene cer atenție?",
    ],
  },
  "/wedding-day": {
    label: "Ziua evenimentului",
    suggestions: [
      "Rezumă starea operațională de azi",
      "Pregătește raportarea unui incident",
      "Pregătește un anunț în draft",
    ],
  },
};

const defaultContext = {
  label: "Spațiu Sarbato",
  suggestions: [
    "Ce ar trebui să fac în continuare?",
    "Care sunt taskurile urgente?",
    "Identifică riscurile active",
  ],
};

const subscribeToHydration = () => () => undefined;

export function AICopilot() {
  const { aiOpen, closeAI, aiFullscreen, setAiFullscreen } = useShell();
  const { currentWorkspace, demoMode } = useWorkspace();
  const pathname = usePathname();
  const { toast } = useToast();
  const context =
    pageContexts[pathname] ??
    Object.entries(pageContexts)
      .sort(([left], [right]) => right.length - left.length)
      .find(([route]) => pathname.startsWith(`${route}/`))?.[1] ??
    defaultContext;
  const mounted = React.useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [conversationId, setConversationId] = React.useState<string | null>(
    null,
  );
  const [messages, setMessages] = React.useState<CopilotMessageResource[]>([]);
  const [run, setRun] = React.useState<CopilotRunResource | null>(null);
  const [proposals, setProposals] = React.useState<CopilotProposalResource[]>(
    [],
  );
  const [research, setResearch] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [view, setView] = React.useState<"conversation" | "memory">(
    "conversation",
  );
  const [copilotSettings, setCopilotSettings] =
    React.useState<CopilotSettingsResource | null>(null);
  const [memories, setMemories] = React.useState<CopilotMemoryResource[]>([]);
  const [memoryLoading, setMemoryLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const loadConversation = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setLoading(true);
    try {
      const list = await weddingOsApi.copilotConversations(
        currentWorkspace.id,
        pathname,
      );
      const selected =
        list.items[0] ??
        (await weddingOsApi.createCopilotConversation(currentWorkspace.id, {
          surface: pathname,
        }));
      const detail = await weddingOsApi.copilotConversation(
        currentWorkspace.id,
        selected.id,
      );
      setConversationId(selected.id);
      setMessages(detail.messages ?? []);
      setProposals(
        detail.proposals?.filter((item) =>
          ["ready_for_review", "approved"].includes(item.status ?? ""),
        ) ?? [],
      );
    } catch (error) {
      toast({
        title: "Copilot nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode, pathname, toast]);

  React.useEffect(() => {
    if (!aiOpen || conversationId) return;
    const timeout = window.setTimeout(() => void loadConversation(), 0);
    return () => window.clearTimeout(timeout);
  }, [aiOpen, conversationId, loadConversation]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const loadMemoryCenter = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setMemoryLoading(true);
    try {
      const [settings, memoryList] = await Promise.all([
        weddingOsApi.copilotSettings(currentWorkspace.id),
        weddingOsApi.copilotMemories(currentWorkspace.id),
      ]);
      setCopilotSettings(settings);
      setMemories(memoryList.items);
    } catch (error) {
      toast({
        title: "Memoria Copilot nu a putut fi încărcată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setMemoryLoading(false);
    }
  }, [currentWorkspace, demoMode, toast]);

  React.useEffect(() => {
    if (!aiOpen || copilotSettings || demoMode) return;
    const timeout = window.setTimeout(() => void loadMemoryCenter(), 0);
    return () => window.clearTimeout(timeout);
  }, [
    aiOpen,
    copilotSettings,
    demoMode,
    loadMemoryCenter,
  ]);

  const updateMemorySetting = async (
    key: "memoryEnabled" | "webResearchEnabled" | "proactiveSuggestions",
    value: boolean,
  ) => {
    if (!currentWorkspace || !copilotSettings) return;
    setMemoryLoading(true);
    try {
      setCopilotSettings(
        await weddingOsApi.updateCopilotSettings(currentWorkspace.id, {
          [key]: value,
          version: copilotSettings.version,
        }),
      );
    } catch (error) {
      toast({
        title: "Setarea nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setMemoryLoading(false);
    }
  };

  const deleteMemory = async (memory: CopilotMemoryResource) => {
    if (!currentWorkspace) return;
    setMemoryLoading(true);
    try {
      await weddingOsApi.deleteCopilotMemory(
        currentWorkspace.id,
        memory.id,
        memory.version,
      );
      setMemories((current) =>
        current.filter((item) => item.id !== memory.id),
      );
      toast({ title: "Memoria a fost ștearsă", variant: "success" });
    } catch (error) {
      toast({
        title: "Memoria nu a fost ștearsă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setMemoryLoading(false);
    }
  };

  const createMemory = async (input: {
    scope: "WORKSPACE" | "USER";
    title: string;
    content: string;
  }) => {
    if (!currentWorkspace) return;
    setMemoryLoading(true);
    try {
      const memory = await weddingOsApi.createCopilotMemory(
        currentWorkspace.id,
        { ...input, kind: "PREFERENCE", sensitivity: "NORMAL" },
      );
      setMemories((current) => [memory, ...current]);
      toast({ title: "Preferința a fost memorată", variant: "success" });
      return true;
    } catch (error) {
      toast({
        title: "Preferința nu a fost memorată",
        description: apiErrorMessage(error),
        variant: "error",
      });
      return false;
    } finally {
      setMemoryLoading(false);
    }
  };

  const waitForRun = React.useCallback(
    async (runId: string) => {
      if (!currentWorkspace) return;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const next = await weddingOsApi.copilotRun(currentWorkspace.id, runId);
        setRun(next);
        if (next.status === "completed") {
          if (next.proposals?.length)
            setProposals(
              await Promise.all(
                next.proposals.map((item) =>
                  weddingOsApi.copilotProposal(
                    currentWorkspace.id,
                    item.id,
                  ),
                ),
              ),
            );
          else if (next.proposal)
            setProposals([
              await weddingOsApi.copilotProposal(
                currentWorkspace.id,
                next.proposal.id,
              ),
            ]);
          const detail = await weddingOsApi.copilotConversation(
            currentWorkspace.id,
            next.conversationId,
          );
          setMessages(detail.messages ?? []);
          return;
        }
        if (["failed", "cancelled"].includes(next.status))
          throw new Error(next.errorCode ?? "Rularea Copilot a eșuat.");
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      throw new Error("Răspunsul durează mai mult decât era estimat.");
    },
    [currentWorkspace],
  );

  const send = React.useCallback(
    async (text = input) => {
      const content = text.trim();
      if (!content || !currentWorkspace || !conversationId || loading) return;
      setInput("");
      setLoading(true);
      try {
        const result = await weddingOsApi.sendCopilotMessage(
          currentWorkspace.id,
          conversationId,
          { content, mode: "auto", research },
        );
        setMessages((current) => [...current, result.message]);
        setRun(result.run);
        await waitForRun(result.run.id);
      } catch (error) {
        setInput(content);
        toast({
          title: "Cererea nu a fost finalizată",
          description: apiErrorMessage(error),
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      currentWorkspace,
      input,
      loading,
      research,
      toast,
      waitForRun,
    ],
  );

  const review = async (
    selected: CopilotProposalResource,
    decision: "APPROVE" | "REJECT",
  ) => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const next = await weddingOsApi.reviewCopilotProposal(
        currentWorkspace.id,
        selected.id,
        selected.version,
        decision,
      );
      setProposals((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      toast({
        title:
          decision === "APPROVE" ? "Propunere aprobată" : "Propunere respinsă",
        description:
          decision === "APPROVE"
            ? "Aprobarea nu a executat încă modificarea. Verifică și apasă Execută."
            : "Nicio resursă nu a fost modificată.",
        variant: decision === "APPROVE" ? "success" : "info",
      });
    } catch (error) {
      toast({
        title: "Revizuirea a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProposal = async (selected: CopilotProposalResource, input: {
    title: string;
    summary: string;
    actions: Array<{
      actionType: string;
      payload: Record<string, unknown>;
      riskLevel: string;
      position: number;
    }>;
  }) => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const next = await weddingOsApi.updateCopilotProposal(
          currentWorkspace.id,
          selected.id,
          selected.version,
          input,
        );
      setProposals((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      toast({
        title: "Propunerea a fost actualizată",
        description: "Versiunea nouă trebuie revizuită înainte de execuție.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Propunerea nu a fost actualizată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const execute = async (selected: CopilotProposalResource) => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const result = await weddingOsApi.executeCopilotProposal(
        currentWorkspace.id,
        selected.id,
        selected.version,
        ["high", "critical"].includes(selected.riskLevel),
      );
      setProposals((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, status: "executed" } : item,
        ),
      );
      toast({
        title: "Propunerea a fost executată",
        description: `${result.resources.length} resurse canonice au fost create sau actualizate.`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Execuția a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || !aiOpen) return null;

  const panel = (
    <aside
      aria-label="Copilot Sarbato"
      className={cn(
        "fixed z-[80] flex flex-col border-line bg-elevated shadow-2xl",
        aiFullscreen
          ? "inset-3 rounded-2xl border"
          : "inset-y-0 right-0 w-full border-l sm:w-[440px]",
      )}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Sparkles className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Copilot</p>
          <p className="truncate text-xs text-muted">
            {view === "conversation"
              ? `Context: ${context.label}`
              : "Memorie și surse"}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant={view === "memory" ? "secondary" : "ghost"}
          aria-label={
            view === "memory"
              ? "Înapoi la conversație"
              : "Gestionează memoria Copilot"
          }
          onClick={() =>
            setView((current) =>
              current === "memory" ? "conversation" : "memory",
            )
          }
        >
          {view === "memory" ? (
            <MessageCircle className="size-4" />
          ) : (
            <Brain className="size-4" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={aiFullscreen ? "Micșorează Copilot" : "Mărește Copilot"}
          onClick={() => setAiFullscreen(!aiFullscreen)}
        >
          {aiFullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Închide Copilot"
          onClick={closeAI}
        >
          <X className="size-4" />
        </Button>
      </header>

      {demoMode ? (
        <div className="m-4 rounded-xl border border-info/30 bg-info-soft p-4 text-sm text-info">
          În modul demo, Copilot folosește numai starea demo și nu trimite
          cereri către API-ul real.
        </div>
      ) : null}

      {view === "memory" ? (
        <MemoryCenter
          demoMode={demoMode}
          loading={memoryLoading}
          settings={copilotSettings}
          memories={memories}
          canConfigure={
            currentWorkspace?.capabilities.includes("workspace.update") ?? false
          }
          onSettingChange={updateMemorySetting}
          onCreate={createMemory}
          onDelete={deleteMemory}
        />
      ) : (
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && !loading ? (
          <div className="rounded-xl border border-line bg-subtle/60 p-4">
            <p className="text-sm font-medium text-ink">
              Întreabă pe baza datelor reale
            </p>
            <p className="mt-1 text-sm text-muted">
              Copilot citește numai resursele pentru care ai acces și pregătește
              propuneri înainte de orice modificare.
            </p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            workspaceId={currentWorkspace?.id}
          />
        ))}
        {loading ? (
          <div
            className="flex items-center gap-2 text-sm text-muted"
            role="status"
          >
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            {run?.status === "running"
              ? "Analizez contextul autorizat…"
              : "Pregătesc cererea…"}
          </div>
        ) : null}
        {run?.status === "completed" && run.fallbackUsed ? (
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            Providerul configurat nu a fost disponibil. Răspunsul a fost generat
            prin fallback determinist; nu este prezentat ca răspuns AI extern.
          </div>
        ) : null}

        {run?.sources?.length ? (
          <div className="rounded-xl border border-line">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-muted"
              onClick={() => setSourcesOpen((value) => !value)}
            >
              {run.sources.length} surse utilizate
              {sourcesOpen ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
            {sourcesOpen ? (
              <ul className="space-y-2 border-t border-line p-3">
                {run.sources.map((source) => (
                  <li key={source.id} className="text-xs text-muted">
                    <span className="font-semibold text-ink">
                      {source.resourceType}
                    </span>
                    {source.excerpt ? ` — ${source.excerpt}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {run?.webResearch?.citations.length ? (
          <section
            aria-labelledby="copilot-web-sources"
            className="rounded-xl border border-line bg-subtle/40 p-3"
          >
            <h3
              id="copilot-web-sources"
              className="flex items-center gap-2 text-xs font-semibold text-ink"
            >
              <Search className="size-4 text-accent" aria-hidden />
              Surse de pe internet
            </h3>
            <ul className="mt-2 space-y-2">
              {run.webResearch.citations.map((citation) => (
                <li key={citation.url} className="text-xs text-muted">
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    {citation.title}
                    <span className="sr-only"> (se deschide într-o filă nouă)</span>
                  </a>
                  {citation.excerpt ? (
                    <p className="mt-0.5 line-clamp-2 leading-relaxed">
                      {citation.excerpt}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {run?.plan ? (
          <div className="rounded-xl border border-accent/25 bg-accent-soft/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Plan în {proposals.length} pași
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {run.plan.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {run.plan.summary} Fiecare pas se verifică, aprobă și execută separat.
            </p>
          </div>
        ) : null}
        {proposals.map((item, index) => (
          <div key={`${item.id}:${item.version}`} className="space-y-1.5">
            {item.planId ? (
              <p className="px-1 text-xs font-semibold text-muted">
                Pasul {(item.stepPosition ?? index) + 1} din {proposals.length}
              </p>
            ) : null}
            <ProposalCard
              proposal={item}
              loading={loading}
              onReview={(decision) => review(item, decision)}
              onExecute={() => execute(item)}
              onUpdate={(input) => updateProposal(item, input)}
            />
          </div>
        ))}
      </div>
      )}

      {view === "conversation" ? (
      <div className="border-t border-line p-3">
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">Caută pe internet</p>
            <p className="truncate text-xs text-muted">
              Răspuns separat, cu surse; nu poate modifica evenimentul.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={research}
            aria-label="Folosește cercetarea web pentru următorul mesaj"
            disabled={
              loading ||
              demoMode ||
              copilotSettings?.webResearchEnabled !== true
            }
            onClick={() => setResearch((current) => !current)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              research
                ? "border-accent bg-accent"
                : "border-line-strong bg-surface",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform",
                research ? "translate-x-5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {context.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={loading || demoMode}
              onClick={() => void send(suggestion)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2 focus-within:border-accent/60"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            disabled={loading || demoMode || !conversationId}
            rows={2}
            maxLength={8000}
            placeholder="Întreabă despre taskuri, calendar sau riscuri…"
            className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <Button
            size="icon-sm"
            type="submit"
            disabled={!input.trim() || loading || demoMode || !conversationId}
            aria-label="Trimite mesajul"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <p className="mt-1.5 text-center text-xs text-faint">
          Verifică propunerile înainte de aprobare. Copilot poate greși.
        </p>
      </div>
      ) : null}
    </aside>
  );

  return createPortal(panel, document.body);
}

function MemoryCenter({
  demoMode,
  loading,
  settings,
  memories,
  canConfigure,
  onSettingChange,
  onCreate,
  onDelete,
}: {
  demoMode: boolean;
  loading: boolean;
  settings: CopilotSettingsResource | null;
  memories: CopilotMemoryResource[];
  canConfigure: boolean;
  onSettingChange: (
    key: "memoryEnabled" | "webResearchEnabled" | "proactiveSuggestions",
    value: boolean,
  ) => Promise<void>;
  onCreate: (input: {
    scope: "WORKSPACE" | "USER";
    title: string;
    content: string;
  }) => Promise<boolean | undefined>;
  onDelete: (memory: CopilotMemoryResource) => Promise<void>;
}) {
  const [pendingDelete, setPendingDelete] =
    React.useState<CopilotMemoryResource | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [memoryTitle, setMemoryTitle] = React.useState("");
  const [memoryContent, setMemoryContent] = React.useState("");
  const [memoryScope, setMemoryScope] = React.useState<"WORKSPACE" | "USER">(
    "USER",
  );

  if (demoMode)
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="rounded-xl bg-info-soft p-4 text-sm text-info">
          Memoria personală este dezactivată în modul demo. Nicio informație din
          demo nu este păstrată în cont.
        </p>
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <section aria-labelledby="copilot-memory-settings">
        <h2 id="copilot-memory-settings" className="text-sm font-semibold text-ink">
          Ce poate reține Copilot
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Memoria păstrează numai preferințe, constrângeri și decizii confirmate.
          Datele operaționale rămân în modulele lor și au întotdeauna prioritate.
        </p>
        <div className="mt-3 divide-y divide-line border-y border-line">
          <Switch
            checked={settings?.memoryEnabled ?? false}
            disabled={!settings || loading || !canConfigure}
            onCheckedChange={(value) =>
              void onSettingChange("memoryEnabled", value)
            }
            label="Memorie între conversații"
            description={
              canConfigure
                ? "Poți vedea și șterge oricând informațiile păstrate. Datele medicale, parolele și informațiile de plată sunt excluse."
                : "Doar un membru cu drept de configurare a workspace-ului poate schimba această setare."
            }
          />
          <Switch
            checked={settings?.webResearchEnabled ?? false}
            disabled={
              !settings ||
              loading ||
              !canConfigure ||
              !settings.webResearchAvailable
            }
            onCheckedChange={(value) =>
              void onSettingChange("webResearchEnabled", value)
            }
            label="Cercetare pe internet"
            description={
              settings?.webResearchAvailable
                ? "Este folosită numai când o activezi pentru un mesaj. Răspunsurile afișează sursele și nu pot autoriza modificări."
                : "Providerul de cercetare nu este configurat în acest mediu. Copilot nu va pretinde că a consultat internetul."
            }
          />
        </div>
      </section>

      <section className="mt-6" aria-labelledby="copilot-saved-memories">
        <div className="flex items-center justify-between gap-3">
          <h2 id="copilot-saved-memories" className="text-sm font-semibold text-ink">
            Informații păstrate
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{memories.length}</Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || settings?.memoryEnabled === false}
              onClick={() => setAdding((current) => !current)}
            >
              <Plus className="size-4" /> Adaugă
            </Button>
          </div>
        </div>
        {adding ? (
          <form
            className="mt-3 space-y-3 border-y border-line py-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const created = await onCreate({
                scope: memoryScope,
                title: memoryTitle.trim(),
                content: memoryContent.trim(),
              });
              if (!created) return;
              setMemoryTitle("");
              setMemoryContent("");
              setAdding(false);
            }}
          >
            <label className="block text-sm font-medium text-ink">
              Titlu scurt
              <input
                value={memoryTitle}
                onChange={(event) => setMemoryTitle(event.target.value)}
                required
                maxLength={180}
                className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Ce vrei să țină minte
              <textarea
                value={memoryContent}
                onChange={(event) => setMemoryContent(event.target.value)}
                required
                maxLength={4000}
                rows={3}
                className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-ink">Cine o poate folosi</legend>
              <div className="mt-1.5 flex gap-2">
                {([
                  ["USER", "Doar eu"],
                  ["WORKSPACE", "Echipa"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={value === "WORKSPACE" && !canConfigure}
                    aria-pressed={memoryScope === value}
                    onClick={() => setMemoryScope(value)}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      memoryScope === value
                        ? "border-brand bg-brand text-on-brand"
                        : "border-line-strong bg-surface text-ink hover:border-brand/50",
                      value === "WORKSPACE" &&
                        !canConfigure &&
                        "cursor-not-allowed opacity-50",
                    )}
                    title={
                      value === "WORKSPACE" && !canConfigure
                        ? "Ai nevoie de dreptul de configurare a workspace-ului"
                        : undefined
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Renunță
              </Button>
              <Button
                type="submit"
                loading={loading}
                disabled={!memoryTitle.trim() || !memoryContent.trim()}
              >
                Memorează
              </Button>
            </div>
          </form>
        ) : null}
        {loading && !settings ? (
          <p className="mt-3 text-sm text-muted" role="status">
            Se încarcă memoria…
          </p>
        ) : memories.length ? (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {memories.map((memory) => (
              <li key={memory.id} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{memory.title}</p>
                    <Badge variant="neutral">
                      {memory.scope === "USER" ? "Doar pentru mine" : "Echipă"}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                    {memory.content}
                  </p>
                  <p className="mt-1.5 text-xs text-faint">
                    {memory.confirmedByUser
                      ? "Confirmată de utilizator"
                      : "Derivată dintr-o sursă canonică"}
                    {memory.lastUsedAt
                      ? ` · folosită de ${memory.useCount} ori`
                      : " · încă nefolosită"}
                  </p>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={
                    loading || (memory.scope === "WORKSPACE" && !canConfigure)
                  }
                  aria-label={`Șterge memoria: ${memory.title}`}
                  onClick={() => setPendingDelete(memory)}
                  title={
                    memory.scope === "WORKSPACE" && !canConfigure
                      ? "Ai nevoie de dreptul de configurare a workspace-ului"
                      : undefined
                  }
                >
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-xl bg-subtle p-4">
            <p className="text-sm font-medium text-ink">
              Copilot nu a păstrat încă nimic
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Când îi ceri explicit să țină minte o preferință, aceasta va apărea
              aici înainte să fie folosită în conversațiile viitoare.
            </p>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        title="Ștergi această memorie?"
        description="Copilot nu o va mai folosi în conversațiile viitoare. Datele canonice din celelalte module nu sunt modificate."
        confirmLabel="Șterge memoria"
        destructive
        loading={loading}
      />
    </div>
  );
}

function MessageBubble({
  message,
  workspaceId,
}: {
  message: CopilotMessageResource;
  workspaceId?: string;
}) {
  const { toast } = useToast();
  const assistant = message.role === "assistant";
  const rate = async (rating: "HELPFUL" | "NOT_HELPFUL") => {
    if (!workspaceId) return;
    try {
      await weddingOsApi.copilotFeedback(workspaceId, message.id, rating);
      toast({ title: "Feedback înregistrat", variant: "success" });
    } catch (error) {
      toast({
        title: "Feedback-ul nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <div className={cn("flex", assistant ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          assistant
            ? "border border-line bg-surface text-ink"
            : "bg-brand text-on-brand",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {assistant && Array.isArray(message.metadata.warnings) ? (
          <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-warning">
            {(message.metadata.warnings as unknown[])
              .filter((warning): warning is string => typeof warning === "string")
              .map((warning) => (
                <li key={warning}>Atenție: {warning}</li>
              ))}
          </ul>
        ) : null}
        {assistant && Array.isArray(message.metadata.assumptions) &&
        message.metadata.assumptions.length ? (
          <p className="mt-2 text-xs text-faint">
            Ipoteze: {(message.metadata.assumptions as string[]).join(" · ")}
          </p>
        ) : null}
        {assistant ? (
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={() => void rate("HELPFUL")}
              className="rounded p-1 text-faint hover:text-success"
              aria-label="Răspuns util"
            >
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void rate("NOT_HELPFUL")}
              className="rounded p-1 text-faint hover:text-danger"
              aria-label="Răspuns neutil"
            >
              <ThumbsDown className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  loading,
  onReview,
  onExecute,
  onUpdate,
}: {
  proposal: CopilotProposalResource;
  loading: boolean;
  onReview: (decision: "APPROVE" | "REJECT") => Promise<void>;
  onExecute: () => Promise<void>;
  onUpdate: (input: {
    title: string;
    summary: string;
    actions: Array<{
      actionType: string;
      payload: Record<string, unknown>;
      riskLevel: string;
      position: number;
    }>;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(proposal.title);
  const [summary, setSummary] = React.useState(proposal.summary);
  const save = async () => {
    await onUpdate({
      title,
      summary,
      actions: (proposal.actions ?? []).map((action, position) => ({
        actionType: action.actionType,
        payload: action.payload,
        riskLevel: action.riskLevel.toUpperCase(),
        position,
      })),
    });
    setEditing(false);
  };
  return (
    <section className="overflow-hidden rounded-xl border border-accent/40 bg-accent-soft/20">
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div>
          {editing ? (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                aria-label="Titlul propunerii"
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm font-semibold text-ink outline-none focus:border-accent"
              />
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={2000}
                aria-label="Rezumatul propunerii"
                className="w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </div>
          ) : (
            <>
              <p className="font-semibold text-ink">{proposal.title}</p>
              <p className="mt-1 text-sm text-muted">{proposal.summary}</p>
            </>
          )}
        </div>
        <Badge variant={proposal.riskLevel === "low" ? "success" : "warning"}>
          Risc {proposal.riskLevel}
        </Badge>
      </div>
      {proposal.actions?.length ? (
        <ul className="space-y-1 border-t border-accent/20 px-3.5 py-3 text-xs text-muted">
          {proposal.actions.map((action) => (
            <li key={action.id} className="space-y-1">
              <span>
                • {copilotActionLabel(action.actionType)}
              </span>
              {action.payload.title ? (
                <span className="block pl-3 text-faint">
                  {String(action.payload.title)}
                </span>
              ) : null}
              <ProposalPayloadPreview payload={action.payload} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-accent/20 p-3">
        {proposal.status === "ready_for_review" ? (
          <>
            {editing ? (
              <>
                <Button
                  size="sm"
                  disabled={loading || !title.trim()}
                  onClick={() => void save()}
                >
                  Salvează versiunea
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Renunță
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => setEditing(true)}
              >
                Editează explicația
              </Button>
            )}
            <Button
              size="sm"
              disabled={loading || editing}
              onClick={() => void onReview("APPROVE")}
            >
              <Check className="size-3.5" /> Aprobă
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading || editing}
              onClick={() => void onReview("REJECT")}
            >
              Respinge
            </Button>
          </>
        ) : null}
        {proposal.status === "approved" ? (
          <Button size="sm" disabled={loading} onClick={() => void onExecute()}>
            Execută modificarea aprobată
          </Button>
        ) : null}
        {proposal.status === "executed" ? (
          <Badge variant="success">Executată</Badge>
        ) : null}
      </div>
    </section>
  );
}

const copilotActionLabels: Record<string, string> = {
  CREATE_TASK: "Creează o sarcină",
  UPDATE_TASK: "Actualizează o sarcină",
  CREATE_CALENDAR_EVENT: "Adaugă un eveniment în calendar",
  UPDATE_CALENDAR_EVENT: "Actualizează un eveniment din calendar",
  CREATE_RISK: "Înregistrează un risc",
  UPDATE_RISK: "Actualizează un risc",
  CREATE_CONTINGENCY_PLAN: "Creează un Plan B",
  UPSERT_BUDGET_PLAN: "Configurează planul de buget",
  CREATE_BUDGET_CATEGORY: "Adaugă o categorie de buget",
  UPDATE_BUDGET_CATEGORY: "Actualizează o categorie de buget",
  CREATE_BUDGET_ITEM: "Adaugă un element de buget",
  UPDATE_BUDGET_ITEM: "Actualizează un element de buget",
  CREATE_EXPENSE: "Înregistrează o cheltuială",
  UPDATE_EXPENSE: "Actualizează o cheltuială",
  CREATE_HOUSEHOLD: "Adaugă o gospodărie",
  UPDATE_HOUSEHOLD: "Actualizează o gospodărie",
  CREATE_GUEST: "Adaugă un invitat",
  UPDATE_GUEST: "Actualizează un invitat",
  CREATE_MENU: "Adaugă un meniu",
  UPDATE_MENU: "Actualizează un meniu",
  CREATE_SEATING_PLAN: "Creează un plan de mese",
  UPDATE_SEATING_PLAN: "Actualizează planul de mese",
  CREATE_SEATING_TABLE: "Adaugă o masă",
  UPDATE_SEATING_TABLE: "Actualizează o masă",
  REPLACE_SEATING_ASSIGNMENTS: "Înlocuiește așezarea invitaților",
  CREATE_VENDOR_SHORTLIST: "Creează o listă scurtă de furnizori",
  ADD_VENDOR_TO_SHORTLIST: "Adaugă furnizorul în lista scurtă",
  FAVORITE_VENDOR: "Marchează furnizorul ca favorit",
  SYNC_INVITATION_DATA: "Sincronizează datele invitației",
};

const copilotPayloadLabels: Record<string, string> = {
  targetId: "Resursă vizată",
  targetVersion: "Versiune verificată",
  title: "Titlu",
  name: "Nume",
  description: "Descriere",
  priority: "Prioritate",
  status: "Stare",
  category: "Categorie",
  startAt: "Începe la",
  endAt: "Se termină la",
  timezone: "Fus orar",
  dueAt: "Termen",
  targetTotalMinor: "Buget total (moneda evenimentului)",
  contingencyPercent: "Rezervă procentuală",
  allocatedMinor: "Alocare (moneda evenimentului)",
  estimatedMinor: "Estimare (moneda evenimentului)",
  quotedMinor: "Ofertă (moneda evenimentului)",
  committedMinor: "Angajat (moneda evenimentului)",
  manualOverrideMinor: "Ajustare manuală (moneda evenimentului)",
  amountMinor: "Sumă (moneda evenimentului)",
  expenseDate: "Data cheltuielii",
  householdId: "Gospodărie",
  planId: "Plan de mese",
  seatingPlanId: "Plan de mese",
  weddingEventId: "Eveniment",
  venueSpaceId: "Spațiu",
  capacity: "Capacitate",
  label: "Etichetă",
  shape: "Formă",
  paths: "Câmpuri sincronizate",
  actions: "Pași",
  triggers: "Declanșatori",
  assignments: "Așezări",
};

function copilotActionLabel(actionType: string) {
  return (
    copilotActionLabels[actionType] ??
    actionType.replaceAll("_", " ").toLocaleLowerCase("ro-RO")
  );
}

function ProposalPayloadPreview({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const entries = Object.entries(payload).filter(
    ([key, value]) => key !== "title" && value !== undefined,
  );
  if (!entries.length) return null;
  return (
    <dl className="mt-2 grid gap-x-3 gap-y-1.5 rounded-lg border border-line/80 bg-surface/70 p-2.5 sm:grid-cols-[minmax(8rem,auto)_1fr]">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="font-medium text-muted">
            {copilotPayloadLabels[key] ?? humanizeCopilotKey(key)}
          </dt>
          <dd className="min-w-0 break-words text-ink">
            {formatCopilotPayloadValue(value, key)}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function humanizeCopilotKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLocaleLowerCase("ro-RO");
}

function formatCopilotPayloadValue(
  value: unknown,
  key?: string,
): React.ReactNode {
  if (value === null) return "Nespecificat";
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (typeof value === "number" && key?.endsWith("Minor"))
    return new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  if (typeof value === "number")
    return new Intl.NumberFormat("ro-RO").format(value);
  if (typeof value === "string") {
    const date = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("ro-RO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return value.join(" · ");
  return (
    <code className="block max-h-32 overflow-auto whitespace-pre-wrap rounded bg-canvas px-2 py-1 font-mono text-[12px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </code>
  );
}
