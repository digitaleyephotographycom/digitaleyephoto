"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function GalleryGateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
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
      router.push("/gallery/view");
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
        <input
          id="gate-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
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
      <div style={{ marginTop: 16 }}>
        <Link href="/" className="btn btn-ghost">
          ← Back
        </Link>
      </div>
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
