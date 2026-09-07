"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function GalleryGateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    router.prefetch("/gallery/view");
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setCode(codeParam.toUpperCase());
    }
  }, [searchParams, router]);

  async function handleSubmit() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/gallery-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      sessionStorage.setItem("gallery_token", data.token);
      sessionStorage.setItem("gallery_data", JSON.stringify(data.gallery));
      sessionStorage.setItem("gallery_loaded_at", String(Date.now()));
      window.location.href = "/gallery/view";
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-card">
      <div className="gate-logo">D</div>
      <h2>View your gallery</h2>
      <p>Enter the gallery code and password your photographer shared with you.</p>
      <div className="field">
        <label htmlFor="gate-code">Gallery code</label>
        <input
          id="gate-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. PA-4471"
        />
      </div>
      <div className="field">
        <label htmlFor="gate-pass">Password</label>
        <div className="password-wrap">
          <input
            id="gate-pass"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
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
        className="btn btn-primary"
        style={{ width: "100%" }}
        disabled={busy}
        onClick={handleSubmit}
      >
        {busy ? "Checking…" : "View gallery"}
      </button>
    </div>
  );
}

export default function GalleryGate() {
  return (
    <div className="gate-wrap">
      <Suspense fallback={<div className="gate-card"><div className="empty">Loading…</div></div>}>
        <GalleryGateForm />
      </Suspense>
    </div>
  );
}
