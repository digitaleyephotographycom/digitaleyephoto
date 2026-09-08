"use client";

import { useState } from "react";
import Link from "next/link";

export default function StudioLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setError("Unable to sign in. Please try again.");
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
            <div className="password-wrap">
              <input
                id="admin-pass"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                disabled={busy}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
