import { useEffect, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";

type Resource = {
  id: string;
  name: string;
  type: "room" | "desk";
  floor: string | null;
  capacity: number;
  isActive: boolean;
};

type SortKey =
  | "name-asc"
  | "name-desc"
  | "type"
  | "capacity-desc"
  | "capacity-asc"
  | "status";

// Numbers inside names sort naturally, so "Desk 2" comes before "Desk 10"
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byName = (a: Resource, b: Resource) => collator.compare(a.name, b.name);

// Every sort ends with the name, so equal items never shuffle
const sorters: Record<SortKey, (a: Resource, b: Resource) => number> = {
  "name-asc": byName,
  "name-desc": (a, b) => byName(b, a),
  type: (a, b) => (a.type === b.type ? 0 : a.type === "room" ? -1 : 1) || byName(a, b),
  "capacity-desc": (a, b) => b.capacity - a.capacity || byName(a, b),
  "capacity-asc": (a, b) => a.capacity - b.capacity || byName(a, b),
  status: (a, b) => Number(b.isActive) - Number(a.isActive) || byName(a, b),
};

export default function AdminPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("room");
  const [capacity, setCapacity] = useState("4");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    try {
      setResources(await api<Resource[]>("/resources?includeInactive=true"));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load resources", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await api("/resources", {
        method: "POST",
        body: JSON.stringify({ name, type, capacity: Number(capacity) }),
      });
      showToast(`Added ${name}`);
      setName("");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed", "error");
    }
    setAdding(false);
  }

  async function handleToggle(r: Resource) {
    setBusyId(r.id);
    try {
      const result = await api<{ cancelledBookings: number }>(`/resources/${r.id}/active`, {
        method: "POST",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      showToast(
        r.isActive
          ? `Deactivated ${r.name}. ${result.cancelledBookings} future booking(s) cancelled.`
          : `Reactivated ${r.name}`
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
    setBusyId(null);
  }

  async function handleEdit(r: Resource) {
    const input = window.prompt(`New capacity for ${r.name}:`, String(r.capacity));
    if (input === null) return;

    const newCapacity = Number(input);
    if (!Number.isInteger(newCapacity) || newCapacity < 1) {
      showToast("Capacity must be a whole number, at least 1", "error");
      return;
    }

    setBusyId(r.id);
    try {
      await api(`/resources/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capacity: newCapacity }),
      });
      showToast(`${r.name} capacity set to ${newCapacity}`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
    setBusyId(null);
  }

  const visible = resources
    .filter((r) => !typeFilter || r.type === typeFilter)
    .filter(
      (r) =>
        !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive)
    )
    .sort(sorters[sort]);

  return (
    <div>
      <h3>Admin: resources</h3>

      <form onSubmit={handleCreate} className="form-row">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New resource name"
          required
        />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="New resource type">
          <option value="room">Room</option>
          <option value="desk">Desk</option>
        </select>
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          aria-label="New resource capacity"
          style={{ width: 70 }}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      <div className="filters">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort resources"
        >
          <option value="name-asc">Name A to Z</option>
          <option value="name-desc">Name Z to A</option>
          <option value="type">Type (rooms first)</option>
          <option value="capacity-desc">Capacity, largest first</option>
          <option value="capacity-asc">Capacity, smallest first</option>
          <option value="status">Status (active first)</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="room">Rooms</option>
          <option value="desk">Desks</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <p className="hint">
        {loading
          ? "Loading resources..."
          : `Showing ${visible.length} of ${resources.length} resource${resources.length === 1 ? "" : "s"}`}
      </p>

      {!loading && visible.length === 0 && <p>No resources match your filters.</p>}

      <ul>
        {visible.map((r) => (
          <li key={r.id} className="row">
            <div className="row-main">
              <strong>{r.name}</strong> ({r.type}, capacity {r.capacity}){" "}
              {!r.isActive && <span className="badge badge-cancelled">inactive</span>}
            </div>
            <div className="row-actions">
              <button
                disabled={busyId === r.id}
                aria-label={`Edit capacity of ${r.name}`}
                onClick={() => handleEdit(r)}
              >
                Edit capacity
              </button>
              <button
                className={r.isActive ? "btn-danger" : ""}
                disabled={busyId === r.id}
                aria-label={`${r.isActive ? "Deactivate" : "Reactivate"} ${r.name}`}
                onClick={() => handleToggle(r)}
              >
                {r.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}