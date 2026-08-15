"use client";

import * as React from "react";
import type {
  PlanProposalItemResource,
  PlanProposalResource,
  UpdatePlanProposal,
} from "@weddingos/contracts";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";

type Props = {
  proposal: PlanProposalResource | null;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onUpdate: (input: UpdatePlanProposal) => Promise<void>;
  onApply: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
};

const itemLabels = {
  phase: "Fază",
  milestone: "Reper",
  task: "Sarcină",
} as const;
const priorityLabels = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
  urgent: "Urgentă",
} as const;

function countItems(items: PlanProposalItemResource[]) {
  const counts = { phases: 0, milestones: 0, tasks: 0 };
  const visit = (item: PlanProposalItemResource) => {
    if (item.included) {
      if (item.type === "phase") counts.phases += 1;
      if (item.type === "milestone") counts.milestones += 1;
      if (item.type === "task") counts.tasks += 1;
    }
    item.items.forEach(visit);
  };
  items.forEach(visit);
  return counts;
}

function ProposalItem({
  item,
  busy,
  onUpdate,
}: {
  item: PlanProposalItemResource;
  busy: boolean;
  onUpdate: Props["onUpdate"];
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(item.title);
  const [priority, setPriority] = React.useState(item.priority ?? "medium");
  const hasChildren = item.items.length > 0;

  const toggleIncluded = async () => {
    let reason: string | undefined;
    let confirmRequiredExclusion = false;
    if (item.required && item.included) {
      reason = window
        .prompt("Acest element este obligatoriu. Scrie motivul excluderii:")
        ?.trim();
      if (!reason) return;
      confirmRequiredExclusion = true;
    }
    await onUpdate({
      itemUpdates: [
        {
          id: item.id,
          included: !item.included,
          exclusionReason: reason,
          confirmRequiredExclusion,
        },
      ],
    });
  };

  return (
    <div className="rounded-xl border border-line bg-elevated">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          className="mt-1 text-faint"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Restrânge" : "Extinde"}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )
          ) : (
            <span className="block size-4" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{itemLabels[item.type]}</Badge>
            {item.required ? (
              <Badge variant="warning">Obligatoriu</Badge>
            ) : (
              <Badge variant="neutral">Opțional</Badge>
            )}
            {!item.included && <Badge variant="danger">Exclus</Badge>}
            {item.priority && (
              <Badge
                variant={
                  item.priority === "urgent"
                    ? "danger"
                    : item.priority === "high"
                      ? "warning"
                      : "neutral"
                }
              >
                {priorityLabels[item.priority]}
              </Badge>
            )}
          </div>
          {editing ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              {item.type === "task" ? (
                <Select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as typeof priority)
                  }
                >
                  <option value="low">Scăzută</option>
                  <option value="medium">Medie</option>
                  <option value="high">Ridicată</option>
                  <option value="urgent">Urgentă</option>
                </Select>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void onUpdate({
                    itemUpdates: [
                      {
                        id: item.id,
                        title,
                        priority: item.type === "task" ? priority : undefined,
                      },
                    ],
                  }).then(() => setEditing(false))
                }
              >
                Salvează
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-1 text-left text-sm font-semibold text-ink hover:text-brand"
              >
                {item.title}
              </button>
              {item.description && (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {item.description}
                </p>
              )}
              <p className="mt-1 text-xs text-faint">
                {item.absoluteDueAt
                  ? `Termen ${new Date(item.absoluteDueAt).toLocaleDateString("ro-RO")}`
                  : item.relativeDueOffsetDays !== null
                    ? `${Math.abs(item.relativeDueOffsetDays)} zile înainte de nuntă`
                    : "Fără termen"}
                {item.suggestedOwnerType
                  ? ` · Responsabil sugerat: ${item.suggestedOwnerType}`
                  : ""}
              </p>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void toggleIncluded()}
        >
          {item.included ? (
            <>
              <X className="size-3.5" />
              Exclude
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              Include
            </>
          )}
        </Button>
      </div>
      {expanded && hasChildren && (
        <div className="space-y-2 border-t border-line bg-surface/60 p-2 pl-7">
          {item.items.map((child) => (
            <ProposalItem
              key={child.id}
              item={child}
              busy={busy}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProposalReview({
  proposal,
  open,
  busy,
  onClose,
  onUpdate,
  onApply,
  onReject,
  onRegenerate,
}: Props) {
  const [manualTitle, setManualTitle] = React.useState("");
  const [rejectReason, setRejectReason] = React.useState("");
  if (!proposal) return null;
  const counts = countItems(proposal.items);
  const canApply = proposal.status === "ready_for_review";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={proposal.title}
      description="Propunere structurată și editabilă. Nimic nu devine plan definitiv până la aplicare."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Închide
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void onRegenerate()}
          >
            <RefreshCw className="size-4" />
            Regenerează
          </Button>
          <Button
            variant="outline"
            disabled={busy || !canApply}
            onClick={() => void onReject(rejectReason || undefined)}
          >
            Respinge
          </Button>
          <Button
            disabled={busy || !canApply}
            loading={busy}
            onClick={() => void onApply()}
          >
            Aplică planul
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm leading-relaxed text-muted">
              {proposal.summary}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="brand">
                <Sparkles className="size-3" />
                {proposal.generatorType === "fallback"
                  ? "Fallback determinist"
                  : proposal.generatorType === "ai_enriched"
                    ? "AI îmbogățit"
                    : "Determinist"}
              </Badge>
              <Badge variant="outline">Reguli {proposal.rulesVersion}</Badge>
              {proposal.fallbackUsed && (
                <Badge variant="warning">
                  Provider indisponibil · fallback folosit
                </Badge>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-subtle/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              Ce va fi adăugat
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-semibold text-ink">
                  {counts.phases}
                </p>
                <p className="text-xs text-muted">faze</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-ink">
                  {counts.milestones}
                </p>
                <p className="text-xs text-muted">repere</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-ink">{counts.tasks}</p>
                <p className="text-xs text-muted">sarcini</p>
              </div>
            </div>
          </div>
        </div>

        {(proposal.assumptions.length > 0 || proposal.warnings.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-ink">Ce am presupus</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {proposal.assumptions.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-warning/30 bg-warning-soft/30 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="size-4" />
                De verificat
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {proposal.warnings.length ? (
                  proposal.warnings.map((item) => <li key={item}>• {item}</li>)
                ) : (
                  <li>Nu există lucruri de verificat.</li>
                )}
              </ul>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line p-4">
          <p className="text-sm font-semibold text-ink">
            Ce include propunerea
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {proposal.coverage.covered.map((item) => (
              <Badge key={item} variant="success">
                {item}
              </Badge>
            ))}
            {proposal.coverage.missing.map((item) => (
              <Badge key={item} variant="danger">
                Lipsește: {item}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">
            Structura propunerii
          </p>
          <div className="space-y-2">
            {proposal.items.map((item) => (
              <ProposalItem
                key={item.id}
                item={item}
                busy={busy}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-line-strong p-4">
          <p className="text-sm font-semibold text-ink">
            Adaugă o sarcină manuală
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
              placeholder="Titlul sarcinii"
            />
            <Button
              variant="outline"
              disabled={!manualTitle.trim() || busy}
              onClick={() =>
                void onUpdate({
                  addItems: [
                    {
                      type: "task",
                      title: manualTitle.trim(),
                      category: "planning",
                      priority: "medium",
                      required: false,
                      included: true,
                      position: 999,
                    },
                  ],
                }).then(() => setManualTitle(""))
              }
            >
              <Plus className="size-4" />
              Adaugă
            </Button>
          </div>
        </div>

        <Field label="Motiv pentru respingere (opțional)">
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Ce trebuie schimbat la următoarea propunere?"
          />
        </Field>
      </div>
    </Modal>
  );
}
