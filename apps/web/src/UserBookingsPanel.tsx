import { useEffect, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";
import { useOfficeTz } from "./officeTimeContext";
import { formatOfficeDateTime } from "./time";
import {
  displayStatus,
  fetchBookingPage,
  isCancellable,
  type AdminBooking,
} from "./bookingsList";

type Props = {
  user: { id: string; name: string };
  version: number;
  onChanged: () => void;
  onSeeAll: () => void;
};

export default function UserBookingsPanel({ user, version, onChanged, onSeeAll }: Props) {
  const tz = useOfficeTz();
  const [upcoming, setUpcoming] = useState<AdminBooking[]>([]);
  const [past, setPast] = useState<AdminBooking[]>([]);
  const [total, setTotal] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [up, old] = await Promise.all([
          fetchBookingPage({ userId: user.id, when: "upcoming", sort: "oldest", limit: 10 }),
          fetchBookingPage({ userId: user.id, when: "past", sort: "newest", limit: 10 }),
        ]);
        if (!cancelled) {
          setLegacy(up.legacy || old.legacy);
          setUpcoming(up.items);
          setPast(old.items);
          setTotal(up.total + old.total);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : "Could not load bookings", "error");
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user.id, version]);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      showToast("Booking cancelled");
      setUpcoming((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" as const } : b))
      );
      onChanged(); // refresh the "upcoming bookings" count in the user list
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cancel failed", "error");
    }
    setCancellingId(null);
  }

  const now = new Date();

  function renderRow(b: AdminBooking) {
    const status = displayStatus(b, now);
    return (
      <li key={b.id} className="row">
        <div className="row-main">
          <strong>{b.resource.name}</strong> ({b.resource.type}): {b.title}
          <div className="meta">
            {formatOfficeDateTime(b.startAt, tz)} to {formatOfficeDateTime(b.endAt, tz)}
          </div>
        </div>
        <div className="row-actions">
          <span className={`badge badge-${status}`}>{status}</span>
          {isCancellable(b, now) && (
            <button
              className="btn-danger"
              disabled={cancellingId === b.id}
              aria-label={`Cancel the booking of ${b.resource.name}`}
              onClick={() => handleCancel(b.id)}
            >
              {cancellingId === b.id ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="user-panel" id={`panel-${user.id}`}>
      {loading && <p>Loading bookings...</p>}

      {!loading && legacy && (
        <p className="meta">This view needs the latest API version. Update the Container App.</p>
      )}

      {!loading && !legacy && (
        <>
          <h4>Upcoming</h4>
          {upcoming.length === 0 && <p className="meta">No upcoming bookings.</p>}
          <ul>{upcoming.map(renderRow)}</ul>

          <h4>Past</h4>
          {past.length === 0 && <p className="meta">No past bookings.</p>}
          <ul>{past.map(renderRow)}</ul>

          {total > 0 && (
            <button onClick={onSeeAll}>
              See all {total} in Bookings
            </button>
          )}
        </>
      )}
    </div>
  );
}