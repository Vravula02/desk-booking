import { useEffect, useState } from "react";
import { api } from "./api";

type Booking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: "confirmed" | "cancelled";
  resource: { name: string; type: string };
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setBookings(await api<Booking[]>("/bookings/mine"));
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
      <h3>My bookings</h3>
      {message && <p>{message}</p>}
      {bookings.length === 0 && <p>No bookings yet.</p>}
      <ul>
        {bookings.map((b) => (
          <li key={b.id}>
            {b.resource.name}: {b.title}, {formatTime(b.startAt)} to {formatTime(b.endAt)}{" "}
            <span className={`badge badge-${b.status}`}>{b.status}</span>{" "}
            {b.status === "confirmed" && (
              <button className="btn-danger" onClick={() => handleCancel(b.id)}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}