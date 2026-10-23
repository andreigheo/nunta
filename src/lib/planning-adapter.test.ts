import { describe, expect, it } from "vitest";
import {
  planStatusHeadline,
  taskCategoryLabel,
  taskFromApi,
  taskDaysUntil,
  taskDeadlineLabel,
  compareTaskDeadlines,
} from "@/lib/planning-adapter";

describe("taskCategoryLabel", () => {
  it("translates generated planning categories into Romanian labels", () => {
    expect(taskCategoryLabel("budget")).toBe("Buget");
    expect(taskCategoryLabel("guest_list")).toBe("Lista de invitați");
    expect(taskCategoryLabel("civil-ceremony")).toBe("Ceremonie civilă");
    expect(taskCategoryLabel("contingency")).toBe(
      "Plan B și situații neprevăzute",
    );
    expect(taskCategoryLabel("post_wedding")).toBe("După eveniment");
  });

  it("keeps custom categories readable instead of exposing raw slugs", () => {
    expect(taskCategoryLabel("personal_touch")).toBe("Personal touch");
    expect(taskCategoryLabel("  ")).toBe("Altele");
  });
});

describe("planStatusHeadline", () => {
  it("describes an untouched plan honestly", () => {
    expect(
      planStatusHeadline({
        total: 21,
        completed: 0,
        overdue: 0,
        blocked: 0,
        unassigned: 21,
      }),
    ).toBe("21 sarcini sunt pregătite pentru lucru.");
  });
});

describe("tasks without a deadline", () => {
  it("keeps an absent API deadline absent, rather than using the creation timestamp", () => {
    const task = taskFromApi({
      id: "test",
      title: "Fără termen",
      dueAt: null,
      createdAt: "2020-01-01T00:00:00.000Z",
      status: "not_started",
    } as Parameters<typeof taskFromApi>[0]);
    expect(task.deadline).toBeNull();
    expect(taskDeadlineLabel(task.deadline)).toBe("Fără termen");
    expect(taskDaysUntil(task.deadline) < 0).toBe(false);
    expect(taskDaysUntil(task.deadline) <= 7).toBe(false);
  });
  it("keeps undated tasks last in both deadline sort directions", () => {
    const deadlines = [null, "2028-06-10", "2027-06-10", null];
    expect([...deadlines].sort((a, b) => compareTaskDeadlines(a, b))).toEqual([
      "2027-06-10",
      "2028-06-10",
      null,
      null,
    ]);
    expect(
      [...deadlines].sort((a, b) => compareTaskDeadlines(a, b, "desc")),
    ).toEqual(["2028-06-10", "2027-06-10", null, null]);
  });
});
