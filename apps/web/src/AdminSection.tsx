import { useState } from "react";
import AdminPage from "./AdminPage";
import AdminBookings from "./AdminBookings";
import UsersPage from "./UsersPage";

type View = "resources" | "bookings" | "users";

export default function AdminSection({ currentUserId }: { currentUserId: string }) {
  const [view, setView] = useState<View>("resources");
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(null);

  function pill(id: View, label: string) {
    return (
      <button className={view === id ? "pill active" : "pill"} onClick={() => setView(id)}>
        {label}
      </button>
    );
  }

  return (
    <div>
      <div className="subtabs">
        {pill("resources", "Resources")}
        {pill("bookings", "Bookings")}
        {pill("users", "Users")}
      </div>

      {view === "resources" && <AdminPage />}
      {view === "bookings" && (
        <AdminBookings userFilter={userFilter} onClearUser={() => setUserFilter(null)} />
      )}
      {view === "users" && (
        <UsersPage
          currentUserId={currentUserId}
          onSeeAll={(u) => {
            setUserFilter(u);
            setView("bookings");
          }}
        />
      )}
    </div>
  );
}