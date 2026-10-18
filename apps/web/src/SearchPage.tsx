import { useState } from "react";
import { api } from "./api";

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
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (new Date(end) <= new Date(start)) {
      setMessage("End time must be after start time");
      return;
    }
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
      if (type) params.set("type", type);
      setResults(await api<Resource[]>(`/availability/search?${params}`));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function handleBook(resourceId: string) {
    setMessage("");
    if (new Date(end) <= new Date(start)) {
      setMessage("End time must be after start time");
      return;
    }
    try {
      await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          resourceId,
          title: title || "Booking",
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
        }),
      });
      setMessage("Booked!");
      setResults(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Booking failed");
    }
  }

  return (
    <div>
      <h3>Search and book</h3>
      <form onSubmit={handleSearch} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <label>
          Start <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          End <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Rooms and desks</option>
          <option value="room">Rooms</option>
          <option value="desk">Desks</option>
        </select>
        <input placeholder="Booking title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      {message && <p>{message}</p>}

      {results && results.length === 0 && <p>Nothing available for that time.</p>}
      {results && results.length > 0 && (
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              {r.name} ({r.type}, capacity {r.capacity}){" "}
              <button onClick={() => handleBook(r.id)}>Book</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}