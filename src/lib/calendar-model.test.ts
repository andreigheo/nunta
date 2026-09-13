import { describe, expect, it } from "vitest";
import type { CalendarItem } from "@weddingos/contracts";
import {
  calendarInputValues,
  calendarMonthCells,
  itemsInCalendarPeriod,
  weekBounds,
  zonedDateTimeToIso,
} from "./calendar-model";

const item = (id: string, startAt: string): CalendarItem => ({
  id,
  sourceId: id,
  sourceType: "native_event",
  title: id,
  description: null,
  startAt,
  endAt: null,
  allDay: false,
  timezone: "Europe/Chisinau",
  location: null,
  editable: true,
  href: "/calendar",
  version: 1,
});

describe("calendar model", () => {
  it("builds a complete six-week month grid starting on Monday", () => {
    const cells = calendarMonthCells(new Date(2026, 8, 13, 12));
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ dayKey: "2026-08-31", inMonth: false });
    expect(cells[41]).toMatchObject({ dayKey: "2026-10-11", inMonth: false });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("uses a Monday through Sunday week instead of a fourteen-day window", () => {
    const cursor = new Date(2026, 7, 12, 12);
    const bounds = weekBounds(cursor);
    expect(bounds.start.getDay()).toBe(1);
    expect(bounds.end.getDay()).toBe(0);
    expect(bounds.end.getTime() - bounds.start.getTime()).toBe(6 * 86_400_000);
  });

  it("filters exactly the selected calendar week", () => {
    const items = [
      item("monday", "2026-08-10T09:00:00.000Z"),
      item("sunday", "2026-08-16T09:00:00.000Z"),
      item("next", "2026-08-17T09:00:00.000Z"),
    ];
    expect(
      itemsInCalendarPeriod(
        items,
        "week",
        new Date(2026, 7, 12, 12),
        "UTC",
      ).map((entry) => entry.id),
    ).toEqual(["monday", "sunday"]);
  });

  it("round-trips workspace local date and time", () => {
    const iso = zonedDateTimeToIso(
      "2026-08-16",
      "18:30",
      "Europe/Chisinau",
    );
    expect(calendarInputValues(iso, "Europe/Chisinau")).toEqual({
      date: "2026-08-16",
      time: "18:30",
    });
  });
});
