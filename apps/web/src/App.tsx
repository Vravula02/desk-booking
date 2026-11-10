import { useEffect, useRef, useState } from "react";
import {
  api,
  clearSession,
  getSavedUser,
  getToken,
  onSessionExpired,
  tokenExpiryMs,
  updateSavedUser,
  type User,
} from "./api";
import LoginPage from "./LoginPage";
import SearchPage from "./SearchPage";
import TimelinePage from "./TimelinePage";
import MyBookingsPage from "./MyBookingsPage";
import AdminSection from "./AdminSection";
import AccountPage from "./AccountPage";
import AccountMenu from "./AccountMenu";
import ConfirmEmailPage from "./ConfirmEmailPage";
import { clearConfirmFromUrl, getConfirmToken } from "./confirmEmailUrl";
import ToastHost from "./ToastHost";
import OfficeTimeProvider from "./OfficeTimeProvider";
import { useOfficeTz } from "./officeTimeContext";
import { useHashRoute, type Route } from "./useHashRoute";
import { tzLabel } from "./time";

const IDLE_MINUTES = 30;
const CHECK_MS = 30_000;

function AppInner() {
  const [user, setUser] = useState<User | null>(getSavedUser());
  const [route, navigate] = useHashRoute();
  const [sessionMessage, setSessionMessage] = useState("");
  const [confirmToken, setConfirmToken] = useState<string | null>(getConfirmToken());
  const lastActivity = useRef(0);
  const tz = useOfficeTz();
  const userId = user?.id ?? null;
  const isAdmin = user?.role === "admin";

  // Log out on token expiry, a rejected session, or inactivity.
  // The page stays in the URL, so logging back in returns you to it.
  useEffect(() => {
    if (!userId) return;

    function endSession(reason: string) {
      clearSession();
      setUser(null);
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
  }, [userId]);

  // Keep the saved name and role in step with the server, so a promotion or
  // demotion shows up without logging in again
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function refresh() {
      try {
        const me = await api<User>("/auth/me");
        if (cancelled) return;
        updateSavedUser(me);
        setUser((prev) =>
          prev && (prev.role !== me.role || prev.name !== me.name || prev.email !== me.email)
            ? me
            : prev
        );
      } catch {
        // Other requests handle an invalid session
      }
    }

    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  // Non-admins who open #/admin (or lose the role) go back to search
  useEffect(() => {
    if (userId && route === "admin" && !isAdmin) navigate("search", true);
  }, [userId, route, isAdmin, navigate]);

  if (confirmToken) {
    return (
      <ConfirmEmailPage
        token={confirmToken}
        onDone={(success) => {
          clearConfirmFromUrl();
          if (success) {
            // The email change signs every session out, so clear this one too
            clearSession();
            setUser(null);
            setSessionMessage("");
          }
          setConfirmToken(null);
        }}
      />
    );
  }

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

  function tabButton(id: Route, label: string) {
    return (
      <button
        className={route === id ? "tab active" : "tab"}
        onClick={() => navigate(id)}
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
        <AccountMenu
          user={user}
          onAccount={() => navigate("account")}
          onLogout={() => {
            clearSession();
            setUser(null);
            navigate("search", true);
            setSessionMessage("");
          }}
        />
      </header>

      <nav className="tabs">
        {tabButton("search", "Search and book")}
        {tabButton("timeline", "Timeline")}
        {tabButton("mine", "My bookings")}
        {isAdmin && tabButton("admin", "Admin")}
      </nav>

      <p className="hint" style={{ margin: "0 0 12px" }}>
        All times are in {tzLabel(tz)}.
      </p>

      {route === "search" && <SearchPage />}
      {route === "timeline" && <TimelinePage />}
      {route === "mine" && <MyBookingsPage />}
      {route === "admin" && isAdmin && <AdminSection currentUserId={user.id} />}
      {route === "account" && <AccountPage user={user} onUserChange={setUser} />}
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