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

type TimeParts = { h: string; m: string };
const EMPTY: TimeParts = { h: "", m: "" };

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function hourLabel(h: string) {
  const n = Number(h);
  return `${n % 12 || 12} ${n >= 12 ? "PM" : "AM"}`;
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStr(t: TimeParts) {
  return t.h && t.m ? `${t.h}:${t.m}` : "";
}

function toDate(date: string, time: string) {
  return new Date(`${date}T${time}`);
}

function isPast(date: string, slot: string) {
  return toDate(date, slot) <= new Date();
}

function endIsDisabled(endDate: string, slot: string, startDate: string, startStr: string) {
  if (!endDate) return false;
  if (isPast(endDate, slot)) return true;
  return !!startDate && !!startStr && toDate(endDate, slot) <= toDate(startDate, startStr);
}

function clean(t: TimeParts, isDisabled: (slot: string) => boolean): TimeParts {
  if (t.h && isDisabled(`${t.h}:59`)) return EMPTY;
  if (t.h && t.m && isDisabled(`${t.h}:${t.m}`)) return { h: t.h, m: "" };
  return t;
}

function TimePicker({
  value,
  onChange,
  isDisabled,
}: {
  value: TimeParts;
  onChange: (t: TimeParts) => void;
  isDisabled: (slot: string) => boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        value={value.h}
        onChange={(e) => onChange({ ...value, h: e.target.value })}
        required
      >
        <option value="" disabled>
          Hour
        </option>
        {HOURS.map((h) => (
          <option key={h} value={h} disabled={isDisabled(`${h}:59`)}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
      <select
        value={value.m}
        onChange={(e) => onChange({ ...value, m: e.target.value })}
        required
      >
        <option value="" disabled>
          Min
        </option>
        {MINUTES.map((m) => (
          <option
            key={m}
            value={m}
            disabled={value.h !== "" && isDisabled(`${value.h}:${m}`)}
          >
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SearchPage() {
  const [startDate, setStartDate] = useState("");
  const [startT, setStartT] = useState<TimeParts>(EMPTY);
  const [endDate, setEndDate] = useState("");
  const [endT, setEndT] = useState<TimeParts>(EMPTY);
  const [type, setType] = useState("");
  const [results, setResults] = useState<Resource[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [booking, setBooking] = useState(false);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [title, setTitle] = useState("");

  const today = todayDate();
  const startStr = timeStr(startT);
  const endStr = timeStr(endT);

  function updateStart(newDate: string, newT: TimeParts) {
    const startDisabled = (slot: string) => newDate !== "" && isPast(newDate, slot);
    const cleanedStart = clean(newT, startDisabled);

    let nextEndDate = endDate;
    if (newDate && (!endDate || endDate < newDate)) nextEndDate = newDate;

    setStartDate(newDate);
    setStartT(cleanedStart);
    setEndDate(nextEndDate);
    setEndT(
      clean(endT, (slot) =>
        endIsDisabled(nextEndDate, slot, newDate, timeStr(cleanedStart))
      )
    );
  }

  function updateEnd(newDate: string, newT: TimeParts) {
    setEndDate(newDate);
    setEndT(clean(newT, (slot) => endIsDisabled(newDate, slot, startDate, startStr)));
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const start = toDate(startDate, startStr);
    const end = toDate(endDate, endStr);

    if (start <= new Date()) {
      showToast("Please select a future start time", "error");
      return;
    }
    if (end <= start) {
      showToast("End time must be after start time", "error");
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
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
          startAt: toDate(startDate, startStr).toISOString(),
          endAt: toDate(endDate, endStr).toISOString(),
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

      <div className="rules">
        <strong>Booking rules</strong>
        <div>Any day and any time</div>
        <div>Up to 4 hours per booking</div>
        <div>Start time must be in the future</div>
      </div>

      <form onSubmit={handleSearch} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label>
          Start
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={(e) => updateStart(e.target.value, startT)}
              required
            />
            <TimePicker
              value={startT}
              onChange={(t) => updateStart(startDate, t)}
              isDisabled={(slot) => startDate !== "" && isPast(startDate, slot)}
            />
          </div>
        </label>

        <label>
          End
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="date"
              value={endDate}
              min={startDate || today}
              onChange={(e) => updateEnd(e.target.value, endT)}
              required
            />
            <TimePicker
              value={endT}
              onChange={(t) => updateEnd(endDate, t)}
              isDisabled={(slot) => endIsDisabled(endDate, slot, startDate, startStr)}
            />
          </div>
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