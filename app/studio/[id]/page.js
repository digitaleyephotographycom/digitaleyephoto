"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SELECTION_SUBMITTED: "Selection Submitted",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export default function GalleryDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [gallery, setGallery] = useState(null);
  const [tab, setTab] = useState("all"); // "all" | "selected" | "unselected"
  const [zipping, setZipping] = useState(false);
  const [toast, setToast] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [updating, setUpdating] = useState(false);

  async function load() {
    const res = await fetch(`/api/galleries/${id}`);
    if (res.status === 401) {
      window.location.href = "/studio/login";
      return;
    }
    if (res.ok) setGallery(await res.json());
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/studio/login";
  }

  useEffect(() => {
    load();
  }, [id]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  }

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
      showToast("Network error. Please try again.");
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

  async function handleDownloadZip() {
    if (!gallery) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/galleries/${id}/download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: gallery.selections }),
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

  if (!gallery) {
    return (
      <div className="admin-wrap">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  const photos = gallery.photos || [];
  const selections = new Set(gallery.selections || []);
  const selectedPhotos = photos.filter((p) => selections.has(p.id));
  const unselectedPhotos = photos.filter((p) => !selections.has(p.id));
  const status = gallery.status || "ACTIVE";
  const isLocked = Boolean(gallery.selectionLocked);

  let displayedPhotos = photos;
  if (tab === "selected") displayedPhotos = selectedPhotos;
  else if (tab === "unselected") displayedPhotos = unselectedPhotos;

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

          <div className="link-row" style={{ marginTop: 18 }}>
            <span>Gallery code: <code>{gallery.code}</code></span>
            <span>·</span>
            <span>Password: <em>Protected (set at creation)</em></span>
            <span>·</span>
            <span>
              Submission:{" "}
              {gallery.selectionSubmittedAt
                ? `Submitted on ${new Date(gallery.selectionSubmittedAt).toLocaleDateString()}`
                : "Not submitted yet"}
            </span>
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
            <button
              className="btn btn-primary"
              disabled={zipping}
              onClick={handleDownloadZip}
            >
              {zipping ? "Zipping original photos…" : `Download ${selectedPhotos.length} selected as ZIP`}
            </button>
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
          <div className="photo-grid">
            {displayedPhotos.map((p) => {
              const isSel = selections.has(p.id);
              return (
                <div key={p.id} className="photo-tile">
                  <img src={p.url} alt={p.name} loading="lazy" />
                  {isSel && <div className="sel-chip">SELECTED</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Delete this gallery?</h3>
            <p>
              This will permanently remove the gallery metadata and all uploaded photos from your Backblaze B2 bucket.
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
