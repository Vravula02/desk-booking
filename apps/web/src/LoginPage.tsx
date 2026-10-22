import { useState } from "react";
import { api, saveSession, type User } from "./api";

type Props = { onLogin: (user: User) => void };

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const body =
        mode === "login" ? { email, password } : { name, email, password };
      const result = await api<{ user: User; token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      saveSession(result.token, result.user);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Workspace Booking</h1>
        <p className="tagline">Reserve meeting rooms and desks in seconds.</p>

        <h2>{mode === "login" ? "Log in to your account" : "Create your account"}</h2>
        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
        </form>

        {error && <p className="error">{error}</p>}

        <button
          className="link-btn"
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}