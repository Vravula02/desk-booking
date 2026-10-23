import { useEffect, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";

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
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function load() {
    try {
      setBookings(await api<Booking[]>("/bookings/mine"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load bookings", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      showToast("Booking cancelled");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cancel failed", "error");
    }
    setCancellingId(null);
  }

  const now = new Date();
  const upcoming = bookings.filter((b) => new Date(b.endAt) >= now).reverse();
  const past = bookings.filter((b) => new Date(b.endAt) < now);

  function renderItem(b: Booking, canCancel: boolean) {
    return (
      <li key={b.id}>
        {b.resource.name}: {b.title}, {formatTime(b.startAt)} to {formatTime(b.endAt)}{" "}
        <span className={`badge badge-${b.status}`}>{b.status}</span>{" "}
        {canCancel && b.status === "confirmed" && (
          <button
            className="btn-danger"
            disabled={cancellingId === b.id}
            onClick={() => handleCancel(b.id)}
          >
            {cancellingId === b.id ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </li>
    );
  }

  if (loading) return <p>Loading your bookings...</p>;

  return (
    <div>
      <h3>Upcoming bookings</h3>
      {upcoming.length === 0 && <p>No upcoming bookings.</p>}
      <ul>{upcoming.map((b) => renderItem(b, true))}</ul>

      <h3>Past bookings</h3>
      {past.length === 0 && <p>No past bookings.</p>}
      <ul>{past.map((b) => renderItem(b, false))}</ul>
    </div>
  );
}