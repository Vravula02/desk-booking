import { config } from "../config";
import { HttpError } from "../auth/auth.service";

// Returns the weekday, date, and minutes-since-midnight of a moment in office time
function officeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.officeTimezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  return {
    weekday: get("weekday"), // "Mon", "Tue", ...
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function checkBookingTimes(start: Date, end: Date) {
  if (start <= new Date()) {
    throw new HttpError(422, "IN_PAST", "Booking must start in the future");
  }

  const duration = (end.getTime() - start.getTime()) / 60000;
  if (duration > config.maxBookingMinutes) {
    throw new HttpError(
      422,
      "EXCEEDS_MAX_DURATION",
      `Bookings can be at most ${config.maxBookingMinutes} minutes`
    );
  }

  const s = officeParts(start);
  const e = officeParts(end);

  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(s.weekday);
  const sameDay = s.day === e.day;
  const withinHours =
    s.minutes >= config.openHour * 60 && e.minutes <= config.closeHour * 60;

  if (!isWeekday || !sameDay || !withinHours) {
    throw new HttpError(
      422,
      "OUTSIDE_OPENING_HOURS",
      `Bookings must be Monday to Friday, ${config.openHour}:00 to ${config.closeHour}:00 (${config.officeTimezone})`
    );
  }
}