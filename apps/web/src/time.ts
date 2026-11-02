import { DateTime } from "luxon";

// "2026-11-02" + "10:00" on the office clock -> the real moment in time
export function officeToUtc(date: string, time: string, tz: string): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone: tz }).toJSDate();
}

// Today's date on the office clock, as "YYYY-MM-DD"
export function officeToday(tz: string): string {
  return DateTime.now().setZone(tz).toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;
}

// Midnight to midnight on the office clock (23 or 25 hours on clock-change days)
export function officeDayRange(date: string, tz: string) {
  const start = DateTime.fromISO(date, { zone: tz }).startOf("day");
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

export function formatOfficeDateTime(value: string | Date, tz: string): string {
  return DateTime.fromJSDate(new Date(value))
    .setZone(tz)
    .setLocale("en-US")
    .toLocaleString(DateTime.DATETIME_MED);
}

export function formatOfficeTime(value: string | Date, tz: string): string {
  return DateTime.fromJSDate(new Date(value))
    .setZone(tz)
    .setLocale("en-US")
    .toLocaleString(DateTime.TIME_SIMPLE);
}

// For example "Eastern Time (ET)", correct in both summer and winter
export function tzLabel(tz: string): string {
  const part = (style: "longGeneric" | "shortGeneric") =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;

  const long = part("longGeneric");
  const short = part("shortGeneric");
  if (long && short) return `${long} (${short})`;

  const now = DateTime.now().setZone(tz).setLocale("en-US");
  return `${now.offsetNameLong} (${now.offsetNameShort})`;
}