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

const PAGE = 50;

type Props = {
  userFilter: { id: string; name: string } | null;
  onClearUser: () => void;
};

export default function AdminBookings({ userFilter, onClearUser }: Props) {
  const tz = useOfficeTz();
  const [items, setItems] = useState<AdminBooking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [type, setType] = useState("");
  const [when, setWhen] = useState("");
  const [sort, setSort] = useState("newest");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const userId = userFilter?.id;

  // Changing any filter or the sort starts again from the first page
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const page = await fetchBookingPage({ userId, type, when, sort, limit: PAGE, offset: 0 });
        if (!cancelled) {
          setItems(page.items);
          setTotal(page.total);
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
  }, [userId, type, when, sort]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchBookingPage({
        userId,
        type,
        when,
        sort,
        limit: PAGE,
        offset: items.length,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...page.items.filter((b) => !seen.has(b.id))];
      });
      setTotal(page.total);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load more", "error");
    }
    setLoadingMore(false);
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      showToast("Booking cancelled");
      // Update the row in place, so the list doesn't jump around
      setItems((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled" as const } : b))
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Cancel failed", "error");
    }
    setCancellingId(null);
  }

  const now = new Date();
  const busy = loading || loadingMore;

  return (
    <div>
      <h3>Admin: all bookings</h3>

      {userFilter && (
        <p>
          <button
            className="chip"
            onClick={onClearUser}
            aria-label={`Remove the filter for ${userFilter.name}`}
          >
            Bookings for {userFilter.name} ✕
          </button>
        </p>
      )}

      <div className="filters">
        <select
          value={type}
          disabled={busy}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by resource type"
        >
          <option value="">All types</option>
          <option value="room">Rooms</option>
          <option value="desk">Desks</option>
        </select>
        <select
          value={when}
          disabled={busy}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="Filter by time"
        >
          <option value="">Past and upcoming</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </select>
        <select
          value={sort}
          disabled={busy}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort bookings"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="type">Resource type</option>
          <option value="name">Resource name</option>
        </select>
      </div>

      <p className="hint">
        {loading
          ? "Loading bookings..."
          : `Showing ${items.length} of ${total} booking${total === 1 ? "" : "s"}`}
      </p>

      {!loading && items.length === 0 && <p>No bookings match your filters.</p>}

      <ul>
        {items.map((b) => (
          <li key={b.id} className="row">
            <div className="row-main">
              <strong>{b.resource.name}</strong> ({b.resource.type}): {b.title}
              <div className="meta">
                {b.user.name} ({b.user.email})
              </div>
              <div className="meta">
                {formatOfficeDateTime(b.startAt, tz)} to {formatOfficeDateTime(b.endAt, tz)}
              </div>
            </div>
            <div className="row-actions">
              <span className={`badge badge-${displayStatus(b, now)}`}>
                {displayStatus(b, now)}
              </span>
              {isCancellable(b, now) && (
                <button
                  className="btn-danger"
                  disabled={cancellingId === b.id}
                  aria-label={`Cancel the booking of ${b.resource.name} by ${b.user.name}`}
                  onClick={() => handleCancel(b.id)}
                >
                  {cancellingId === b.id ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!loading && items.length < total && (
        <button className="load-more" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? "Loading..." : `Load more (${total - items.length} left)`}
        </button>
      )}
    </div>
  );
}