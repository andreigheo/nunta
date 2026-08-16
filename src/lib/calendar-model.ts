import type { CalendarItem } from "@weddingos/contracts";

export type CalendarView = "month" | "week" | "agenda";

function partsInTimeZone(value: string | Date, timeZone: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function calendarDayKey(value: string | Date, timeZone: string) {
  const parts = partsInTimeZone(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function calendarInputValues(value: string, timeZone: string) {
  const parts = partsInTimeZone(value, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function formatCalendarDateLong(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function zonedDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(desiredUtc);

  // Intl exposes the zone offset through the wall-clock parts. A second pass
  // keeps the conversion correct around daylight-saving transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = partsInTimeZone(candidate, timeZone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate = new Date(candidate.getTime() + desiredUtc - representedUtc);
  }
  return candidate.toISOString();
}

function localDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekBounds(anchor: Date) {
  const start = localDay(anchor);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

export function calendarPeriodLabel(view: CalendarView, cursor: Date) {
  if (view === "month")
    return cursor.toLocaleDateString("ro-RO", {
      month: "long",
      year: "numeric",
    });
  if (view === "week") {
    const { start, end } = weekBounds(cursor);
    const startLabel = start.toLocaleDateString("ro-RO", {
      day: "numeric",
      month: start.getMonth() === end.getMonth() ? undefined : "short",
    });
    const endLabel = end.toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `${startLabel} – ${endLabel}`;
  }
  return "Toate datele planificării";
}

export function itemsInCalendarPeriod(
  items: CalendarItem[],
  view: CalendarView,
  cursor: Date,
  timeZone: string,
) {
  if (view === "agenda") return items;
  if (view === "month") {
    const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    return items.filter((item) =>
      calendarDayKey(item.startAt, timeZone).startsWith(prefix),
    );
  }
  const { start, end } = weekBounds(cursor);
  const startKey = localDayKey(start);
  const endKey = localDayKey(end);
  return items.filter((item) => {
    const key = calendarDayKey(item.startAt, timeZone);
    return key >= startKey && key <= endKey;
  });
}

export function nextCalendarItem(
  items: CalendarItem[],
  timeZone: string,
  now = new Date(),
) {
  const today = calendarDayKey(now, timeZone);
  return items.find((item) => calendarDayKey(item.startAt, timeZone) >= today);
}
