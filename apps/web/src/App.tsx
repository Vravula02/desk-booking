import { useState } from "react";
import { clearSession, getSavedUser, type User } from "./api";
import LoginPage from "./LoginPage";
import SearchPage from "./SearchPage";
import MyBookingsPage from "./MyBookingsPage";
import AdminPage from "./AdminPage";
import AdminBookings from "./AdminBookings";

type Tab = "search" | "mine" | "admin";

export default function App() {
  const [user, setUser] = useState<User | null>(getSavedUser());
  const [tab, setTab] = useState<Tab>("search");

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  function tabButton(id: Tab, label: string) {
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          padding: "6px 12px",
          border: "none",
          borderBottom: tab === id ? "3px solid #2563eb" : "3px solid transparent",
          background: "none",
          fontWeight: tab === id ? "bold" : "normal",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <strong>WorkSpace Booking</strong>
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

      <nav style={{ margin: "16px 0", borderBottom: "1px solid #ddd" }}>
        {tabButton("search", "Search and book")}
        {tabButton("mine", "My bookings")}
        {user.role === "admin" && tabButton("admin", "Admin")}
      </nav>

      {tab === "search" && <SearchPage />}
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