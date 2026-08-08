import { describe, expect, it } from "vitest";
import {
  hasDependencyCycle,
  nextBestAction,
  resolveTransition,
} from "../src/planning/planning.service";

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    title: "Task",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    dueAt: null,
    milestoneId: null,
    position: 0,
    ...overrides,
  } as never;
}

describe("Slice 2B planning rules", () => {
  it("enforces the task state machine and required transition inputs", () => {
    expect(
      resolveTransition("NOT_STARTED", { transition: "START", version: 1 })
        .status,
    ).toBe("IN_PROGRESS");
    expect(() =>
      resolveTransition("COMPLETED", { transition: "START", version: 1 }),
    ).toThrow();
    expect(() =>
      resolveTransition("IN_PROGRESS", { transition: "BLOCK", version: 1 }),
    ).toThrow();
    expect(() =>
      resolveTransition("IN_PROGRESS", { transition: "POSTPONE", version: 1 }),
    ).toThrow();
  });

  it("detects dependency cycles without rejecting a DAG", () => {
    expect(
      hasDependencyCycle([
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ]),
    ).toBe(true);
    expect(
      hasDependencyCycle([
        ["a", "b"],
        ["a", "c"],
        ["c", "d"],
      ]),
    ).toBe(false);
  });

  it("prioritizes urgent overdue work over every lower rule", () => {
    const urgent = task({
      title: "Urgent",
      priority: "URGENT",
      dueAt: new Date(Date.now() - 86_400_000),
    });
    const high = task({
      title: "High",
      priority: "HIGH",
      dueAt: new Date(Date.now() - 172_800_000),
    });
    expect(nextBestAction([high, urgent], [])?.title).toBe("Urgent");
    expect(nextBestAction([high, urgent], [])?.reason).toMatch(/urgent/i);
  });

  it("selects an approaching milestone before the first ordinary task", () => {
    const milestoneId = crypto.randomUUID();
    const ordinary = task({ title: "Ordinary", milestoneId });
    const milestone = {
      id: milestoneId,
      title: "Confirmări finale",
      targetAt: new Date(Date.now() + 5 * 86_400_000),
      status: "UPCOMING",
    } as never;
    const action = nextBestAction([ordinary], [], [milestone]);
    expect(action?.type).toBe("milestone");
    expect(action?.reason).toMatch(/milestone/i);
  });
});
