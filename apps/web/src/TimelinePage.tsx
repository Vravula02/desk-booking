import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useOfficeTz } from "./officeTimeContext";
import {
  addDays,
  formatOfficeDateTime,
  officeDayRange,
  officeHour,
  officeHourLabel,
  officeToUtc,
  officeToday,
} from "./time";

type TimelineBooking = {
  id: string;
  startAt: string;
  endAt: string;
  isMine: boolean;
  title: string | null;
};

type TimelineResource = {
  id: string;
  name: string;
  type: "room" | "desk";
  capacity: number;
  bookings: TimelineBooking[];
};

const FOCUS_START = "07:00";
const FOCUS_END = "20:00";
const STORAGE_KEY = "timeline-full-day";
const HOUR_MS = 3600000;

function readFull(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveFull(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage may be unavailable */
  }
}

function activate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: fn,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}

function overlaps(b: TimelineBooking, from: number, to: number) {
  return new Date(b.startAt).getTime() < to && new Date(b.endAt).getTime() > from;
}

export default function TimelinePage() {
  const tz = useOfficeTz();
  const [date, setDate] = useState(() => officeToday(tz));
  const [full, setFull] = useState(readFull);
  const [rows, setRows] = useState<TimelineResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<{
    booking: TimelineBooking;
    resource: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const day = officeDayRange(date, tz);
  const dayStart = day.start.getTime();
  const dayEnd = day.end.getTime();
  const wStart = full ? dayStart : officeToUtc(date, FOCUS_START, tz).getTime();
  const wEnd = full ? dayEnd : officeToUtc(date, FOCUS_END, tz).getTime();
  const span = wEnd - wStart;
  const hours = span / HOUR_MS;
  const isToday = date === officeToday(tz);
  const nowInWindow = isToday && nowMs >= wStart && nowMs <= wEnd;
  const pct = (ms: number) => ((ms - wStart) / span) * 100;
  const trackStyle = { width: `calc(${hours} * var(--tl-px))` };

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const track = el.querySelector<HTMLElement>(".tl2-track");
    const frac = (Date.now() - wStart) / (wEnd - wStart);
    if (isToday && track && frac > 0 && frac < 1) {
      el.scrollLeft = Math.max(0, frac * track.offsetWidth - el.clientWidth * 0.35);
    } else {
      el.scrollLeft = 0;
    }
  }, [rows, wStart, wEnd, isToday]);

  function changeDate(next: string) {
    if (!next) return;
    setDate(next);
    setSelected(null);
  }

  function setFullDay(value: boolean) {
    setFull(value);
    saveFull(value);
  }

  const ticks = Array.from({ length: Math.floor(hours) + 1 }, (_, i) => {
    const t = new Date(wStart + i * HOUR_MS);
    return { i, major: officeHour(t, tz) % 3 === 0, label: officeHourLabel(t, tz) };
  });

  function renderRow(r: TimelineResource) {
    const visible = r.bookings.filter((b) => overlaps(b, wStart, wEnd));
    const outside = r.bookings.filter((b) => overlaps(b, dayStart, dayEnd)).length - visible.length;

    return (
      <div className="tl2-row" key={r.id}>
        <div className="tl2-name">
          <strong>{r.name}</strong>
          <small>
            {r.type}, {r.capacity}
          </small>
          {outside > 0 && !full && (
            <span className="tl2-out" {...activate(() => setFullDay(true))}>
              +{outside} outside
            </span>
          )}
        </div>

        <div className="tl2-track" style={trackStyle}>
          {ticks.map((t) => (
            <div
              key={t.i}
              className={`tl2-line${t.major ? " major" : ""}`}
              style={{ left: `${(t.i / hours) * 100}%` }}
            />
          ))}

          {nowInWindow && <div className="tl2-now" style={{ left: `${pct(nowMs)}%` }} />}

          {visible.map((b) => {
            const s = new Date(b.startAt).getTime();
            const e = new Date(b.endAt).getTime();
            const cs = Math.max(s, wStart);
            const ce = Math.min(e, wEnd);
            const cutLeft = s < wStart;
            const cutRight = e > wEnd;
            const wide = (ce - cs) / HOUR_MS >= 1.25;
            const text = `${cutLeft ? "‹ " : ""}${wide ? (b.title ?? "Booked") : ""}${
              cutRight ? " ›" : ""
            }`.trim();
            const classes = [
              "tl2-bar",
              b.isMine ? "mine" : "",
              cutLeft ? "cut-left" : "",
              cutRight ? "cut-right" : "",
              selected?.booking.id === b.id ? "sel" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={b.id}
                className={classes}
                title={`${b.title ?? "Booked"} · ${formatOfficeDateTime(b.startAt, tz)} to ${formatOfficeDateTime(b.endAt, tz)}`}
                style={{ left: `${pct(cs)}%`, width: `${pct(ce) - pct(cs)}%` }}
                {...activate(() => setSelected({ booking: b, resource: r.name }))}
              >
                {text}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3>Timeline</h3>

      <div className="tl2-nav">
        <button onClick={() => changeDate(addDays(date, -1))}>‹ Prev</button>
        <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        <button onClick={() => changeDate(addDays(date, 1))}>Next ›</button>
        <button onClick={() => changeDate(officeToday(tz))} disabled={isToday}>
          Today
        </button>
      </div>

      <label className="tl2-toggle">
        <input
          type="checkbox"
          checked={full}
          onChange={(e) => setFullDay(e.target.checked)}
        />
        Show full 24 hours
      </label>

      <p className="hint">
        {full
          ? "Showing the full day."
          : `Showing ${officeHourLabel(new Date(wStart), tz)} to ${officeHourLabel(new Date(wEnd), tz)}.`}{" "}
        <span className="tl-key" style={{ background: "var(--primary)" }} /> yours{" "}
        <span className="tl-key" style={{ background: "#9ca3af" }} /> booked by others
        {nowInWindow && " · dotted line = now"}
      </p>
      <p className="hint tl-swipe">Swipe sideways to see more. Tap a bar for details.</p>

      {message && <p className="error">{message}</p>}
      {loading && <p>Loading...</p>}

      <div className={`tl2${full ? " full" : ""}`} ref={scrollRef}>
        <div className="tl2-inner">
          <div className="tl2-row">
            <div className="tl2-name" />
            <div className="tl2-axis" style={trackStyle}>
              {ticks
                .filter((t) => t.major && t.i < hours)
                .map((t) => (
                  <span
                    key={t.i}
                    className="tl2-label"
                    style={{ left: `${(t.i / hours) * 100}%` }}
                  >
                    {t.label}
                  </span>
                ))}
            </div>
          </div>

          {rows.map(renderRow)}
        </div>
      </div>

      {selected && (
        <div className="tl2-detail">
          <strong>{selected.resource}</strong>:{" "}
          {selected.booking.title ?? "Booked by someone else"}
          {selected.booking.isMine ? " (yours)" : ""}
          <div>
            {formatOfficeDateTime(selected.booking.startAt, tz)} to{" "}
            {formatOfficeDateTime(selected.booking.endAt, tz)}
          </div>
        </div>
      )}
    </div>
  );
}