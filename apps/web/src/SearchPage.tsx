import { useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";

type Resource = {
  id: string;
  name: string;
  type: "room" | "desk";
  floor: string | null;
  capacity: number;
  description: string | null;
};

export default function SearchPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<Resource[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (new Date(end) <= new Date(start)) {
      showToast("End time must be after start time", "error");
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
      if (type) params.set("type", type);
      setResults(await api<Resource[]>(`/availability/search?${params}`));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Search failed", "error");
    }
    setSearching(false);
  }

  function openDialog(resource: Resource) {
    setTitle("");
    setSelected(resource);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBooking(true);
    try {
      await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          resourceId: selected.id,
          title: title.trim() || "Booking",
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
        }),
      });
      showToast(`Booked ${selected.name}!`);
      setResults(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Booking failed", "error");
    }
    setBooking(false);
    setSelected(null);
  }

  return (
    <div>
      <h3>Search and book</h3>
      <form onSubmit={handleSearch} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label>
          Start{" "}
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          End{" "}
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Rooms and desks</option>
          <option value="room">Rooms</option>
          <option value="desk">Desks</option>
        </select>
        <button type="submit" disabled={searching}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {searching && (
        <p style={{ color: "var(--muted)" }}>
          The first request after a quiet period can take up to 30 seconds.
        </p>
      )}

      {results && results.length === 0 && <p>Nothing available for that time.</p>}
      {results && results.length > 0 && (
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              {r.name} ({r.type}, capacity {r.capacity}){" "}
              <button onClick={() => openDialog(r)}>Book</button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Book {selected.name}</h3>
            <form onSubmit={handleConfirm} style={{ display: "grid", gap: 10 }}>
              <input
                autoFocus
                placeholder="Meeting or booking title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setSelected(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={booking}>
                  {booking ? "Booking..." : "Confirm booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}