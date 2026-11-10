import { useEffect, useRef, useState } from "react";
import type { User } from "./api";

type Props = {
  user: User;
  onAccount: () => void;
  onLogout: () => void;
};

export default function AccountMenu({ user, onAccount, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click/tap or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="user-name">{user.name}</span>
        <span className={`badge badge-${user.role}`}>{user.role}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-email">{user.email}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAccount();
            }}
          >
            My account
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}