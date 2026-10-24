import { config } from "../config";
import { HttpError } from "../auth/auth.service";

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
}