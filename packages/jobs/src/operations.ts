export const SEATING_RULES_VERSION = "seating-rules-2026-07-19.v1";

export type SeatingGuestInput = {
  id: string;
  householdId: string;
  primaryGuestId?: string | null;
  isChild: boolean;
  isPlusOne: boolean;
  accessibleRequired?: boolean;
};

export type SeatingTableInput = {
  id: string;
  capacity: number;
  locked?: boolean;
  accessibleSeats?: number;
};

export type SeatingExistingAssignment = {
  guestId: string;
  tableId: string;
  seatId?: string | null;
  locked?: boolean;
};

export type SeatingRuleConstraint = {
  type:
    | "KEEP_TOGETHER"
    | "KEEP_APART"
    | "PREFER_TOGETHER"
    | "PREFER_APART"
    | "MUST_BE_AT_TABLE"
    | "MUST_NOT_BE_AT_TABLE"
    | "ACCESSIBLE_SEAT_REQUIRED";
  guestId?: string | null;
  householdId?: string | null;
  relatedGuestId?: string | null;
  tableId?: string | null;
  required: boolean;
};

export type SeatingSuggestionOutput = {
  assignments: Array<{
    guestId: string;
    tableId: string;
    groupKey: string;
    rationale: string[];
  }>;
  unassignedGuestIds: string[];
  hardConflicts: string[];
  warnings: string[];
  violatedOptionalPreferences: string[];
  tableUtilization: Array<{
    tableId: string;
    assigned: number;
    capacity: number;
    percent: number;
  }>;
  score: number;
  rulesVersion: string;
};

export function contradictorySeatingConstraints(
  constraints: SeatingRuleConstraint[],
): string[] {
  const keys = new Set(
    constraints.map((constraint) => constraintKey(constraint, constraint.type)),
  );
  const conflicts: string[] = [];
  for (const constraint of constraints) {
    const opposite =
      constraint.type === "KEEP_TOGETHER"
        ? "KEEP_APART"
        : constraint.type === "KEEP_APART"
          ? "KEEP_TOGETHER"
          : constraint.type === "PREFER_TOGETHER"
            ? "PREFER_APART"
            : constraint.type === "PREFER_APART"
              ? "PREFER_TOGETHER"
              : constraint.type === "MUST_BE_AT_TABLE"
                ? "MUST_NOT_BE_AT_TABLE"
                : constraint.type === "MUST_NOT_BE_AT_TABLE"
                  ? "MUST_BE_AT_TABLE"
                  : null;
    if (opposite && keys.has(constraintKey(constraint, opposite)))
      conflicts.push(
        `CONTRADICTORY:${constraintKey(constraint, constraint.type)}`,
      );
  }
  return [...new Set(conflicts)].sort();
}

export function buildDeterministicSeatingSuggestion(input: {
  guests: SeatingGuestInput[];
  tables: SeatingTableInput[];
  existingAssignments?: SeatingExistingAssignment[];
  constraints?: SeatingRuleConstraint[];
}): SeatingSuggestionOutput {
  const constraints = input.constraints ?? [];
  const hardConflicts = contradictorySeatingConstraints(constraints);
  const warnings: string[] = [];
  const violatedOptionalPreferences: string[] = [];
  const tableById = new Map(input.tables.map((table) => [table.id, table]));
  const assignedCount = new Map(input.tables.map((table) => [table.id, 0]));
  const assignments = new Map<
    string,
    { guestId: string; tableId: string; groupKey: string; rationale: string[] }
  >();

  for (const existing of input.existingAssignments ?? []) {
    const table = tableById.get(existing.tableId);
    if (!table) {
      hardConflicts.push(`LOCKED_ASSIGNMENT_TABLE_MISSING:${existing.guestId}`);
      continue;
    }
    if (assignments.has(existing.guestId)) {
      hardConflicts.push(`DUPLICATE_ASSIGNMENT:${existing.guestId}`);
      continue;
    }
    const next = (assignedCount.get(table.id) ?? 0) + 1;
    if (next > table.capacity) {
      hardConflicts.push(`OVER_CAPACITY:${table.id}`);
      continue;
    }
    assignments.set(existing.guestId, {
      guestId: existing.guestId,
      tableId: table.id,
      groupKey: `locked:${existing.guestId}`,
      rationale: [
        existing.locked ? "locked_assignment" : "existing_assignment",
      ],
    });
    assignedCount.set(table.id, next);
  }

  const groups = new Map<string, SeatingGuestInput[]>();
  for (const guest of input.guests.filter(
    (candidate) => !assignments.has(candidate.id),
  )) {
    // Household is the canonical grouping boundary. Plus-one records inherit
    // the primary guest's household, so this keeps both the couple and any
    // children together without creating a competing primary-only group.
    const groupKey = `household:${guest.householdId}`;
    const current = groups.get(groupKey) ?? [];
    current.push(guest);
    groups.set(groupKey, current);
  }

  const orderedGroups = [...groups.entries()].sort(
    ([keyA, guestsA], [keyB, guestsB]) =>
      guestsB.length - guestsA.length || keyA.localeCompare(keyB),
  );
  for (const [groupKey, guests] of orderedGroups) {
    const requiredTableIds = new Set(
      constraints
        .filter(
          (constraint) =>
            constraint.required &&
            constraint.type === "MUST_BE_AT_TABLE" &&
            constraint.tableId &&
            (constraint.householdId === guests[0]?.householdId ||
              guests.some((guest) => guest.id === constraint.guestId)),
        )
        .map((constraint) => constraint.tableId!),
    );
    if (requiredTableIds.size > 1) {
      hardConflicts.push(`MULTIPLE_REQUIRED_TABLES:${groupKey}`);
      continue;
    }
    const requiredTableId = [...requiredTableIds][0];
    const candidates = input.tables
      .filter((table) => !table.locked || requiredTableId === table.id)
      .filter((table) => !requiredTableId || table.id === requiredTableId)
      .filter((table) => {
        const forbidden = constraints.some(
          (constraint) =>
            constraint.required &&
            constraint.type === "MUST_NOT_BE_AT_TABLE" &&
            constraint.tableId === table.id &&
            (constraint.householdId === guests[0]?.householdId ||
              guests.some((guest) => guest.id === constraint.guestId)),
        );
        return !forbidden;
      })
      .filter(
        (table) =>
          table.capacity - (assignedCount.get(table.id) ?? 0) >= guests.length,
      )
      .filter((table) => {
        const requiredAccessible = guests.filter(
          (guest) => guest.accessibleRequired,
        ).length;
        return requiredAccessible <= (table.accessibleSeats ?? table.capacity);
      })
      .sort((left, right) => {
        const leftRemaining =
          left.capacity - (assignedCount.get(left.id) ?? 0) - guests.length;
        const rightRemaining =
          right.capacity - (assignedCount.get(right.id) ?? 0) - guests.length;
        return (
          leftRemaining - rightRemaining || left.id.localeCompare(right.id)
        );
      });
    const table = candidates[0];
    if (!table) {
      warnings.push(`GROUP_UNASSIGNED:${groupKey}`);
      continue;
    }
    for (const guest of guests) {
      assignments.set(guest.id, {
        guestId: guest.id,
        tableId: table.id,
        groupKey,
        rationale: [
          guest.isPlusOne ? "plus_one_with_primary" : "household_together",
          ...(guest.isChild ? ["child_with_household"] : []),
          ...(guest.accessibleRequired ? ["accessible_capacity"] : []),
        ],
      });
    }
    assignedCount.set(
      table.id,
      (assignedCount.get(table.id) ?? 0) + guests.length,
    );
  }

  for (const constraint of constraints.filter((item) => !item.required)) {
    if (
      constraint.guestId &&
      constraint.relatedGuestId &&
      ["PREFER_TOGETHER", "PREFER_APART"].includes(constraint.type)
    ) {
      const first = assignments.get(constraint.guestId);
      const second = assignments.get(constraint.relatedGuestId);
      const together = first?.tableId === second?.tableId;
      if (
        (constraint.type === "PREFER_TOGETHER" && !together) ||
        (constraint.type === "PREFER_APART" && together)
      )
        violatedOptionalPreferences.push(
          `${constraint.type}:${constraint.guestId}:${constraint.relatedGuestId}`,
        );
    }
  }

  const unassignedGuestIds = input.guests
    .filter((guest) => !assignments.has(guest.id))
    .map((guest) => guest.id)
    .sort();
  const tableUtilization = input.tables.map((table) => {
    const assigned = assignedCount.get(table.id) ?? 0;
    return {
      tableId: table.id,
      assigned,
      capacity: table.capacity,
      percent: Math.round((assigned / table.capacity) * 100),
    };
  });
  const penalty =
    hardConflicts.length * 30 +
    unassignedGuestIds.length * 10 +
    violatedOptionalPreferences.length * 2;
  return {
    assignments: [...assignments.values()].sort((a, b) =>
      a.guestId.localeCompare(b.guestId),
    ),
    unassignedGuestIds,
    hardConflicts: [...new Set(hardConflicts)].sort(),
    warnings: [...new Set(warnings)].sort(),
    violatedOptionalPreferences: [
      ...new Set(violatedOptionalPreferences),
    ].sort(),
    tableUtilization,
    score: Math.max(0, 100 - penalty),
    rulesVersion: SEATING_RULES_VERSION,
  };
}

export function validateTransportCapacity(input: {
  capacity: number;
  accessibleCapacity: number;
  assignments: Array<{ seatCount: number; accessible: boolean }>;
}) {
  const assignedSeats = input.assignments.reduce(
    (sum, assignment) => sum + assignment.seatCount,
    0,
  );
  const accessibleSeats = input.assignments
    .filter((assignment) => assignment.accessible)
    .reduce((sum, assignment) => sum + assignment.seatCount, 0);
  return {
    assignedSeats,
    accessibleSeats,
    overCapacity: assignedSeats > input.capacity,
    accessibleOverCapacity: accessibleSeats > input.accessibleCapacity,
  };
}

export function validateAccommodationCapacity(input: {
  adultCapacity: number;
  childCapacity: number;
  guests: Array<{ isChild: boolean }>;
}) {
  const adults = input.guests.filter((guest) => !guest.isChild).length;
  const children = input.guests.length - adults;
  return {
    adults,
    children,
    adultOverCapacity: adults > input.adultCapacity,
    childOverCapacity: children > input.childCapacity,
    childWithoutAdult: children > 0 && adults === 0,
  };
}

function constraintKey(constraint: SeatingRuleConstraint, type: string) {
  const guests = [constraint.guestId, constraint.relatedGuestId]
    .filter(Boolean)
    .sort()
    .join(":");
  return [
    type,
    guests,
    constraint.householdId ?? "",
    constraint.tableId ?? "",
  ].join(":");
}
