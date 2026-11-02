import { useState } from "react";
import { clearSession, getSavedUser, type User } from "./api";
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

function AppInner() {
  const [user, setUser] = useState<User | null>(getSavedUser());
  const [tab, setTab] = useState<Tab>("search");
  const tz = useOfficeTz();

  if (!user) {
    return <LoginPage onLogin={setUser} />;
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