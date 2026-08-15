"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, MessageSquare, Paperclip } from "lucide-react";
import { cn, daysUntil, formatDateShort } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/types";
import { taskCategoryLabel } from "@/lib/planning-adapter";
import { Avatar, Badge } from "@/components/ui";

export const boardColumns: Array<{ id: TaskStatus; label: string }> = [
  { id: "not-started", label: "Neînceput" },
  { id: "in-progress", label: "În lucru" },
  { id: "waiting", label: "În așteptare" },
  { id: "blocked", label: "Blocat" },
  { id: "completed", label: "Finalizat" },
];

const priorityBorder: Record<Task["priority"], string> = {
  low: "border-l-sage",
  medium: "border-l-info",
  high: "border-l-warning",
  urgent: "border-l-danger",
};

function TaskCard({
  task,
  onOpen,
  overlay,
}: {
  task: Task;
  onOpen?: () => void;
  overlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  const days = daysUntil(task.deadline);
  const overdue = days < 0 && task.status !== "completed";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "cursor-grab rounded-lg border border-line border-l-[3px] bg-elevated p-3 shadow-card transition-shadow hover:shadow-pop active:cursor-grabbing",
        priorityBorder[task.priority],
        isDragging && "opacity-40",
        overlay && "rotate-2 shadow-overlay",
      )}
    >
      <p
        className={cn(
          "text-sm font-medium leading-snug text-ink",
          task.status === "completed" && "text-faint line-through",
        )}
      >
        {task.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-faint">
        <span
          className={cn(
            "inline-flex items-center gap-1",
            overdue && "font-semibold text-danger",
          )}
        >
          <CalendarClock className="size-3" aria-hidden />
          {formatDateShort(task.deadline)}
        </span>
        {task.comments > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare className="size-3" aria-hidden />
            {task.comments}
          </span>
        )}
        {task.attachments > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip className="size-3" aria-hidden />
            {task.attachments}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Badge variant="neutral">{taskCategoryLabel(task.category)}</Badge>
        <Avatar name={task.owner} size="xs" />
      </div>
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  onOpen,
}: {
  id: TaskStatus;
  label: string;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-subtle px-1.5 text-xs font-semibold text-muted tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver
            ? "border-brand bg-brand-softer/50"
            : "border-line bg-subtle/40",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => onOpen(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="flex flex-1 items-center justify-center px-3 text-center text-xs text-faint">
            Trage sarcini aici
          </p>
        )}
      </div>
    </div>
  );
}

export function BoardView({
  tasks,
  onStatusChange,
  onOpen,
}: {
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onOpen: (t: Task) => void;
}) {
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    // Dropped over a column or over another card — resolve target status
    const overId = over.id as string;
    const overColumn = boardColumns.find((c) => c.id === overId)?.id;
    const overTask = tasks.find((t) => t.id === overId);
    const targetStatus = overColumn ?? overTask?.status;
    if (targetStatus) onStatusChange(taskId, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {boardColumns.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            label={col.label}
            tasks={tasks.filter((t) => t.status === col.id)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
