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
    <div style={{ maxWidth: 320, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8 }}>
        {mode === "register" && (
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </p>
    </div>
  );
}