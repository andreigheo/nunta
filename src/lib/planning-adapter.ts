import type { TaskResource, TaskSummary } from "@weddingos/contracts";
import type { Task, TaskStatus } from "@/lib/types";

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
