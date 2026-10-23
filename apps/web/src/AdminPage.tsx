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

export default function AdminPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("room");
  const [capacity, setCapacity] = useState("4");

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

  return (
    <div>
      <h3>Admin: resources</h3>
      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="room">Room</option>
          <option value="desk">Desk</option>
        </select>
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          style={{ width: 70 }}
        />
        <button type="submit" disabled={adding}>
          {adding ? "Adding..." : "Add"}
        </button>
      </form>

      {loading && <p>Loading resources...</p>}

      <ul>
        {resources.map((r) => (
          <li key={r.id}>
            {r.name} ({r.type}, capacity {r.capacity}) {r.isActive ? "" : "[inactive]"}{" "}
            <button disabled={busyId === r.id} onClick={() => handleEdit(r)}>
              Edit capacity
            </button>{" "}
            <button
              className={r.isActive ? "btn-danger" : ""}
              disabled={busyId === r.id}
              onClick={() => handleToggle(r)}
            >
              {r.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}