import { describe, expect, it } from "vitest";
import { taskCategoryLabel } from "@/lib/planning-adapter";

describe("taskCategoryLabel", () => {
  it("translates generated planning categories into Romanian labels", () => {
    expect(taskCategoryLabel("budget")).toBe("Buget");
    expect(taskCategoryLabel("guest_list")).toBe("Lista de invitați");
    expect(taskCategoryLabel("civil-ceremony")).toBe("Ceremonie civilă");
  });

  it("keeps custom categories readable instead of exposing raw slugs", () => {
    expect(taskCategoryLabel("personal_touch")).toBe("Personal touch");
    expect(taskCategoryLabel("  ")).toBe("Altele");
  });
});
