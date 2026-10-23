import { useEffect, useState } from "react";
import { api } from "./api";

type TimelineResource = {
  id: string;
  name: string;
  type: "room" | "desk";
  capacity: number;
  bookings: { id: string; startAt: string; endAt: string; isMine: boolean }[];
};

const OPEN = 9;
const CLOSE = 18;
const HOURS = CLOSE - OPEN;

function todayString() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hourOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function clamp(h: number) {
  return Math.min(Math.max(h, OPEN), CLOSE);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeStyle: "short" });
}

export default function TimelinePage() {
  const [date, setDate] = useState(todayString());
  const [rows, setRows] = useState<TimelineResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const start = new Date(`${date}T00:00`).toISOString();
        const end = new Date(`${date}T23:59`).toISOString();
        setRows(await api<TimelineResource[]>(`/availability/timeline?start=${start}&end=${end}`));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not load timeline");
      }
      setLoading(false);
    }

    load();
  }, [date]);

  const hourLabels = Array.from({ length: HOURS }, (_, i) => OPEN + i);

  return (
    <div>
      <h3>Timeline</h3>
      <label style={{ maxWidth: 200 }}>
        Day <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
        <span className="tl-key" style={{ background: "var(--primary)" }} /> your bookings{" "}
        <span className="tl-key" style={{ background: "#9ca3af" }} /> booked by others
      </p>

      {message && <p className="error">{message}</p>}
      {loading && <p>Loading...</p>}

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 560 }}>
          <div className="tl-row">
            <span />
            <div className="tl-hours">
              {hourLabels.map((h) => (
                <span key={h}>{h}:00</span>
              ))}
            </div>
          </div>

          {rows.map((r) => (
            <div className="tl-row" key={r.id}>
              <span>
                {r.name}
                <br />
                <small style={{ color: "var(--muted)" }}>
                  {r.type}, {r.capacity}
                </small>
              </span>
              <div className="tl-track">
                {r.bookings.map((b) => {
                  const s = clamp(hourOfDay(b.startAt));
                  const e = clamp(hourOfDay(b.endAt));
                  return (
                    <div
                      key={b.id}
                      className={`tl-bar${b.isMine ? " mine" : ""}`}
                      style={{
                        left: `${((s - OPEN) / HOURS) * 100}%`,
                        width: `${((e - s) / HOURS) * 100}%`,
                      }}
                      title={`${formatTime(b.startAt)} to ${formatTime(b.endAt)}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}