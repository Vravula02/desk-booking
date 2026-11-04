import { api } from "./api";

export type AdminBooking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: "confirmed" | "cancelled";
  resource: { name: string; type: "room" | "desk" };
  user: { name: string; email: string };
};

export type BookingQuery = {
  userId?: string;
  type?: string;
  when?: string;
  sort?: string;
  limit?: number;
  offset?: number;
};

export type BookingPage = { items: AdminBooking[]; total: number; legacy: boolean };

export async function fetchBookingPage(q: BookingQuery): Promise<BookingPage> {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });

  const data = await api<AdminBooking[] | { items: AdminBooking[]; total: number }>(
    `/bookings?${params}`
  );
  return Array.isArray(data)
    ? { items: data, total: data.length, legacy: true }
    : { items: data.items, total: data.total, legacy: false };
}

export function displayStatus(b: AdminBooking, now: Date) {
  const ended = new Date(b.endAt) <= now;
  return b.status === "confirmed" && ended ? "completed" : b.status;
}

export function isCancellable(b: AdminBooking, now: Date) {
  return b.status === "confirmed" && new Date(b.endAt) > now;
}