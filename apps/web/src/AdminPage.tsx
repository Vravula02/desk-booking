import { useEffect, useState } from "react";
import { api } from "./api";

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
  const [name, setName] = useState("");
  const [type, setType] = useState("room");
  const [capacity, setCapacity] = useState("4");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      setResources(await api<Resource[]>("/resources?includeInactive=true"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load resources");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      await api("/resources", {
        method: "POST",
        body: JSON.stringify({ name, type, capacity: Number(capacity) }),
      });
      setName("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function handleToggle(r: Resource) {
    setMessage("");
    try {
      const result = await api<{ cancelledBookings: number }>(`/resources/${r.id}/active`, {
        method: "POST",
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      if (r.isActive) {
        setMessage(`Deactivated. ${result.cancelledBookings} future booking(s) cancelled.`);
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    }
  }

async function handleEdit(r: Resource) {
    const input = window.prompt(`New capacity for ${r.name}:`, String(r.capacity));
    if (input === null) return; // user pressed Cancel

    const newCapacity = Number(input);
    if (!Number.isInteger(newCapacity) || newCapacity < 1) {
      setMessage("Capacity must be a whole number, at least 1");
      return;
    }

    setMessage("");
    try {
      await api(`/resources/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ capacity: newCapacity }),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    }
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
        <button type="submit">Add</button>
      </form>

      {message && <p>{message}</p>}

      <ul>
        {resources.map((r) => (
          <li key={r.id}>
            {r.name} ({r.type}, capacity {r.capacity}) {r.isActive ? "" : "[inactive]"}{" "}
            <button onClick={() => handleEdit(r)}>Edit capacity</button>{" "}
            <button onClick={() => handleToggle(r)}>
              {r.isActive ? "Deactivate" : "Reactivate"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}