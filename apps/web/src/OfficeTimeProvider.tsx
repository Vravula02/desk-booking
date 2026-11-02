import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { OfficeTimeContext } from "./officeTimeContext";

const FALLBACK = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function OfficeTimeProvider({ children }: { children: ReactNode }) {
  const [tz, setTz] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ timezone: string }>("/config")
      .then((c) => {
        if (!cancelled) setTz(c.timezone);
      })
      .catch(() => {
        if (!cancelled) setTz(FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!tz) return <p style={{ padding: 24 }}>Connecting...</p>;

  return <OfficeTimeContext.Provider value={tz}>{children}</OfficeTimeContext.Provider>;
}