import { useEffect, useState } from "react";
import { api, saveSession, updateSavedUser, type User } from "./api";
import { showToast } from "./toast";
import { useOfficeTz } from "./officeTimeContext";

type Props = { user: User; onUserChange: (user: User) => void };

function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const rules = [
    [password.length >= 8, "At least 8 characters"],
    [/[A-Z]/.test(password), "One capital letter"],
    [/[^A-Za-z0-9]/.test(password), "One special character (for example ! @ # $)"],
    [confirm.length > 0 && password === confirm, "Passwords match"],
  ] as const;

  return (
    <div className="hint">
      {rules.map(([ok, label]) => (
        <div key={label} className={ok ? "ok" : ""}>
          {ok ? "✓" : "○"} {label}
        </div>
      ))}
    </div>
  );
}

function DetailsCard({ user, onUserChange }: Props) {
  const tz = useOfficeTz();
  const [name, setName] = useState(user.name);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ createdAt: string }>("/account")
      .then((a) => setCreatedAt(a.createdAt))
      .catch(() => {
        /* member-since is optional */
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const updated = await api<User>("/account", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      updateSavedUser(updated);
      onUserChange(updated);
      setName(updated.name);
      showToast("Name updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update name");
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <h3>Your details</h3>
      <dl className="detail-list">
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>
          <span className={`badge badge-${user.role}`}>{user.role}</span>
        </dd>
        <dt>Member since</dt>
        <dd>
          {createdAt
            ? new Date(createdAt).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: tz })
            : "..."}
        </dd>
      </dl>

      <form className="form-grid" onSubmit={save}>
        <label>
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <button type="submit" disabled={busy || name.trim() === user.name || name.trim() === ""}>
          {busy ? "Saving..." : "Save name"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}

function EmailCard() {
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api("/account/email", {
        method: "POST",
        body: JSON.stringify({ newEmail, currentPassword }),
      });
      setNotice(
        `We sent a confirmation link to ${newEmail.trim()}. Your email changes after you click it (valid for 30 minutes). Can't find it? Check your spam folder.`
      );
      setNewEmail("");
      setCurrentPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the email change");
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <h3>Change email</h3>
      <form className="form-grid" onSubmit={submit}>
        <label>
          New email
          <input
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send confirmation link"}
        </button>
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}

function PasswordCard({ onUserChange }: { onUserChange: (user: User) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const strong =
    newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!strong) {
      setError("Password does not meet the rules below the password field");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User; token: string }>("/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // The old token is now invalid everywhere, so keep this device logged in with the new one
      saveSession(result.token, result.user);
      onUserChange(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      showToast("Password updated. Other devices were logged out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    }
    setBusy(false);
  }

  return (
    <section className="card">
      <h3>Change password</h3>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        <PasswordRules password={newPassword} confirm={confirm} />
        <button type="submit" disabled={busy}>
          {busy ? "Updating..." : "Update password"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}

export default function AccountPage({ user, onUserChange }: Props) {
  return (
    <div className="account-page">
      <h3>My account</h3>
      <DetailsCard user={user} onUserChange={onUserChange} />
      <EmailCard />
      <PasswordCard onUserChange={onUserChange} />
    </div>
  );
}