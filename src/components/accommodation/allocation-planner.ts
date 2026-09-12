export type AccommodationPlannerRequest = {
  id: string;
  householdId: string;
  isChild: boolean;
  requiresAccessibleRoom: boolean;
};

export type AccommodationPlannerRoom = {
  id: string;
  status: string;
  accessible: boolean;
  capacityAdults: number;
  capacityChildren: number;
  allocatedGuests: Array<{ isChild: boolean }>;
};

export type AccommodationPlannerResult = {
  assignments: Array<{ requestId: string; roomId: string }>;
  unassignedHouseholdIds: string[];
};

/**
 * Produces a deterministic, conservative first-fit plan. A household is kept
 * together or left unassigned; the planner never silently splits it.
 */
export function planHouseholdRoomAssignments(
  requests: AccommodationPlannerRequest[],
  rooms: AccommodationPlannerRoom[],
): AccommodationPlannerResult {
  const capacity = rooms
    .filter((room) => room.status !== "unavailable")
    .map((room, index) => ({
      room,
      index,
      adults:
        room.capacityAdults -
        room.allocatedGuests.filter((guest) => !guest.isChild).length,
      children:
        room.capacityChildren -
        room.allocatedGuests.filter((guest) => guest.isChild).length,
    }));
  const households = new Map<string, AccommodationPlannerRequest[]>();
  for (const request of requests) {
    households.set(request.householdId, [
      ...(households.get(request.householdId) ?? []),
      request,
    ]);
  }
  const groups = [...households.entries()].sort(
    ([leftId, left], [rightId, right]) =>
      right.length - left.length || leftId.localeCompare(rightId),
  );
  const assignments: AccommodationPlannerResult["assignments"] = [];
  const unassignedHouseholdIds: string[] = [];
  for (const [householdId, group] of groups) {
    const adults = group.filter((request) => !request.isChild).length;
    const children = group.length - adults;
    const requiresAccessibleRoom = group.some(
      (request) => request.requiresAccessibleRoom,
    );
    const target = capacity
      .filter(
        (candidate) =>
          candidate.adults >= adults &&
          candidate.children >= children &&
          (!requiresAccessibleRoom || candidate.room.accessible),
      )
      .sort(
        (left, right) =>
          left.adults + left.children - (right.adults + right.children) ||
          left.index - right.index,
      )[0];
    if (!target) {
      unassignedHouseholdIds.push(householdId);
      continue;
    }
    target.adults -= adults;
    target.children -= children;
    assignments.push(
      ...group.map((request) => ({
        requestId: request.id,
        roomId: target.room.id,
      })),
    );
  }
  return { assignments, unassignedHouseholdIds };
}
