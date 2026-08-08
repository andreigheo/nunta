"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  Copy,
  Link2,
  MessageSquare,
  Paperclip,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn, daysUntil, formatDate, formatRelativeTime } from "@/lib/utils";
import type { Task } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

type Comment = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type TaskDrawerProps = {
  task: Task | null;
  availableTasks: Task[];
  members: Array<{ id: string; name: string }>;
  onClose: () => void;
  onTransition: (
    task: Task,
    transition: "COMPLETE" | "REOPEN" | "BLOCK" | "UNBLOCK" | "POSTPONE",
  ) => Promise<void>;
  onUpdate: (
    task: Task,
    patch: {
      title?: string;
      description?: string | null;
      priority?: Task["priority"];
      assigneeMembershipId?: string | null;
      dueAt?: string | null;
    },
  ) => Promise<void>;
  onDuplicate: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  onDependencies: (task: Task, dependencyIds: string[]) => Promise<void>;
  loadComments: (taskId: string) => Promise<Comment[]>;
  addComment: (taskId: string, body: string) => Promise<Comment>;
};

const priorityLabels = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
  urgent: "Urgentă",
} as const;
const priorityTones = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
} as const;
const statusLabels = {
  "not-started": "Neînceput",
  "in-progress": "În lucru",
  waiting: "În așteptare",
  blocked: "Blocat",
  completed: "Finalizat",
} as const;

export function TaskDrawer(props: TaskDrawerProps) {
  if (!props.task) return null;
  return (
    <TaskDrawerContent
      key={`${props.task.id}-${props.task.version ?? 0}`}
      {...props}
      task={props.task}
    />
  );
}

function TaskDrawerContent({
  task,
  availableTasks,
  members,
  onClose,
  onTransition,
  onUpdate,
  onDuplicate,
  onDelete,
  onDependencies,
  loadComments,
  addComment,
}: Omit<TaskDrawerProps, "task"> & { task: Task }) {
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description ?? "");
  const [priority, setPriority] = React.useState<Task["priority"]>(
    task.priority,
  );
  const [assigneeMembershipId, setAssigneeMembershipId] = React.useState(
    task.assigneeMembershipId ?? "",
  );
  const [dueDate, setDueDate] = React.useState(task.deadline.slice(0, 10));
  const [comment, setComment] = React.useState("");
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [dependencyId, setDependencyId] = React.useState("");
  const [error, setError] = React.useState("");
  const completed = task.status === "completed";
  const days = daysUntil(task.deadline);

  React.useEffect(() => {
    void loadComments(task.id)
      .then(setComments)
      .catch((caught) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Comentariile nu au putut fi încărcate.",
        ),
      );
  }, [loadComments, task.id]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Operația nu a putut fi finalizată.",
      );
    } finally {
      setBusy(false);
    }
  };

  const ownerName = task.owner || "Nealocat";

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={
        <div className="flex items-start gap-3">
          <button
            onClick={() =>
              void run(() =>
                onTransition(task, completed ? "REOPEN" : "COMPLETE"),
              )
            }
            aria-label={
              completed ? "Redeschide sarcina" : "Finalizează sarcina"
            }
            className={cn(
              "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
              completed
                ? "border-success bg-success text-on-success"
                : "border-line-strong hover:border-success",
            )}
          >
            {completed && <Check className="size-3.5" strokeWidth={3} />}
          </button>
          <div className="min-w-0">
            <h2
              className={cn(
                "font-brand text-lg font-semibold text-ink",
                completed && "text-faint line-through",
              )}
            >
              {task.title}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant={priorityTones[task.priority]}>
                {priorityLabels[task.priority]}
              </Badge>
              <Badge variant="outline">{statusLabels[task.status]}</Badge>
              <Badge variant="neutral">{task.category}</Badge>
            </div>
          </div>
        </div>
      }
      headerActions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Duplică"
            aria-label="Duplică"
            disabled={busy}
            onClick={() => void run(() => onDuplicate(task))}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Șterge"
            aria-label="Șterge"
            disabled={busy}
            onClick={() => void run(() => onDelete(task))}
          >
            <Trash2 className="size-4 text-danger" />
          </Button>
        </>
      }
    >
      <div className="px-5 py-4">
        {error && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-subtle/70 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-faint">
              <CalendarClock className="size-3" />
              Termen
            </p>
            <p
              className={cn(
                "mt-0.5 text-[13px] font-semibold",
                days < 0 && !completed ? "text-danger" : "text-ink",
              )}
            >
              {formatDate(task.deadline)}
            </p>
          </div>
          <div className="rounded-lg bg-subtle/70 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-faint">
              <UserRound className="size-3" />
              Responsabil
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Avatar name={ownerName} size="xs" />
              {ownerName}
            </p>
          </div>
          <div className="rounded-lg bg-subtle/70 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-faint">
              <MessageSquare className="size-3" />
              Comentarii
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-ink">
              {comments.length}
            </p>
          </div>
          <div className="rounded-lg bg-subtle/70 p-2.5">
            <p className="flex items-center gap-1 text-[11px] text-faint">
              <Paperclip className="size-3" />
              Fișiere
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-faint">
              Planificat
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            loading={busy}
            onClick={() =>
              void run(() =>
                onTransition(task, completed ? "REOPEN" : "COMPLETE"),
              )
            }
          >
            {completed ? "Redeschide" : "Finalizează"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing((value) => !value)}
          >
            Editează
          </Button>
          {task.status === "blocked" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run(() => onTransition(task, "UNBLOCK"))}
            >
              Deblochează
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run(() => onTransition(task, "BLOCK"))}
            >
              Blochează
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void run(() => onTransition(task, "POSTPONE"))}
          >
            Amână 7 zile
          </Button>
        </div>

        {editing && (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
            <Field label="Titlu" className="sm:col-span-2">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Descriere" className="sm:col-span-2">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Prioritate">
              <Select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as Task["priority"])
                }
              >
                <option value="low">Scăzută</option>
                <option value="medium">Medie</option>
                <option value="high">Ridicată</option>
                <option value="urgent">Urgentă</option>
              </Select>
            </Field>
            <Field label="Responsabil">
              <Select
                value={assigneeMembershipId}
                onChange={(event) =>
                  setAssigneeMembershipId(event.target.value)
                }
              >
                <option value="">Nealocat</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Termen">
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    await onUpdate(task, {
                      title,
                      description,
                      priority,
                      assigneeMembershipId: assigneeMembershipId || null,
                      dueAt: dueDate
                        ? new Date(`${dueDate}T12:00:00`).toISOString()
                        : null,
                    });
                    setEditing(false);
                  })
                }
              >
                Salvează
              </Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="mt-5">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subtasks">Subsarcini</TabsTrigger>
            <TabsTrigger value="comments">Comentarii</TabsTrigger>
            <TabsTrigger value="activity">Activitate</TabsTrigger>
            <TabsTrigger value="files" disabled>
              Fișiere · planificat
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4 space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              {task.description || "Fără descriere."}
            </p>
            {task.blockedReason && (
              <div className="rounded-lg border border-warning/40 bg-warning-soft/50 p-3 text-sm text-warning">
                {task.blockedReason}
              </div>
            )}
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <Link2 className="size-4" />
                Dependențe
              </p>
              <div className="mt-2 flex gap-2">
                <Select
                  value={dependencyId}
                  onChange={(event) => setDependencyId(event.target.value)}
                >
                  <option value="">Alege sarcina precedentă</option>
                  {availableTasks
                    .filter((item) => item.id !== task.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="outline"
                  disabled={!dependencyId || busy}
                  onClick={() =>
                    void run(() => onDependencies(task, [dependencyId]))
                  }
                >
                  Salvează
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="subtasks" className="mt-4">
            {task.subtasks?.length ? (
              <ul className="space-y-2">
                {task.subtasks.map((subtask) => (
                  <li
                    key={subtask.id}
                    className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5"
                  >
                    <Check
                      className={cn(
                        "size-4",
                        subtask.done ? "text-success" : "text-faint",
                      )}
                    />
                    <span
                      className={
                        subtask.done ? "text-faint line-through" : "text-ink"
                      }
                    >
                      {subtask.title}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nu există subsarcini.</p>
            )}
          </TabsContent>
          <TabsContent value="comments" className="mt-4">
            <ul className="space-y-3">
              {comments.map((item) => (
                <li key={item.id} className="flex gap-2.5">
                  <Avatar name={item.authorName} size="sm" />
                  <div className="flex-1 rounded-lg bg-subtle/70 px-3 py-2">
                    <p className="flex justify-between text-[13px]">
                      <span className="font-semibold text-ink">
                        {item.authorName}
                      </span>
                      <span className="text-[11px] text-faint">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim()) return;
                void run(async () => {
                  const created = await addComment(task.id, comment.trim());
                  setComments((items) => [...items, created]);
                  setComment("");
                });
              }}
            >
              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Scrie un comentariu…"
              />
              <Button type="submit" disabled={!comment.trim() || busy}>
                Trimite
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <p className="text-sm text-muted">
              Activitatea semantică a acestei sarcini este disponibilă în
              Activity Feed.
            </p>
          </TabsContent>
          <TabsContent value="files" className="mt-4">
            <p className="text-sm text-muted">
              Fișierele rămân dezactivate până la storage securizat.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </Drawer>
  );
}
