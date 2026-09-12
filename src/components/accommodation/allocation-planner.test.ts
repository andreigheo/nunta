import { describe, expect, it } from "vitest";
import { planHouseholdRoomAssignments } from "./allocation-planner";

describe("planHouseholdRoomAssignments", () => {
  it("keeps an adult and child from one household in the same room", () => {
    const result = planHouseholdRoomAssignments(
      [
        {
          id: "adult",
          householdId: "family",
          isChild: false,
          requiresAccessibleRoom: false,
        },
        {
          id: "child",
          householdId: "family",
          isChild: true,
          requiresAccessibleRoom: false,
        },
      ],
      [
        {
          id: "room",
          status: "available",
          accessible: false,
          capacityAdults: 2,
          capacityChildren: 1,
          allocatedGuests: [],
        },
      ],
    );
    expect(result.assignments).toEqual([
      { requestId: "adult", roomId: "room" },
      { requestId: "child", roomId: "room" },
    ]);
    expect(result.unassignedHouseholdIds).toEqual([]);
  });

  it("uses only an accessible room when a household needs one", () => {
    const result = planHouseholdRoomAssignments(
      [
        {
          id: "guest",
          householdId: "family",
          isChild: false,
          requiresAccessibleRoom: true,
        },
      ],
      [
        {
          id: "standard",
          status: "available",
          accessible: false,
          capacityAdults: 2,
          capacityChildren: 0,
          allocatedGuests: [],
        },
        {
          id: "accessible",
          status: "available",
          accessible: true,
          capacityAdults: 2,
          capacityChildren: 0,
          allocatedGuests: [],
        },
      ],
    );
    expect(result.assignments).toEqual([
      { requestId: "guest", roomId: "accessible" },
    ]);
  });

  it("leaves a household unassigned instead of splitting it", () => {
    const result = planHouseholdRoomAssignments(
      [
        {
          id: "one",
          householdId: "family",
          isChild: false,
          requiresAccessibleRoom: false,
        },
        {
          id: "two",
          householdId: "family",
          isChild: false,
          requiresAccessibleRoom: false,
        },
      ],
      [
        {
          id: "room-a",
          status: "available",
          accessible: false,
          capacityAdults: 1,
          capacityChildren: 0,
          allocatedGuests: [],
        },
        {
          id: "room-b",
          status: "available",
          accessible: false,
          capacityAdults: 1,
          capacityChildren: 0,
          allocatedGuests: [],
        },
      ],
    );
    expect(result.assignments).toEqual([]);
    expect(result.unassignedHouseholdIds).toEqual(["family"]);
  });
});
