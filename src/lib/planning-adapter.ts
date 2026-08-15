import type { TaskResource, TaskSummary } from "@weddingos/contracts";
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
  wedding_day: "Ziua nunții",
};

export function taskCategoryLabel(category: string): string {
  const normalized = category
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const known = taskCategoryLabels[normalized];
  if (known) return known;

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
    deadline: task.dueAt ?? task.createdAt,
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
