import { describe, expect, it } from "vitest";
import { formatMoney, formatTime, formatTimeRange, timeZoneLabel } from "@/lib/format";
import { addDays, isDateString, isoWeekday, localDateString, localDayRange, zonedTimeToUtc } from "@/lib/time";

const TZ = "Asia/Tashkent";

describe("money formatting", () => {
  const plain = (text: string) => text.replace(/\s/g, " ");

  it("formats integer minor units (tiyin) as whole so'm", () => {
    expect(plain(formatMoney(29_900_000, "en", "UZS"))).toBe("299,000 UZS");
    expect(plain(formatMoney(29_900_050, "en", "UZS"))).toBe("299,000.50 UZS");
    expect(plain(formatMoney(0, "en", "UZS"))).toBe("0 UZS");
  });

  it("uses locale-aware grouping", () => {
    expect(formatMoney(29_900_000, "ru", "сум").replace(/\s/g, " ")).toBe("299 000 сум");
  });
});

describe("Tashkent time", () => {
  it("converts local wall-clock times to UTC instants (UTC+5)", () => {
    expect(zonedTimeToUtc("2026-09-27", "18:00", TZ).toISOString()).toBe("2026-09-27T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-09-28", "00:00", TZ).toISOString()).toBe("2026-09-27T19:00:00.000Z");
  });

  it("computes half-open local day ranges", () => {
    const { start, end } = localDayRange("2026-09-27", TZ);
    expect(start.toISOString()).toBe("2026-09-26T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-27T19:00:00.000Z");
  });

  it("derives the local date near midnight", () => {
    expect(localDateString(new Date("2026-09-27T18:59:59Z"), TZ)).toBe("2026-09-27");
    expect(localDateString(new Date("2026-09-27T19:00:00Z"), TZ)).toBe("2026-09-28");
  });

  it("formats times in the venue timezone with a label", () => {
    expect(formatTime("2026-09-27T13:00:00Z", "en", TZ)).toBe("18:00");
    expect(formatTimeRange("2026-09-27T13:00:00Z", "2026-09-27T14:30:00Z", "ru", TZ)).toBe("18:00–19:30");
    expect(timeZoneLabel("2026-09-27T13:00:00Z", "en", TZ)).toBe("GMT+5");
  });
});

describe("calendar helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isDateString("2026-02-28")).toBe(true);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-9-1")).toBe(false);
    expect(isDateString(20260901)).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("returns ISO weekdays", () => {
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-09-27")).toBe(7);
  });
});
