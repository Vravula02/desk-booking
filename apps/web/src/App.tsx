import { useEffect, useRef, useState } from "react";
import {
  clearSession,
  getSavedUser,
  getToken,
  onSessionExpired,
  tokenExpiryMs,
  type User,
} from "./api";
import LoginPage from "./LoginPage";
import SearchPage from "./SearchPage";
import TimelinePage from "./TimelinePage";
import MyBookingsPage from "./MyBookingsPage";
import AdminPage from "./AdminPage";
import AdminBookings from "./AdminBookings";
import ToastHost from "./ToastHost";
import OfficeTimeProvider from "./OfficeTimeProvider";
import { useOfficeTz } from "./officeTimeContext";
import { tzLabel } from "./time";

type Tab = "search" | "timeline" | "mine" | "admin";

const IDLE_MINUTES = 30;
const CHECK_MS = 30_000;

function AppInner() {
  const [user, setUser] = useState<User | null>(getSavedUser());
  const [tab, setTab] = useState<Tab>("search");
  const [sessionMessage, setSessionMessage] = useState("");
  const lastActivity = useRef(0);
  const tz = useOfficeTz();

  useEffect(() => {
    if (!user) return;

    function endSession(reason: string) {
      clearSession();
      setUser(null);
      setTab("search");
      setSessionMessage(reason);
    }

    lastActivity.current = Date.now();
    const markActive = () => {
      lastActivity.current = Date.now();
    };
    const activityEvents = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    activityEvents.forEach((name) =>
      window.addEventListener(name, markActive, { passive: true })
    );

    function check() {
      const exp = tokenExpiryMs();
      if (!getToken() || (exp !== null && exp <= Date.now())) {
        endSession("Your session expired. Please log in again.");
      } else if (Date.now() - lastActivity.current > IDLE_MINUTES * 60_000) {
        endSession(`You were logged out after ${IDLE_MINUTES} minutes of inactivity.`);
      }
    }

    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    const stopListening = onSessionExpired(endSession);

    // Logging out in another tab logs this one out too
    const onStorage = (e: StorageEvent) => {
      if (e.key === "token" && !e.newValue) {
        setUser(null);
        setTab("search");
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", onStorage);
      activityEvents.forEach((name) => window.removeEventListener(name, markActive));
      stopListening();
    };
  }, [user]);

  if (!user) {
    return (
      <LoginPage
        sessionMessage={sessionMessage}
        onLogin={(u) => {
          setSessionMessage("");
          setUser(u);
        }}
      />
    );
  }

  function tabButton(id: Tab, label: string) {
    return (
      <button
        className={tab === id ? "tab active" : "tab"}
        onClick={() => setTab(id)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="app-shell">
      <ToastHost />
      <header className="app-header">
        <strong className="brand">Workspace Booking</strong>
        <span>
          {user.name} ({user.role}){" "}
          <button
            onClick={() => {
              clearSession();
              setUser(null);
              setTab("search");
              setSessionMessage("");
            }}
          >
            Log out
          </button>
        </span>
      </header>

      <nav className="tabs">
        {tabButton("search", "Search and book")}
        {tabButton("timeline", "Timeline")}
        {tabButton("mine", "My bookings")}
        {user.role === "admin" && tabButton("admin", "Admin")}
      </nav>

      <p className="hint" style={{ margin: "0 0 12px" }}>
        All times are in {tzLabel(tz)}.
      </p>

      {tab === "search" && <SearchPage />}
      {tab === "timeline" && <TimelinePage />}
      {tab === "mine" && <MyBookingsPage />}
      {tab === "admin" && user.role === "admin" && (
        <>
          <AdminPage />
          <AdminBookings />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <OfficeTimeProvider>
      <AppInner />
    </OfficeTimeProvider>
  );
}