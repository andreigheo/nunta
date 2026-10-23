import type { TaskResource, TaskSummary } from "@weddingos/contracts";
import { daysUntil, formatDate, formatDateShort } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/types";

const taskCategoryLabels: Record<string, string> = {
  accommodation: "Cazare",
  budget: "Buget",
  catering: "Catering",
  civil_ceremony: "Ceremonie civilă",
  contracts: "Contracte",
  decor_flowers: "Decor și flori",
  documents: "Documente",
  entertainment: "Entertainment",
  experience: "Experiență",
  food_drinks: "Meniu și băuturi",
  guest_list: "Lista de invitați",
  guests: "Invitați",
  invitations: "Invitații",
  logistics: "Logistică",
  payments: "Plăți",
  photo_video: "Foto-video",
  planning: "Planificare",
  reception: "Recepție",
  religious_ceremony: "Ceremonie religioasă",
  rings: "Verighete",
  risks: "Riscuri",
  rsvp: "Confirmări RSVP",
  vendors: "Furnizori",
  venue: "Locație",
  wedding_day: "Ziua evenimentului",
  contingency: "Plan B și situații neprevăzute",
  post_wedding: "După eveniment",
};

export function planStatusHeadline(input: {
  total: number;
  completed: number;
  overdue: number;
  blocked: number;
  unassigned: number;
}) {
  if (input.overdue > 0)
    return `${input.overdue} ${input.overdue === 1 ? "sarcină are" : "sarcini au"} termenul depășit.`;
  if (input.blocked > 0)
    return `${input.blocked} ${input.blocked === 1 ? "sarcină este blocată" : "sarcini sunt blocate"}.`;
  if (input.total > 0 && input.completed === input.total)
    return "Planul este finalizat.";
  if (input.completed === 0)
    return `${input.total} ${input.total === 1 ? "sarcină este pregătită" : "sarcini sunt pregătite"} pentru lucru.`;
  if (input.unassigned > 0)
    return `${input.unassigned} ${input.unassigned === 1 ? "sarcină nu are" : "sarcini nu au"} încă responsabil.`;
  return "Planul avansează conform activității înregistrate.";
}

export function taskCategoryLabel(category: string): string {
  const normalized = category
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const known = taskCategoryLabels[normalized];
  if (known) return known;

  if (normalized === "ziua_nunții" || normalized === "ziua_nuntii") return "Ziua evenimentului";
  const readable = category.trim().replace(/[_-]+/g, " ");
  if (!readable) return "Altele";
  return readable.charAt(0).toLocaleUpperCase("ro-RO") + readable.slice(1);
}

const statusFromApi: Record<TaskSummary["status"], TaskStatus> = {
  not_started: "not-started",
  in_progress: "in-progress",
  waiting: "waiting",
  blocked: "blocked",
  completed: "completed",
  archived: "completed",
};

export function taskFromApi(task: TaskSummary | TaskResource): Task {
  const nested = "subtasks" in task ? task.subtasks : [];
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    category: task.category,
    owner: task.assigneeName ?? "Nealocat",
    priority: task.priority,
    status: statusFromApi[task.status],
    deadline: task.dueAt,
    startDate: task.startAt ?? undefined,
    comments: task.commentCount,
    attachments: 0,
    subtasks: nested.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.status === "completed",
    })),
    isPrivate: task.isPrivate,
    version: task.version,
    assigneeMembershipId: task.assigneeMembershipId,
    phaseId: task.phaseId,
    milestoneId: task.milestoneId,
    blockedReason: task.blockedReason,
  };
}

export const transitionForStatus: Record<
  Exclude<TaskStatus, "not-started">,
  "START" | "WAIT" | "BLOCK" | "COMPLETE"
> = {
  "in-progress": "START",
  waiting: "WAIT",
  blocked: "BLOCK",
  completed: "COMPLETE",
};

/** Undated tasks never count as overdue or due this week. */
export function taskDaysUntil(deadline: string | null): number {
  return deadline ? daysUntil(deadline) : Number.POSITIVE_INFINITY;
}

export function taskDeadlineLabel(
  deadline: string | null,
  long = false,
): string {
  return deadline
    ? long
      ? formatDate(deadline)
      : formatDateShort(deadline)
    : "Fără termen";
}

export function compareTaskDeadlines(
  left: string | null,
  right: string | null,
  direction: "asc" | "desc" = "asc",
): number {
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  const comparison = left.localeCompare(right);
  return direction === "asc" ? comparison : -comparison;
}
