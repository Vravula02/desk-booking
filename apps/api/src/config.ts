function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const officeTimezone = process.env.OFFICE_TIMEZONE || "America/New_York";
try {
  new Intl.DateTimeFormat("en-US", { timeZone: officeTimezone });
} catch {
  throw new Error(`Invalid OFFICE_TIMEZONE: ${officeTimezone}`);
}

export const config = {
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  officeTimezone,
  openHour: Number(process.env.OPEN_HOUR) || 9,
  closeHour: Number(process.env.CLOSE_HOUR) || 18,
  maxBookingMinutes: Number(process.env.MAX_BOOKING_MINUTES) || 240,
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:5173",
};