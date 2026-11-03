import { useEffect, useState } from "react";
import { api, saveSession, type User } from "./api";

type Props = { onLogin: (user: User) => void; sessionMessage?: string };
type Mode = "login" | "register" | "forgot" | "reset";
type TokenStatus = "checking" | "valid" | "invalid" | "error" | null;

const COOLDOWN_KEY = "forgot-cooldowns";
const FALLBACK_COOLDOWN_SECONDS = 120; // only used if the server omits retryAfterSeconds

function readCooldowns(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "{}") as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

function writeCooldowns(map: Record<string, number>) {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch {
    /* storage may be unavailable */
  }
}

function formatWait(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function getResetToken() {
  return new URLSearchParams(window.location.search).get("reset");
}

function clearResetFromUrl() {
  window.history.replaceState({}, "", window.location.pathname);
}

export default function LoginPage({ onLogin, sessionMessage }: Props) {
  const [resetToken, setResetToken] = useState<string | null>(getResetToken());
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>(
    getResetToken() ? "checking" : null
  );
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldowns, setCooldowns] = useState(readCooldowns);
  const [now, setNow] = useState(() => Date.now());

  const emailKey = email.trim().toLowerCase();
  const cooldownUntil = cooldowns[emailKey] ?? 0;
  const remaining = cooldownUntil - now;
  const waiting = remaining > 0;

  useEffect(() => {
    if (!resetToken) return;
    let cancelled = false;

    async function check() {
      try {
        const result = await api<{ valid: boolean }>("/auth/reset/check", {
          method: "POST",
          body: JSON.stringify({ token: resetToken }),
        });
        if (!cancelled) setTokenStatus(result.valid ? "valid" : "invalid");
      } catch {
        if (!cancelled) setTokenStatus("error");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [resetToken]);

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const needsRules = mode === "register" || mode === "reset";
  const showForm = mode !== "reset" || tokenStatus === "valid";

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: confirm.length > 0 && password === confirm,
  };
  const passwordOk = rules.length && rules.upper && rules.special;

  function switchMode(next: Mode) {
    if (resetToken && next !== "reset") {
      clearResetFromUrl();
      setResetToken(null);
      setTokenStatus(null);
    }
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
    setNow(Date.now());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (needsRules) {
      if (!passwordOk) {
        setError("Password does not meet the rules below the password field");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match");
        return;
      }
    }

    if (mode === "forgot" && waiting) return;

    setBusy(true);
    try {
      if (mode === "login" || mode === "register") {
        const body =
          mode === "login" ? { email, password } : { name, email, password };
        const result = await api<{ user: User; token: string }>(`/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        saveSession(result.token, result.user);
        onLogin(result.user);
        return;
      }

      if (mode === "forgot") {
        const result = await api<{ message: string; retryAfterSeconds?: number }>(
          "/auth/forgot",
          { method: "POST", body: JSON.stringify({ email }) }
        );
        const seconds = result.retryAfterSeconds ?? FALLBACK_COOLDOWN_SECONDS;
        const next = { ...readCooldowns(), [emailKey]: Date.now() + seconds * 1000 };
        writeCooldowns(next);
        setCooldowns(next);
        setNow(Date.now());
        setNotice(`${result.message} Can't find it? Check your spam folder.`);
        return;
      }

      await api("/auth/reset", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      clearResetFromUrl();
      setResetToken(null);
      setTokenStatus(null);
      setPassword("");
      setConfirm("");
      setMode("login");
      setNotice("Password updated. Please log in with your new password.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (mode === "reset" && message.includes("invalid or has expired")) {
        setTokenStatus("invalid");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: "Log in to your account",
    register: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  };

  const buttonLabels: Record<Mode, string> = {
    login: "Log in",
    register: "Register",
    forgot: "Send reset link",
    reset: "Update password",
  };

  const submitLabel = busy
    ? "Please wait..."
    : mode === "forgot" && waiting
      ? `Resend available in ${formatWait(remaining)}`
      : buttonLabels[mode];

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Workspace Booking</h1>
        <p className="tagline">Reserve meeting rooms and desks in seconds.</p>

        <h2>{titles[mode]}</h2>

        {mode === "reset" && tokenStatus === "checking" && (
          <p className="hint">Checking your reset link...</p>
        )}

        {mode === "reset" && tokenStatus === "invalid" && (
          <p className="error">
            This reset link is invalid or has expired. Each link works once, and requesting a
            new link cancels the previous one.
          </p>
        )}

        {mode === "reset" && tokenStatus === "error" && (
          <p className="error">
            Could not check the reset link. Check your connection and refresh the page.
          </p>
        )}

        {mode === "forgot" && (
          <p className="hint">
            Enter your email and we will send you a link to reset your password.
          </p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <input
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}

            {mode !== "reset" && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setNow(Date.now());
                }}
                required
              />
            )}

            {mode !== "forgot" && (
              <input
                type="password"
                placeholder={mode === "reset" ? "New password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}

            {needsRules && (
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            )}

            {needsRules && (
              <div className="hint">
                <div className={rules.length ? "ok" : ""}>
                  {rules.length ? "✓" : "○"} At least 8 characters
                </div>
                <div className={rules.upper ? "ok" : ""}>
                  {rules.upper ? "✓" : "○"} One capital letter
                </div>
                <div className={rules.special ? "ok" : ""}>
                  {rules.special ? "✓" : "○"} One special character (for example ! @ # $)
                </div>
                <div className={rules.match ? "ok" : ""}>
                  {rules.match ? "✓" : "○"} Passwords match
                </div>
              </div>
            )}

            <button type="submit" disabled={busy || (mode === "forgot" && waiting)}>
              {submitLabel}
            </button>
          </form>
        )}

        {sessionMessage && mode === "login" && !notice && (
          <p className="warn">{sessionMessage}</p>
        )}
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <div className="link-row">
          {mode === "login" && (
            <>
              <button className="link-btn" onClick={() => switchMode("forgot")}>
                Forgot password?
              </button>
              <button className="link-btn" onClick={() => switchMode("register")}>
                Need an account? Register
              </button>
            </>
          )}
          {mode === "register" && (
            <button className="link-btn" onClick={() => switchMode("login")}>
              Have an account? Log in
            </button>
          )}
          {mode === "forgot" && (
            <button className="link-btn" onClick={() => switchMode("login")}>
              Back to log in
            </button>
          )}
          {mode === "reset" && (
            <>
              <button className="link-btn" onClick={() => switchMode("forgot")}>
                Request a new link
              </button>
              <button className="link-btn" onClick={() => switchMode("login")}>
                Back to log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}