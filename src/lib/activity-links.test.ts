import { describe, expect, it } from "vitest";
import { activityHref, localActivityPath } from "./activity-links";

describe("activityHref", () => {
  it("prefers a local metadata path", () => {
    expect(
      activityHref({
        category: "tasks",
        entityType: "Task",
        metadata: { actionUrl: "/plan?task=1" },
      }),
    ).toBe("/plan?task=1");
  });

  it("rejects protocol-relative metadata paths", () => {
    expect(localActivityPath("//evil.example/x")).toBeNull();
    expect(
      activityHref({
        category: "tasks",
        entityType: "Task",
        metadata: { href: "//evil.example/x" },
      }),
    ).toBe("/plan");
  });

  it("routes known entities to their product pages", () => {
    expect(
      activityHref({
        category: "guests",
        entityType: "Guest",
        metadata: null,
      }),
    ).toBe("/guests");
    expect(
      activityHref({
        category: "team",
        entityType: "WorkspaceMembership",
        metadata: null,
      }),
    ).toBe("/team");
    expect(
      activityHref({
        category: "finance",
        entityType: "BudgetItem",
        metadata: null,
      }),
    ).toBe("/budget");
  });

  it("falls back to overview", () => {
    expect(
      activityHref({
        category: "unknown",
        entityType: null,
        metadata: null,
      }),
    ).toBe("/overview");
  });
});
