"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type {
  InvitationEditorSnapshot,
  InvitationSection,
} from "@/lib/invitations/editor-model";
import { cn } from "@/lib/utils";
import { invitationSectionIcon } from "./editor-section-icons";

type SectionsPanelProps = {
  snapshot: InvitationEditorSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (id: string, toIndex: number) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  structuralLocked: boolean;
};

export function EditorSectionsPanel({
  snapshot,
  selectedId,
  onSelect,
  onMove,
  onReorder,
  onToggle,
  onDuplicate,
  onRemove,
  onAdd,
  structuralLocked,
}: SectionsPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = snapshot.sections.map((section) => section.id);

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    const toIndex = ids.indexOf(overId);
    if (toIndex < 0) return;
    onReorder(activeId, toIndex);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-faint">
            Structură
          </p>
          <Badge variant="neutral">{snapshot.sections.length}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">
          {structuralLocked
            ? "În variantă poți schimba conținutul și vizibilitatea, nu structura."
            : "Ordinea de aici este ordinea invitației. Trage de mâner sau folosește săgețile."}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <DndContext
          sensors={structuralLocked ? [] : sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1">
              {snapshot.sections.map((section, index) => (
                <SortableSectionRow
                  key={section.id}
                  section={section}
                  index={index}
                  total={snapshot.sections.length}
                  active={selectedId === section.id}
                  structuralLocked={structuralLocked}
                  onSelect={onSelect}
                  onMove={onMove}
                  onToggle={onToggle}
                  onDuplicate={onDuplicate}
                  onRemove={onRemove}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </div>
      <div className="border-t border-line p-3">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={structuralLocked}
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Adaugă secțiune
        </Button>
      </div>
    </div>
  );
}

function SortableSectionRow({
  section,
  index,
  total,
  active,
  structuralLocked,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  section: InvitationSection;
  index: number;
  total: number;
  active: boolean;
  structuralLocked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggle: (section: InvitationSection) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: structuralLocked });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-lg border transition-colors",
        active
          ? "border-brand/35 bg-brand-softer"
          : "border-transparent hover:bg-subtle",
        isDragging && "z-10 opacity-60 shadow-pop",
      )}
    >
      <div className="flex items-center gap-1.5 p-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={structuralLocked}
          aria-label={`Mută secțiunea ${section.label}`}
          className="grid size-11 shrink-0 place-items-center rounded-md text-faint enabled:cursor-grab enabled:hover:bg-surface enabled:hover:text-ink enabled:active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onSelect(section.id)}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1 text-left"
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg",
              section.visible
                ? "bg-surface text-brand-strong"
                : "bg-subtle text-faint",
            )}
          >
            {React.createElement(invitationSectionIcon(section), {
              className: "size-3.5",
              "aria-hidden": true,
            })}
          </span>
          <span
            className={cn(
              "truncate text-sm font-medium",
              section.visible ? "text-ink" : "text-faint line-through",
            )}
          >
            {section.label}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onToggle(section)}
          className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink"
          aria-label={
            section.visible ? "Ascunde secțiunea" : "Afișează secțiunea"
          }
        >
          {section.visible ? (
            <Eye className="size-3.5" aria-hidden />
          ) : (
            <EyeOff className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
      {active && (
        <div className="flex items-center justify-end gap-0.5 border-t border-brand/10 px-2 py-1">
          <button
            type="button"
            onClick={() => onMove(section.id, -1)}
            disabled={structuralLocked || index === 0}
            className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Mută mai sus"
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(section.id, 1)}
            disabled={structuralLocked || index === total - 1}
            className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Mută mai jos"
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(section.id)}
            disabled={structuralLocked}
            className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Duplică secțiunea"
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onRemove(section.id)}
            disabled={structuralLocked}
            className="grid size-11 cursor-pointer place-items-center rounded-md text-faint hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Șterge secțiunea"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
