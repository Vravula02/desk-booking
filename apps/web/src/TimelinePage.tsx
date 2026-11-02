import { useEffect, useState } from "react";
import { api } from "./api";
import { useOfficeTz } from "./officeTimeContext";
import { formatOfficeTime, officeDayRange, officeToday } from "./time";

type TimelineResource = {
  id: string;
  name: string;
  type: "room" | "desk";
  capacity: number;
  bookings: { id: string; startAt: string; endAt: string; isMine: boolean }[];
};

const LABEL_COUNT = 8;

export default function TimelinePage() {
  const tz = useOfficeTz();
  const [date, setDate] = useState(() => officeToday(tz));
  const [rows, setRows] = useState<TimelineResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const { start, end } = officeDayRange(date, tz);
  const startMs = start.getTime();
  const dayMs = end.getTime() - startMs; // 24 hours, or 23 or 25 on clock-change days

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");
      try {
        const range = officeDayRange(date, tz);
        const params = new URLSearchParams({
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        });
        setRows(await api<TimelineResource[]>(`/availability/timeline?${params}`));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not load timeline");
      }
      setLoading(false);
    }
    load();
  }, [date, tz]);

  function fraction(iso: string) {
    const f = (new Date(iso).getTime() - startMs) / dayMs;
    return Math.min(Math.max(f, 0), 1);
  }

  const labels = Array.from({ length: LABEL_COUNT }, (_, i) =>
    formatOfficeTime(new Date(startMs + (i * dayMs) / LABEL_COUNT), tz)
  );

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
        <div style={{ minWidth: 640 }}>
          <div className="tl-row">
            <span />
            <div className="tl-hours">
              {labels.map((label, i) => (
                <span key={i}>{label}</span>
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
                  const s = fraction(b.startAt);
                  const e = fraction(b.endAt);
                  return (
                    <div
                      key={b.id}
                      className={`tl-bar${b.isMine ? " mine" : ""}`}
                      style={{ left: `${s * 100}%`, width: `${(e - s) * 100}%` }}
                      title={`${formatOfficeTime(b.startAt, tz)} to ${formatOfficeTime(b.endAt, tz)}`}
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