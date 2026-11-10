import { useEffect, useState } from "react";
import { api } from "./api";

// One request per token, even if React runs the effect twice in development
const attempts = new Map<string, Promise<{ message: string }>>();

function confirmOnce(token: string) {
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = api<{ message: string }>("/account/email/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    attempts.set(token, attempt);
  }
  return attempt;
}

type Props = { token: string; onDone: (success: boolean) => void };

export default function ConfirmEmailPage({ token, onDone }: Props) {
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    confirmOnce(token)
      .then((result) => {
        if (cancelled) return;
        setMessage(result.message);
        setStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "Something went wrong");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Workspace Booking</h1>
        <h2>Confirm your new email</h2>

        {status === "working" && <p className="hint">Confirming...</p>}
        {status === "ok" && <p className="notice">{message}</p>}
        {status === "error" && (
          <p className="error">
            {message}. Links work once and expire after 30 minutes. You can request a new one
            from My account.
          </p>
        )}

        {status !== "working" && (
          <div className="link-row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onDone(status === "ok")}
            >
              {status === "ok" ? "Go to log in" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}