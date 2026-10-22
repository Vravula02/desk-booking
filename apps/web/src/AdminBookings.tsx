import { useEffect, useState } from "react";
import { api } from "./api";

type Booking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: "confirmed" | "cancelled";
  resource: { name: string };
  user: { name: string; email: string };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setBookings(await api<Booking[]>("/bookings"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load bookings");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCancel(id: string) {
    setMessage("");
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  return (
    <div>
      <h3>Admin: all bookings</h3>
      {message && <p>{message}</p>}
      {bookings.length === 0 && <p>No bookings.</p>}
      <ul>
        {bookings.map((b) => (
          <li key={b.id}>
            {b.resource.name}: {b.title} by {b.user.name} ({b.user.email}),{" "}
            {formatTime(b.startAt)} to {formatTime(b.endAt)} ({b.status}){" "}
            {b.status === "confirmed" && (
              <button onClick={() => handleCancel(b.id)}>Cancel</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}