import { useEffect, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";
import { useOfficeTz } from "./officeTimeContext";
import { formatOfficeDateTime } from "./time";

type Booking = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: "confirmed" | "cancelled";
  resource: { name: string };
  user: { name: string; email: string };
};


export default function AdminBookings() {
  const tz = useOfficeTz();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function load() {
    try {
      setBookings(await api<Booking[]>("/bookings"));
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

  return (
    <div>
      <h3>Admin: all bookings</h3>
      {loading && <p>Loading bookings...</p>}
      {!loading && bookings.length === 0 && <p>No bookings.</p>}
      <ul>
        {bookings.map((b) => (
          <li key={b.id}>
            {b.resource.name}: {b.title} by {b.user.name} ({b.user.email}),{" "}
            {formatOfficeDateTime(b.startAt, tz)} to {formatOfficeDateTime(b.endAt, tz)}{" "}
            <span className={`badge badge-${b.status}`}>{b.status}</span>{" "}
            {b.status === "confirmed" && (
              <button
                className="btn-danger"
                disabled={cancellingId === b.id}
                onClick={() => handleCancel(b.id)}
              >
                {cancellingId === b.id ? "Cancelling..." : "Cancel"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}