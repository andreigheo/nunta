export function localActivityPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return null;
  return value;
}

export function activityHref(item: {
  category: string;
  entityType: string | null;
  metadata: Record<string, unknown> | null;
}): string {
  const metadataPath = localActivityPath(
    item.metadata?.actionUrl ?? item.metadata?.href,
  );
  if (metadataPath) return metadataPath;

  const entity = (item.entityType ?? "").toLowerCase();
  const category = item.category.toLowerCase();
  if (entity.includes("task") || category === "tasks") return "/plan";
  if (category === "team" || entity.includes("membership")) return "/team";
  if (
    entity.includes("guest") ||
    entity.includes("household") ||
    category === "guests"
  )
    return "/guests";
  if (
    entity.includes("invitation") ||
    entity.includes("campaign") ||
    category.includes("invitation")
  )
    return "/invitations";
  if (entity.includes("menu")) return "/menus";
  if (entity.includes("rsvp")) return "/rsvp";
  if (
    entity.includes("budget") ||
    entity.includes("expense") ||
    entity.includes("payment") ||
    category === "finance"
  )
    return "/budget";
  if (entity.includes("rfq")) return "/requests";
  if (entity.includes("offer") || category === "vendors") return "/offers";
  if (entity.includes("booking")) return "/bookings";
  if (entity.includes("contract")) return "/contracts";
  if (entity.includes("calendar")) return "/calendar";
  if (entity.includes("seating")) return "/seating";
  if (entity.includes("transport")) return "/transport";
  if (entity.includes("accommodation")) return "/accommodation";
  if (entity.includes("onboarding")) return "/onboarding";
  if (entity.includes("risk")) return "/risks";
  if (entity.includes("automation")) return "/automations";
  if (
    entity.includes("wedding") ||
    entity.includes("check_in") ||
    entity.includes("checkin") ||
    entity.includes("moment")
  )
    return "/wedding-day";
  return "/overview";
}
