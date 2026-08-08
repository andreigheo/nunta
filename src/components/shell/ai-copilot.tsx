"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { Badge, Button, useToast } from "@/components/ui";
import {
  apiErrorMessage,
  type CopilotMessageResource,
  type CopilotProposalResource,
  type CopilotRunResource,
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
  const context = pageContexts[pathname] ?? defaultContext;
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
  const [proposal, setProposal] =
    React.useState<CopilotProposalResource | null>(null);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const loadConversation = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setLoading(true);
    try {
      const list = await weddingOsApi.copilotConversations(currentWorkspace.id);
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
      setProposal(
        detail.proposals?.find((item) => item.status === "ready_for_review") ??
          null,
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

  const waitForRun = React.useCallback(
    async (runId: string) => {
      if (!currentWorkspace) return;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const next = await weddingOsApi.copilotRun(currentWorkspace.id, runId);
        setRun(next);
        if (next.status === "completed") {
          if (next.proposal) {
            setProposal(
              await weddingOsApi.copilotProposal(
                currentWorkspace.id,
                next.proposal.id,
              ),
            );
          }
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
          { content, mode: "auto" },
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
    [conversationId, currentWorkspace, input, loading, toast, waitForRun],
  );

  const review = async (decision: "APPROVE" | "REJECT") => {
    if (!currentWorkspace || !proposal) return;
    setLoading(true);
    try {
      const next = await weddingOsApi.reviewCopilotProposal(
        currentWorkspace.id,
        proposal.id,
        proposal.version,
        decision,
      );
      setProposal(next);
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

  const updateProposal = async (input: {
    title: string;
    summary: string;
    actions: Array<{
      actionType: string;
      payload: Record<string, unknown>;
      riskLevel: string;
      position: number;
    }>;
  }) => {
    if (!currentWorkspace || !proposal) return;
    setLoading(true);
    try {
      setProposal(
        await weddingOsApi.updateCopilotProposal(
          currentWorkspace.id,
          proposal.id,
          proposal.version,
          input,
        ),
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

  const execute = async () => {
    if (!currentWorkspace || !proposal) return;
    setLoading(true);
    try {
      const result = await weddingOsApi.executeCopilotProposal(
        currentWorkspace.id,
        proposal.id,
        proposal.version,
        ["high", "critical"].includes(proposal.riskLevel),
      );
      setProposal((current) =>
        current ? { ...current, status: "executed" } : current,
      );
      toast({
        title: "Propunerea a fost executată",
        description: `${result.resources.length} resurse canonice au fost create.`,
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
            Context: {context.label}
          </p>
        </div>
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

        {proposal ? (
          <ProposalCard
            key={`${proposal.id}:${proposal.version}`}
            proposal={proposal}
            loading={loading}
            onReview={review}
            onExecute={execute}
            onUpdate={updateProposal}
          />
        ) : null}
      </div>

      <div className="border-t border-line p-3">
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
        <p className="mt-1.5 text-center text-[11px] text-faint">
          Verifică propunerile înainte de aprobare. Copilot poate greși.
        </p>
      </div>
    </aside>
  );

  return createPortal(panel, document.body);
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
  const [actionTitles, setActionTitles] = React.useState(
    (proposal.actions ?? []).map((action) => String(action.payload.title ?? "")),
  );
  const save = async () => {
    await onUpdate({
      title,
      summary,
      actions: (proposal.actions ?? []).map((action, position) => ({
        actionType: action.actionType,
        payload: {
          ...action.payload,
          ...(actionTitles[position]?.trim()
            ? { title: actionTitles[position].trim() }
            : {}),
        },
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
          {proposal.actions.map((action, index) => (
            <li key={action.id} className="space-y-1">
              <span>
                • {action.actionType.replaceAll("_", " ").toLowerCase()}
              </span>
              {editing ? (
                <input
                  value={actionTitles[index] ?? ""}
                  onChange={(event) =>
                    setActionTitles((current) =>
                      current.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    )
                  }
                  aria-label={`Titlul acțiunii ${index + 1}`}
                  className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              ) : action.payload.title ? (
                <span className="block pl-3 text-faint">
                  {String(action.payload.title)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2 border-t border-accent/20 p-3">
        {proposal.status === "ready_for_review" ? (
          <>
            {editing ? (
              <>
                <Button size="sm" disabled={loading || !title.trim()} onClick={() => void save()}>
                  Salvează versiunea
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Renunță
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" disabled={loading} onClick={() => setEditing(true)}>
                Editează
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
