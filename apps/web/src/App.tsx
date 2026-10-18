import { useState } from "react";
import { clearSession, getSavedUser, type User } from "./api";
import LoginPage from "./LoginPage";
export default function App() {
  const [user, setUser] = useState<User | null>(getSavedUser());

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24 }}>
      <p>
        Logged in as {user.name} ({user.role})
      </p>
      <button
        onClick={() => {
          clearSession();
          setUser(null);
        }}
      >
        Log out
      </button>
    </div>
  );
}