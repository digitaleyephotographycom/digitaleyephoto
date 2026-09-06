"use client";

import { useState } from "react";
import Link from "next/link";

export default function StudioLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError("Please enter your admin email and password.");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid admin credentials.");
        return;
      }
      window.location.href = "/studio";
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="gate-logo">D</div>
        <h2>Studio Login</h2>
        <p>Enter your photographer credentials to manage your client galleries.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="admin-email">Email or Username</label>
            <input
              id="admin-email"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. digital@com"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="admin-pass">Password</label>
            <input
              id="admin-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              disabled={busy}
            />
          </div>
          <div className="gate-error">{error}</div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={busy}
          >
            {busy ? "Signing in…" : "Sign in to Studio"}
          </button>
        </form>
        <div style={{ marginTop: 16 }}>
          <Link href="/" className="btn btn-ghost">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
