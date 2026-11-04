import { useEffect, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";
import UserBookingsPanel from "./UserBookingsPanel";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "admin";
  isActive: boolean;
  createdAt: string;
  upcomingBookings: number;
  isProtected: boolean;
};

type ListResponse = { items: UserItem[]; total: number };
type ActionResponse = { user: UserItem; cancelledBookings: number };
type Action = "promote" | "demote" | "deactivate" | "reactivate";
type Pending = { user: UserItem; kind: Exclude<Action, "reactivate"> };

type Props = {
  currentUserId: string;
  onSeeAll: (user: { id: string; name: string }) => void;
};

const confirmText: Record<Pending["kind"], (u: UserItem) => { title: string; body: string }> = {
  promote: (u) => ({
    title: `Give ${u.name} full admin access?`,
    body: "Admins can manage resources, all bookings and other users.",
  }),
  demote: (u) => ({
    title: `Remove admin access from ${u.name}?`,
    body: "They will keep their account and bookings but lose the Admin tab.",
  }),
  deactivate: (u) => ({
    title: `Deactivate ${u.name}?`,
    body:
      u.upcomingBookings > 0
        ? `This cancels their ${u.upcomingBookings} upcoming booking${
            u.upcomingBookings === 1 ? "" : "s"
          } and signs them out.`
        : "They will be signed out and unable to log in.",
  }),
};

const confirmLabel: Record<Pending["kind"], string> = {
  promote: "Make admin",
  demote: "Make employee",
  deactivate: "Deactivate",
};

export default function UsersPage({ currentUserId, onSeeAll }: Props) {
  const [items, setItems] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelVersion, setPanelVersion] = useState(0);

  // Wait 300 ms after the last keystroke before searching
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query) params.set("query", query);
        if (role) params.set("role", role);
        if (status) params.set("status", status);
        const data = await api<ListResponse>(`/users?${params}`);
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : "Could not load users", "error");
        }
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [query, role, status, reloadKey]);

  async function run(user: UserItem, action: Action) {
    setPending(null);
    setBusyId(user.id);
    try {
      let result: ActionResponse;
      if (action === "promote" || action === "demote") {
        result = await api<ActionResponse>(`/users/${user.id}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role: action === "promote" ? "admin" : "employee" }),
        });
      } else {
        result = await api<ActionResponse>(`/users/${user.id}/active`, {
          method: "POST",
          body: JSON.stringify({ isActive: action === "reactivate" }),
        });
      }

      const messages: Record<Action, string> = {
        promote: `${user.name} is now an admin`,
        demote: `${user.name} is now an employee`,
        deactivate: `Deactivated ${user.name}. ${result.cancelledBookings} booking${
          result.cancelledBookings === 1 ? "" : "s"
        } cancelled.`,
        reactivate: `Reactivated ${user.name}`,
      };
      showToast(messages[action]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
    setBusyId(null);
    setReloadKey((k) => k + 1);
    setPanelVersion((v) => v + 1); // an open bookings panel shows the result
  }

  const dialog = pending ? confirmText[pending.kind](pending.user) : null;

  return (
    <div>
      <h3>Admin: users</h3>

      <div className="filters">
        <input
          type="search"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="employee">Employees</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <p className="hint">
        {loading
          ? "Loading users..."
          : `Showing ${items.length} of ${total} user${total === 1 ? "" : "s"}`}
      </p>

      {!loading && items.length === 0 && <p>No users match your filters.</p>}

      <ul>
        {items.map((u) => {
          const isMe = u.id === currentUserId;
          const busy = busyId === u.id;
          const open = openId === u.id;
          return (
            <li key={u.id} className="row">
              <div className="row-main">
                <strong>{u.name}</strong>
                <div className="meta">{u.email}</div>
                <div className="meta">
                  {u.upcomingBookings === 0
                    ? "No upcoming bookings"
                    : `${u.upcomingBookings} upcoming booking${u.upcomingBookings === 1 ? "" : "s"}`}
                </div>
              </div>

              <div className="row-actions user-actions">
                <div className="user-badges">
                  <span className={`badge badge-${u.role}`}>{u.role}</span>
                  <span className={`badge ${u.isActive ? "badge-confirmed" : "badge-cancelled"}`}>
                    {u.isActive ? "active" : "inactive"}
                  </span>
                </div>

                <div className="user-buttons">
                  <button
                    aria-expanded={open}
                    aria-controls={`panel-${u.id}`}
                    aria-label={`${open ? "Hide" : "View"} bookings for ${u.name}`}
                    onClick={() => setOpenId(open ? null : u.id)}
                  >
                    {open ? "Hide bookings" : "View bookings"}
                  </button>

                  {isMe ? (
                    <span className="meta">This is you</span>
                  ) : u.isProtected ? (
                    <span className="meta">Protected demo account</span>
                  ) : (
                    <>
                      <button
                        disabled={busy}
                        aria-label={`${u.role === "admin" ? "Make employee" : "Make admin"}: ${u.name}`}
                        onClick={() =>
                          setPending({ user: u, kind: u.role === "admin" ? "demote" : "promote" })
                        }
                      >
                        {busy ? "Working..." : u.role === "admin" ? "Make employee" : "Make admin"}
                      </button>

                      {u.isActive ? (
                        <button
                          className="btn-danger"
                          disabled={busy}
                          aria-label={`Deactivate ${u.name}`}
                          onClick={() => setPending({ user: u, kind: "deactivate" })}
                        >
                          {busy ? "Working..." : "Deactivate"}
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          aria-label={`Reactivate ${u.name}`}
                          onClick={() => run(u, "reactivate")}
                        >
                          {busy ? "Working..." : "Reactivate"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {open && (
                <UserBookingsPanel
                  user={{ id: u.id, name: u.name }}
                  version={panelVersion}
                  onChanged={() => setReloadKey((k) => k + 1)}
                  onSeeAll={() => onSeeAll({ id: u.id, name: u.name })}
                />
              )}
            </li>
          );
        })}
      </ul>

      {pending && dialog && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{dialog.title}</h3>
            <p>{dialog.body}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPending(null)}>Cancel</button>
              <button
                className={pending.kind === "deactivate" ? "btn-danger" : ""}
                onClick={() => run(pending.user, pending.kind)}
              >
                {confirmLabel[pending.kind]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}