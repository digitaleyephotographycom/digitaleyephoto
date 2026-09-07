"use client";

import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import { useRouter } from "next/navigation";

const BATCH_SIZE = 24;

// Memoized PhotoTile to guarantee 0ms selection toggle without re-rendering the whole grid
const PhotoTile = memo(function PhotoTile({ photo, isSelected, isLocked, onToggle }) {
  const handleClick = useCallback(() => {
    onToggle(photo.id);
  }, [onToggle, photo.id]);

  const imageUrl = photo.thumbUrl || photo.url;

  return (
    <div
      className={`ptile ${isSelected ? "selected" : ""}`}
      style={isLocked ? { cursor: "default" } : {}}
      onClick={handleClick}
    >
      <img
        src={imageUrl}
        alt={photo.name}
        loading="lazy"
        decoding="async"
      />
      <div className="check">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12.5L9.5 18L20 6"
            stroke="#3b2a20"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
});

export default function GalleryView() {
  const router = useRouter();
  const [gallery, setGallery] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [activeTab, setActiveTab] = useState("all"); // "all" | "selected"
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const toastTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const sentinelRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("gallery_data");
    const token = sessionStorage.getItem("gallery_token");

    if (!raw && !token) {
      router.replace("/gallery");
      return;
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setGallery(parsed);
        if (Array.isArray(parsed.selections)) {
          setSelected(new Set(parsed.selections));
        }
      } catch {}
    }

    const loadedAt = Number(sessionStorage.getItem("gallery_loaded_at") || 0);
    const isFresh = Date.now() - loadedAt < 180 * 1000;

    // Only refresh signed URLs if data is missing or stale (older than 3 minutes)
    if (token && !isFresh) {
      fetch("/api/gallery-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.gallery) {
            setGallery(data.gallery);
            if (Array.isArray(data.gallery.selections)) {
              setSelected(new Set(data.gallery.selections));
            }
            sessionStorage.setItem("gallery_data", JSON.stringify(data.gallery));
            sessionStorage.setItem("gallery_loaded_at", String(Date.now()));
          }
        })
        .catch(() => {});
    }
  }, [router]);

  // Debounced server selection persistence
  const persistSelections = useCallback(async (nextSet) => {
    const token = sessionStorage.getItem("gallery_token");
    if (!token) return;
    try {
      const res = await fetch("/api/gallery-access/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, selections: Array.from(nextSet), submit: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error) showToast(data.error);
      }
    } catch {
      // Ignore transient network glitches for background sync
    }
  }, [showToast]);

  const queueSync = useCallback((nextSet) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      persistSelections(nextSet);
    }, 400);
  }, [persistSelections]);

  const toggle = useCallback((id) => {
    if (gallery?.selectionLocked) {
      showToast("Selections are currently locked by your photographer.");
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      // Debounced persistence to avoid concurrent hammering
      queueSync(next);
      return next;
    });
  }, [gallery?.selectionLocked, showToast, queueSync]);

  // Reset progressive batch count on tab switch
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [activeTab]);

  const photos = gallery?.photos || [];
  const selectedPhotos = photos.filter((p) => selected.has(p.id));
  const displayedPhotos = activeTab === "selected" ? selectedPhotos : photos;
  const isLocked = Boolean(gallery?.selectionLocked);
  const isSubmitted = gallery?.selectionStatus === "SUBMITTED";

  // Incremental batch sentinel using a single IntersectionObserver
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

  async function handleSubmitSelection() {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("gallery_token");
      const res = await fetch("/api/gallery-access/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selections: Array.from(selected),
          submit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Could not submit selections.");
        return;
      }

      setGallery((prev) => ({
        ...prev,
        selectionStatus: "SUBMITTED",
        selectionSubmittedAt: data.selectionSubmittedAt || Date.now(),
        status: data.status || "SELECTION_SUBMITTED",
      }));
      setShowConfirmModal(false);
      showToast("Your selection has been submitted successfully!");
    } catch {
      showToast("Failed to submit selection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!gallery) return null;

  const renderedPhotos = displayedPhotos.slice(0, visibleCount);

  return (
    <>
      <div className="client-header">
        <div>
          <h1>{gallery.name}</h1>
          <div className="tag">
            {gallery.customerName ? `${gallery.customerName} · ` : ""}
            {gallery.type} · {photos.length} photos
            {gallery.eventDate ? ` · ${gallery.eventDate}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="client-tabs">
            <button
              className={`client-tab-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Photos ({photos.length})
            </button>
            <button
              className={`client-tab-btn ${activeTab === "selected" ? "active" : ""}`}
              onClick={() => setActiveTab("selected")}
            >
              Selected ({selected.size})
            </button>
          </div>
        </div>
      </div>

      <div className="client-grid-wrap">
        {isLocked && (
          <div className="lock-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <strong>Selection is locked.</strong> Your photographer has locked this gallery for processing. You can still view your selected photos.
            </div>
          </div>
        )}

        {isSubmitted && (
          <div className="submitted-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <strong>Selection submitted</strong> — You selected {selected.size} photo{selected.size === 1 ? "" : "s"}
              {gallery.selectionSubmittedAt
                ? ` on ${new Date(gallery.selectionSubmittedAt).toLocaleDateString()}`
                : ""}
              .{isLocked ? " Your selections are currently locked." : " You can still adjust your selection until the photographer locks it."}
            </div>
          </div>
        )}

        {photos.length === 0 && (
          <div className="empty">Your photographer hasn't uploaded photos to this gallery yet.</div>
        )}

        {photos.length > 0 && activeTab === "selected" && selectedPhotos.length === 0 && (
          <div className="empty">
            No photos selected yet. Switch to "All Photos" and tap any photo to add it to your selection.
          </div>
        )}

        <div className="client-grid">
          {renderedPhotos.map((p) => (
            <PhotoTile
              key={p.id}
              photo={p}
              isSelected={selected.has(p.id)}
              isLocked={isLocked}
              onToggle={toggle}
            />
          ))}
        </div>

        {/* Sentinel for progressive batch appending */}
        {visibleCount < displayedPhotos.length && (
          <div
            ref={sentinelRef}
            style={{ height: 40, margin: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}
          >
            Loading more photos…
          </div>
        )}
      </div>

      {/* Floating Selection Bar */}
      <div className={`send-bar ${selected.size > 0 ? "show" : ""}`}>
        <div className="count">
          <strong>{selected.size}</strong> photo{selected.size === 1 ? "" : "s"} selected
          {isSubmitted && !isLocked && <span style={{ marginLeft: 8, opacity: 0.8 }}>(Submitted)</span>}
        </div>

        {isLocked ? (
          <button className="btn btn-primary" disabled style={{ opacity: 0.7 }}>
            Selection locked
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => setShowConfirmModal(true)}
          >
            {isSubmitted ? "Update submission" : "Submit selection"}
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Submit {selected.size} selected photo{selected.size === 1 ? "" : "s"}?</h3>
            <p>
              Your final photo selection will be sent directly to your photographer for printing and album creation.
              Once received, your selection may be locked for production.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={handleSubmitSelection}
              >
                {submitting ? "Submitting…" : "Submit selection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
