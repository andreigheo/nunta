import { describe, expect, it } from "vitest";
import { planStatusHeadline, taskCategoryLabel } from "@/lib/planning-adapter";

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
