"use client";

import { useEffect, useState, useRef, useCallback, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SELECTION_SUBMITTED: "Selection Submitted",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const BATCH_SIZE = 24;

const AdminPhotoTile = memo(function AdminPhotoTile({ photo, isSelected }) {
  const imageUrl = photo.thumbUrl || photo.url;
  return (
    <div className="photo-tile">
      <img src={imageUrl} alt={photo.name} loading="lazy" decoding="async" />
      {isSelected && <div className="sel-chip">SELECTED</div>}
    </div>
  );
});

export default function GalleryDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [gallery, setGallery] = useState(null);
  const [tab, setTab] = useState("all"); // "all" | "selected" | "unselected"
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [zipping, setZipping] = useState(false);
  const [toast, setToast] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [copiedNames, setCopiedNames] = useState(false);

  const toastTimerRef = useRef(null);
  const sentinelRef = useRef(null);

  async function copyText(text, successMsg) {
    if (!text) return;
    let ok = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        textarea.style.opacity = "0";
        textarea.style.whiteSpace = "pre";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        ok = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      showToast(successMsg);
    } else {
      showToast("Unable to copy. Please copy manually.");
    }
  }

  async function handleSavePassword(e) {
    if (e) e.preventDefault();
    if (!newPassword.trim()) {
      showToast("Please enter a new password.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/admin/galleries/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Could not update password.");
        return;
      }
      setGallery((prev) => ({
        ...prev,
        clientPassword: data.password,
      }));
      setShowPasswordModal(false);
      setNewPassword("");
      showToast("Gallery password successfully updated.");
    } catch {
      showToast("Unable to update password. Please try again.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function load() {
    setLoadError(false);
    try {
      const res = await fetch(`/api/galleries/${id}`);
      if (res.status === 401) {
        window.location.href = "/studio/login";
        return;
      }
      if (res.ok) {
        setGallery(await res.json());
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/studio/login";
  }

  useEffect(() => {
    load();
  }, [id]);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function updateGallery(patch) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/galleries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not update gallery.");
        return;
      }
      const updated = await res.json();
      setGallery((prev) => ({ ...prev, ...updated }));
      if (patch.status) showToast(`Gallery status changed to ${STATUS_LABELS[patch.status] || patch.status}`);
      if (patch.selectionLocked !== undefined) {
        showToast(patch.selectionLocked ? "Selections locked for client" : "Selections unlocked for client");
      }
    } catch {
      showToast("Unable to save changes. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleCopyLink() {
    if (!gallery) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = `${origin}/gallery?code=${gallery.code}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement("input");
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      showToast("Gallery link copied to clipboard");
    } catch {
      showToast("Please copy this link manually: " + shareUrl);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/galleries/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/studio");
      } else {
        showToast("Could not delete gallery.");
      }
    } catch {
      showToast("Failed to delete gallery.");
    }
  }

  async function handleCopySelectedNames() {
    if (!gallery) return;

    // 1. Gather all photos in this gallery
    const allPhotos = Array.isArray(gallery.photos) ? gallery.photos : [];

    // Helper to resolve the best source filename or identifier
    const resolvePhotoFilename = (p, fallback) => {
      if (p) {
        if (p.sourceName && typeof p.sourceName === "string" && p.sourceName.trim()) {
          const s = p.sourceName.trim();
          if (s !== "photo.jpg") return s;
        }
        if (p.name && typeof p.name === "string" && p.name.trim()) {
          const n = p.name.trim();
          if (n !== "photo.jpg") return n;
        }
        if (p.key && typeof p.key === "string") {
          const keyFile = p.key.split("/").pop() || "";
          const dashIdx = keyFile.indexOf("-");
          if (dashIdx > 0 && dashIdx < 20) {
            const clean = keyFile.slice(dashIdx + 1).trim();
            if (clean) return clean;
          }
          if (keyFile.trim()) return keyFile.trim();
        }
        if (p.id != null) return String(p.id).trim();
      }
      if (fallback != null && typeof fallback === "string" && fallback.trim()) {
        return fallback.trim();
      }
      return "";
    };

    // Fast multi-attribute lookups
    const photoById = new Map();
    const photoByName = new Map();
    for (const p of allPhotos) {
      if (!p) continue;
      if (p.id != null) {
        photoById.set(String(p.id).trim(), p);
      }
      if (p.sourceName && typeof p.sourceName === "string") {
        photoByName.set(p.sourceName.trim().toLowerCase(), p);
      }
      if (p.name && typeof p.name === "string") {
        photoByName.set(p.name.trim().toLowerCase(), p);
      }
      if (p.key && typeof p.key === "string") {
        const keyFile = p.key.split("/").pop() || "";
        if (keyFile) {
          photoByName.set(keyFile.toLowerCase(), p);
          const dashIdx = keyFile.indexOf("-");
          if (dashIdx > 0 && dashIdx < 20) {
            photoByName.set(keyFile.slice(dashIdx + 1).toLowerCase(), p);
          }
        }
      }
    }

    // Determine the ordered selection list (preserving client's selection sequence)
    let selectionOrder = [];
    if (Array.isArray(gallery.selections) && gallery.selections.length > 0) {
      selectionOrder = gallery.selections;
    } else if (Array.isArray(gallery.submittedSelections) && gallery.submittedSelections.length > 0) {
      selectionOrder = gallery.submittedSelections;
    } else if (typeof gallery.selections === "string" && gallery.selections.trim()) {
      try {
        const parsed = JSON.parse(gallery.selections);
        if (Array.isArray(parsed)) selectionOrder = parsed;
      } catch {
        selectionOrder = gallery.selections.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    const collectedNames = [];
    const collectedIds = new Set();

    // 1. Process items in their exact client selection order
    for (const item of selectionOrder) {
      if (!item) continue;
      const itemId = typeof item === "object"
        ? String(item.id || item.photoId || item.sourceName || item.name || "").trim()
        : String(item).trim();

      if (!itemId) continue;

      const matched =
        photoById.get(itemId) ||
        photoByName.get(itemId.toLowerCase()) ||
        (typeof item === "object" && item.id ? photoById.get(String(item.id).trim()) : null);

      if (matched) {
        collectedIds.add(String(matched.id).trim());
        const filename = resolvePhotoFilename(matched, itemId);
        if (filename) collectedNames.push(filename);
      } else {
        // Fallback to item ID / string itself if no direct photo record
        collectedNames.push(itemId);
      }
    }

    // 2. Guarantee that every photo currently displayed/marked as selected is included
    for (const sp of selectedPhotos) {
      if (sp && sp.id != null && !collectedIds.has(String(sp.id).trim())) {
        collectedIds.add(String(sp.id).trim());
        const filename = resolvePhotoFilename(sp, sp.id);
        if (filename) collectedNames.push(filename);
      }
    }

    // 3. Deduplicate filenames while strictly preserving selection order
    const finalNames = [];
    const seenNames = new Set();
    for (const n of collectedNames) {
      const clean = (n || "").trim();
      if (clean && !seenNames.has(clean)) {
        seenNames.add(clean);
        finalNames.push(clean);
      }
    }

    if (finalNames.length === 0) {
      showToast("No selected images to copy.");
      return;
    }

    // 4. Strict format: EACH image name on a separate line (one name per line), NOT single continuous line
    const textToCopy = finalNames.join("\n");

    // 5. Reliable clipboard write with robust fallback
    let copyOk = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        copyOk = true;
      } catch {
        copyOk = false;
      }
    }

    if (!copyOk) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        textarea.style.opacity = "0";
        textarea.style.whiteSpace = "pre";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        copyOk = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        copyOk = false;
      }
    }

    if (copyOk) {
      setCopiedNames(true);
      setTimeout(() => setCopiedNames(false), 2200);
      showToast(`✓ Copied ${finalNames.length} image name${finalNames.length === 1 ? "" : "s"}`);
    } else {
      showToast("Unable to copy to clipboard.");
    }
  }

  async function handleDownloadZip() {
    if (!gallery) return;
    setZipping(true);
    try {
      const photoIdsToDownload = selectedPhotos.map((p) => p.id);
      const res = await fetch(`/api/galleries/${id}/download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: photoIdsToDownload.length > 0 ? photoIdsToDownload : gallery.selections }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Could not create the ZIP.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${gallery.name.replace(/\s+/g, "_")}_selected.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  const photos = gallery?.photos || [];
  const rawSelections = Array.isArray(gallery?.selections) && gallery.selections.length > 0
    ? gallery.selections
    : Array.isArray(gallery?.submittedSelections) && gallery.submittedSelections.length > 0
    ? gallery.submittedSelections
    : [];

  const selections = new Set(
    rawSelections
      .map((sid) => (typeof sid === "object" ? String(sid?.id || sid?.photoId || sid?.name || "").trim() : String(sid).trim()))
      .filter(Boolean)
  );

  const selectedPhotos = photos.filter((p) => {
    if (!p) return false;
    const pid = String(p.id).trim();
    if (selections.has(pid)) return true;
    if (p.sourceName && selections.has(p.sourceName.trim())) return true;
    if (p.name && selections.has(p.name.trim())) return true;
    if (p.key) {
      const k = p.key.split("/").pop() || "";
      if (selections.has(k)) return true;
    }
    return Boolean(p.selected || p.isSelected);
  });
  const unselectedPhotos = photos.filter((p) => !selectedPhotos.includes(p));
  const status = gallery?.status || "ACTIVE";
  const isLocked = Boolean(gallery?.selectionLocked);

  let displayedPhotos = photos;
  if (tab === "selected") displayedPhotos = selectedPhotos;
  else if (tab === "unselected") displayedPhotos = unselectedPhotos;

  // Reset batch count on tab switch (unconditional hook)
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [tab]);

  // Progressive batch loading sentinel (unconditional hook)
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, displayedPhotos.length));
        }
      },
      { rootMargin: "600px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayedPhotos.length]);

  if (loadError) {
    return (
      <div className="admin-wrap">
        <div className="topbar">
          <div className="topbar-left">
            <Link href="/studio" className="btn btn-ghost">
              ← Back to Studio
            </Link>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", background: "var(--paper)", padding: "36px 28px", borderRadius: "var(--radius)", border: "1px solid var(--line)", boxShadow: "0 10px 30px rgba(64,43,28,0.06)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--brown)" }}>Gallery Not Found or Corrupted</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
            This gallery could not be loaded from storage. Its metadata record may have been moved, removed, or corrupted.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/studio" className="btn btn-ghost">
              Return to Studio
            </Link>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete Record from List
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="admin-wrap">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  const renderedPhotos = displayedPhotos.slice(0, visibleCount);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="wordmark">
            digital<em>photo</em>
          </div>
          <div className="topbar-sub">Private gallery studio</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-ghost" onClick={handleLogout}>
            Logout
          </button>
          <Link href="/studio" className="btn btn-ghost">
            Back to galleries
          </Link>
        </div>
      </div>

      <div className="admin-wrap">
        {/* Detail Header */}
        <div className="detail-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span className={`status-badge status-${status}`}>
                {STATUS_LABELS[status] || status}
              </span>
              {isLocked && (
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>
                  🔒 Selection Locked
                </span>
              )}
            </div>
            <h1>{gallery.name}</h1>
            <div className="tag">
              {gallery.customerName ? `Client: ${gallery.customerName} · ` : ""}
              {gallery.type} · {photos.length} photos
              {gallery.eventDate ? ` · Event: ${gallery.eventDate}` : ""}
              {` · Created: ${new Date(gallery.createdAt).toLocaleDateString()}`}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={handleCopyLink}>
              Copy gallery link
            </button>
            <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
              Delete gallery
            </button>
          </div>
        </div>

        {/* Gallery Control Bar */}
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="section-title">
            <h2 style={{ fontSize: 15 }}>Gallery controls & client access</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {/* Status Management */}
            <div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="change-status">Gallery status</label>
                <select
                  id="change-status"
                  value={status}
                  disabled={updating}
                  onChange={(e) => updateGallery({ status: e.target.value })}
                >
                  <option value="DRAFT">Draft (Hidden from client)</option>
                  <option value="ACTIVE">Active (Client can view & select)</option>
                  <option value="SELECTION_SUBMITTED">Selection Submitted</option>
                  <option value="COMPLETED">Completed (Job finished)</option>
                  <option value="ARCHIVED">Archived (Stored for records)</option>
                </select>
              </div>
            </div>

            {/* Selection Locking */}
            <div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Selection state ({selectedPhotos.length} selected)</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    className={`btn ${isLocked ? "btn-soft" : "btn-primary"}`}
                    disabled={updating}
                    onClick={() => updateGallery({ selectionLocked: !isLocked })}
                  >
                    {isLocked ? "🔓 Unlock selection" : "🔒 Lock selection"}
                  </button>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {isLocked ? "Client cannot modify picks" : "Client can edit picks"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Client Credentials & Access Information (ADMIN ONLY) */}
          <div className="client-access-card" style={{ marginTop: 20 }}>
            <div className="access-field">
              <div className="access-label">GALLERY CODE</div>
              <div className="access-value-row">
                <span className="access-code-prominent">{gallery.code}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyText(gallery.code, "Gallery code copied to clipboard")}
                >
                  Copy Code
                </button>
              </div>
            </div>

            <div className="access-field">
              <div className="access-label">PASSWORD</div>
              <div className="access-value-row">
                {gallery.clientPassword ? (
                  <>
                    <span className="access-pass-prominent">
                      {showPassword ? gallery.clientPassword : "••••••••••"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide password" : "Show password"}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => copyText(gallery.clientPassword, "Password copied to clipboard")}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft btn-sm"
                      onClick={() => {
                        setNewPassword("");
                        setShowPasswordModal(true);
                      }}
                    >
                      Change Password
                    </button>
                  </>
                ) : (
                  <>
                    <span className="access-pass-unavailable">Password unavailable</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setNewPassword("");
                        setShowPasswordModal(true);
                      }}
                    >
                      Set New Password
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="access-field access-status-meta">
              <div className="access-label">SUBMISSION STATUS</div>
              <div className="access-value-row">
                <span>
                  {gallery.selectionSubmittedAt
                    ? `Submitted on ${new Date(gallery.selectionSubmittedAt).toLocaleDateString()}`
                    : "Not submitted yet"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Photos Summary & Filter Tabs */}
        <div className="toolbar" style={{ marginBottom: 15 }}>
          <div className="tabs" style={{ margin: 0, border: 0 }}>
            <button
              className={`tab ${tab === "all" ? "active" : ""}`}
              onClick={() => setTab("all")}
            >
              All photos ({photos.length})
            </button>
            <button
              className={`tab ${tab === "selected" ? "active" : ""}`}
              onClick={() => setTab("selected")}
            >
              Selected ({selectedPhotos.length})
            </button>
            <button
              className={`tab ${tab === "unselected" ? "active" : ""}`}
              onClick={() => setTab("unselected")}
            >
              Unselected ({unselectedPhotos.length})
            </button>
          </div>

          {selectedPhotos.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-soft"
                onClick={handleCopySelectedNames}
                title="Copy all client-selected original filenames in selection order"
                style={{ fontSize: "12px", padding: "8px 16px" }}
              >
                {copiedNames ? "✓ Copied" : "Copy Image Names"}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={zipping}
                onClick={handleDownloadZip}
              >
                {zipping ? "Zipping original photos…" : `Download ${selectedPhotos.length} selected as ZIP`}
              </button>
            </div>
          )}
        </div>

        {/* Photo Grid */}
        {displayedPhotos.length === 0 ? (
          <div className="empty">
            {tab === "selected"
              ? "No photos have been selected by the client yet."
              : tab === "unselected"
              ? "All photos in this gallery have been selected!"
              : "No photos uploaded yet."}
          </div>
        ) : (
          <>
            <div className="photo-grid">
              {renderedPhotos.map((p) => (
                <AdminPhotoTile
                  key={p.id}
                  photo={p}
                  isSelected={selections.has(p.id) || selectedPhotos.some((sp) => sp.id === p.id)}
                />
              ))}
            </div>

            {visibleCount < displayedPhotos.length && (
              <div
                ref={sentinelRef}
                style={{ height: 40, margin: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}
              >
                Loading more photos…
              </div>
            )}
          </>
        )}
      </div>

      {/* Change / Set Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{gallery?.clientPassword ? "Change Gallery Password" : "Set Gallery Password"}</h3>
            <p>
              Set a new access password for <strong>{gallery?.title}</strong>. The client will need this password together with gallery code <code>{gallery?.code}</code> to sign in.
            </p>
            <form onSubmit={handleSavePassword}>
              <div style={{ position: "relative", margin: "16px 0 20px" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="input"
                  style={{ width: "100%", paddingRight: 40, boxSizing: "border-box" }}
                  placeholder="Enter new password (min. 4 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  required
                  minLength={4}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    color: "var(--muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? (
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setNewPassword("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPassword || !newPassword.trim()}
                >
                  {savingPassword ? "Saving…" : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this gallery?</h3>
            <p>
              This will permanently remove the gallery and all uploaded photos.
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
