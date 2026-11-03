const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "admin";
};

const SESSION_EVENT = "session-expired";

export function getToken() {
  return localStorage.getItem("token");
}

// When the saved token stops being valid, in ms since 1970 (null if it can't be read)
export function tokenExpiryMs(token: string | null = getToken()): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: User) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getSavedUser(): User | null {
  const raw = localStorage.getItem("user");
  if (!raw || !getToken()) return null;

  const exp = tokenExpiryMs();
  if (exp !== null && exp <= Date.now()) {
    clearSession();
    return null;
  }
  return JSON.parse(raw) as User;
}

export function onSessionExpired(handler: (reason: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(SESSION_EVENT, listener);
  return () => window.removeEventListener(SESSION_EVENT, listener);
}

function expireSession(reason: string) {
  clearSession();
  window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: reason }));
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const code = data?.error?.code;
    // A wrong password on the login form is a 401 too, so only treat it as an
    // expired session when we were logged in and the call wasn't an /auth/ one.
    if (
      token &&
      !path.startsWith("/auth/") &&
      (res.status === 401 || code === "ACCOUNT_DEACTIVATED")
    ) {
      expireSession(
        code === "ACCOUNT_DEACTIVATED"
          ? "This account has been deactivated."
          : "Your session expired. Please log in again."
      );
    }
    throw new Error(data?.error?.message || "Something went wrong");
  }
  return data as T;
}