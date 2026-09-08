"use client";

import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import { useRouter } from "next/navigation";

const BATCH_SIZE = 24;

// Memoized PhotoTile with clean green selection badge and 0ms toggle
const PhotoTile = memo(
  function PhotoTile({ photo, isSelected, isLocked, isSubmitted, onToggle }) {
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
        {isSelected ? (
          <div className="selection-badge">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Selected</span>
          </div>
        ) : (
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
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.photo.id === next.photo.id &&
    prev.isSelected === next.isSelected &&
    prev.isLocked === next.isLocked &&
    prev.isSubmitted === next.isSubmitted &&
    prev.photo.thumbUrl === next.photo.thumbUrl &&
    prev.onToggle === next.onToggle
);

function areSelectionsEqual(setA, listB) {
  if (!listB || !Array.isArray(listB)) return false;
  if (setA.size !== listB.length) return false;
  for (const id of listB) {
    if (!setA.has(id)) return false;
  }
  return true;
}

// High-performance, full-screen Photo Viewer / Slideshow
function PhotoViewer({
  isOpen,
  photos,
  currentIndex,
  onIndexChange,
  onClose,
  selected,
  onToggle,
  isLocked,
}) {
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const touchStartTimeRef = useRef(0);
  const lastTapTimeRef = useRef(0);
  const lastTapIndexRef = useRef(null);

  const prev = useCallback(() => {
    if (photos.length === 0) return;
    onIndexChange((currentIndex - 1 + photos.length) % photos.length);
  }, [currentIndex, photos.length, onIndexChange]);

  const next = useCallback(() => {
    if (photos.length === 0) return;
    onIndexChange((currentIndex + 1) % photos.length);
  }, [currentIndex, photos.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        prev();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === " " && photos[currentIndex]) {
        e.preventDefault();
        onToggle(photos[currentIndex].id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, photos, prev, next, onClose, onToggle]);

  // Lock body scroll while viewer is open
  useEffect(() => {
    if (isOpen) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [isOpen]);

  // Touch swipe and double-tap handling
  function handleTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
  }

  function handleTouchEnd(e) {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;

    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    const duration = Date.now() - touchStartTimeRef.current;

    // Detect intentional horizontal swipe (> 40px and predominantly horizontal)
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        next();
      } else {
        prev();
      }
      lastTapTimeRef.current = 0;
    } else if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && duration < 350) {
      // Clean stationary tap
      const now = Date.now();
      const isDoubleTap =
        now - lastTapTimeRef.current < 350 &&
        lastTapIndexRef.current === currentIndex;

      if (isDoubleTap) {
        // Intentional double-tap: if photo is selected, unselect it immediately
        const currentPhoto = photos[currentIndex];
        if (currentPhoto && selected.has(currentPhoto.id) && !isLocked) {
          onToggle(currentPhoto.id);
        }
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
        lastTapIndexRef.current = currentIndex;
      }
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }

  if (!isOpen || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex] || photos[0];
  const isSelected = selected.has(currentPhoto.id);
  const imageUrl = currentPhoto.thumbUrl || currentPhoto.url;

  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <div className="photo-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Top bar: counter & close */}
        <div className="photo-viewer-topbar">
          <div className="photo-viewer-counter">
            <button
              type="button"
              className="photo-viewer-nav-arrow"
              onClick={prev}
              aria-label="Previous photograph"
            >
              &lt;
            </button>
            <span className="photo-viewer-pos">
              {currentIndex + 1} / {photos.length}
            </span>
            <button
              type="button"
              className="photo-viewer-nav-arrow"
              onClick={next}
              aria-label="Next photograph"
            >
              &gt;
            </button>
          </div>

          <button
            type="button"
            className="photo-viewer-close"
            onClick={onClose}
            aria-label="Close photo viewer"
          >
            ✕
          </button>
        </div>

        {/* Center: Stage with large photo */}
        <div
          className="photo-viewer-stage"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <button
            type="button"
            className="photo-viewer-side-btn prev-btn"
            onClick={prev}
            aria-label="Previous photograph"
          >
            &lt;
          </button>

          <div
            className="photo-viewer-image-wrap"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (currentPhoto && isSelected && !isLocked) {
                onToggle(currentPhoto.id);
              }
            }}
          >
            <img
              src={imageUrl}
              alt={currentPhoto.name}
              decoding="async"
              className="photo-viewer-img"
            />
          </div>

          <button
            type="button"
            className="photo-viewer-side-btn next-btn"
            onClick={next}
            aria-label="Next photograph"
          >
            &gt;
          </button>
        </div>

        {/* Bottom: Direct selection control */}
        <div className="photo-viewer-bottom">
          {isLocked ? (
            <div className="viewer-locked-note">Selection locked</div>
          ) : (
            <button
              type="button"
              className={`viewer-select-btn ${isSelected ? "is-selected" : ""}`}
              onClick={() => onToggle(currentPhoto.id)}
            >
              {isSelected ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  ✓ Selected
                </>
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  Tap to Select
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GalleryView() {
  const router = useRouter();
  const [gallery, setGallery] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [submittedSelection, setSubmittedSelection] = useState([]);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "selected"
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState("");
  const [undoHighlighted, setUndoHighlighted] = useState(false);

  // Photo viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMode, setViewerMode] = useState("all"); // "all" | "selected"
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState([]);

  // Stable photo IDs displayed in the Selected tab to prevent disappearance bug
  const [selectedTabPhotoIds, setSelectedTabPhotoIds] = useState([]);

  const toastTimerRef = useRef(null);
  const syncTimerRef = useRef(null);
  const sentinelRef = useRef(null);
  const highlightTimerRef = useRef(null);

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
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
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
        if (Array.isArray(parsed.submittedSelections)) {
          setSubmittedSelection(parsed.submittedSelections);
        } else if (parsed.selectionStatus === "SUBMITTED" && Array.isArray(parsed.selections)) {
          setSubmittedSelection(parsed.selections);
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
            if (Array.isArray(data.gallery.submittedSelections)) {
              setSubmittedSelection(data.gallery.submittedSelections);
            } else if (data.gallery.selectionStatus === "SUBMITTED" && Array.isArray(data.gallery.selections)) {
              setSubmittedSelection(data.gallery.selections);
            }
            sessionStorage.setItem("gallery_data", JSON.stringify(data.gallery));
            sessionStorage.setItem("gallery_loaded_at", String(Date.now()));
          }
        })
        .catch(() => {});
    }
  }, [router]);

  // Debounced selection persistence
  const persistSelections = useCallback(
    async (nextSet) => {
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
        // Ignore transient glitches for background sync
      }
    },
    [showToast]
  );

  const queueSync = useCallback(
    (nextSet) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        persistSelections(nextSet);
      }, 400);
    },
    [persistSelections]
  );

  const toggle = useCallback(
    (id) => {
      if (gallery?.selectionLocked) {
        showToast("Selections are currently locked by your photographer.");
        return;
      }

      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);

        queueSync(next);
        return next;
      });
    },
    [gallery?.selectionLocked, showToast, queueSync]
  );

  // Capture photos present in Selected tab upon entering tab to prevent abrupt disappearing
  useEffect(() => {
    if (activeTab === "selected") {
      const currentSelectedIds = Array.from(selected);
      setSelectedTabPhotoIds(currentSelectedIds);
    }
    setVisibleCount(BATCH_SIZE);
  }, [activeTab]);

  const photos = gallery?.photos || [];
  const isLocked = Boolean(gallery?.selectionLocked);

  // Accurate difference tracking between last submitted selection and current selection
  const hasSubmitted = Boolean(
    gallery?.selectionStatus === "SUBMITTED" ||
    (submittedSelection && submittedSelection.length > 0)
  );
  const isIdenticalToSubmitted = hasSubmitted && areSelectionsEqual(selected, submittedSelection);
  const hasChanges = !hasSubmitted || !isIdenticalToSubmitted;

  // When tapping a selected photo while submitted in the Selected tab, draw attention to Undo Submission
  const triggerUndoFocus = useCallback(() => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setUndoHighlighted(true);
    highlightTimerRef.current = setTimeout(() => {
      setUndoHighlighted(false);
    }, 1000);
    showToast("Selection submitted. Tap 'Undo Submission' below to make changes.");
  }, [showToast]);

  // Scoped tile click: keep All Photos untouched; in Selected Photos when submitted, focus Undo Submission
  const handleTileClick = useCallback(
    (id) => {
      if (activeTab === "selected" && hasSubmitted && !hasChanges) {
        triggerUndoFocus();
        return;
      }
      toggle(id);
    },
    [activeTab, hasSubmitted, hasChanges, triggerUndoFocus, toggle]
  );

  const handleViewerToggle = useCallback(
    (id) => {
      if (hasSubmitted && !hasChanges) {
        showToast("Selection is submitted. Tap 'Undo Submission' in Selected Photos to adjust.");
        return;
      }
      toggle(id);
    },
    [hasSubmitted, hasChanges, showToast, toggle]
  );

  // When in Selected tab, use the stable snapshot so unselecting a photo doesn't vanish it immediately
  const displayedPhotos =
    activeTab === "selected"
      ? photos.filter((p) => selectedTabPhotoIds.includes(p.id) || selected.has(p.id))
      : photos;

  function handleOpenViewer(mode) {
    if (mode === "selected" && selected.size === 0) {
      showToast("Select at least one photo to view.");
      return;
    }
    const list = mode === "selected" ? photos.filter((p) => selected.has(p.id)) : photos;
    setViewerPhotos(list);
    setViewerMode(mode);
    setViewerIndex(0);
    setViewerOpen(true);
  }

  // Incremental batch sentinel using IntersectionObserver
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
      const currentPicks = Array.from(selected);
      const res = await fetch("/api/gallery-access/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selections: currentPicks,
          submit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Could not submit photo selection.");
        return;
      }

      setSubmittedSelection(currentPicks);
      setGallery((prev) => {
        const updated = {
          ...prev,
          selectionStatus: "SUBMITTED",
          selectionSubmittedAt: data.selectionSubmittedAt || Date.now(),
          status: data.status || "SELECTION_SUBMITTED",
          submittedSelections: currentPicks,
          selections: currentPicks,
        };
        sessionStorage.setItem("gallery_data", JSON.stringify(updated));
        return updated;
      });
      setShowConfirmModal(false);
      showToast("Your photo selection has been successfully submitted.");
    } catch {
      showToast("Unable to submit selection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndoSubmission() {
    setUndoing(true);
    try {
      const token = sessionStorage.getItem("gallery_token");
      const res = await fetch("/api/gallery-access/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          undoSubmit: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Could not undo submission. Please try again.");
        return;
      }

      setSubmittedSelection([]);
      setGallery((prev) => {
        const updated = {
          ...prev,
          selectionStatus: "NOT_SUBMITTED",
          selectionSubmittedAt: null,
          status: data.status || "ACTIVE",
          submittedSelections: [],
        };
        sessionStorage.setItem("gallery_data", JSON.stringify(updated));
        return updated;
      });
      setShowUndoModal(false);
      showToast("Submission undone. You can now adjust your selections.");
    } catch {
      showToast("Unable to undo submission. Please try again.");
    } finally {
      setUndoing(false);
    }
  }

  if (!gallery) return null;

  const renderedPhotos = displayedPhotos.slice(0, visibleCount);

  return (
    <>
      <div className="client-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <h1>{gallery.name}</h1>
            {hasSubmitted && !hasChanges && (
              <span className="status-squircle status-squircle-green" style={{ fontSize: 11, padding: "5px 10px" }}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Selection Submitted
              </span>
            )}
          </div>
          <div className="tag">
            {gallery.customerName ? `${gallery.customerName} · ` : ""}
            {gallery.type} · {photos.length} photos
            {gallery.eventDate ? ` · ${gallery.eventDate}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="client-tabs">
            <button
              type="button"
              className={`client-tab-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Photos ({photos.length})
            </button>
            <button
              type="button"
              className={`client-tab-btn ${activeTab === "selected" ? "active" : ""}`}
              onClick={() => setActiveTab("selected")}
            >
              Selected ({selected.size})
            </button>
          </div>
        </div>
      </div>

      <div className="client-grid-wrap">
        {/* Concise and clean selection toolbar */}
        <div className="selection-toolbar">
          <div className="selection-toolbar-left">
            <span className="selection-header-count">
              Selected: <strong>{selected.size}</strong>
            </span>
            {hasSubmitted && !hasChanges && (
              <span className="status-squircle status-squircle-green" style={{ fontSize: 10, padding: "3px 8px" }}>
                ✓ Submitted
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-soft btn-view"
            onClick={() => handleOpenViewer(activeTab === "selected" ? "selected" : "all")}
            disabled={activeTab === "selected" && selected.size === 0}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            VIEW
          </button>
        </div>

        {isLocked && (
          <div className="lock-banner" style={{ marginTop: 14 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <strong>Selection finalized & locked.</strong> Your photographer has locked this gallery. You can view your selected photos.
            </div>
          </div>
        )}

        {photos.length === 0 && (
          <div className="empty">No photos in this gallery yet.</div>
        )}

        {photos.length > 0 && activeTab === "selected" && displayedPhotos.length === 0 && (
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
              isSubmitted={hasSubmitted}
              onToggle={handleTileClick}
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
      <div className={`send-bar ${(selected.size > 0 || hasSubmitted) ? "show" : ""}`}>
        <div className="count">
          {hasSubmitted && !hasChanges ? (
            <span className="submitted-bar-badge">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <strong>Selection Submitted</strong> ({selected.size})
            </span>
          ) : (
            <>
              <strong>{selected.size}</strong> photo{selected.size === 1 ? "" : "s"} selected
            </>
          )}
        </div>

        {isLocked ? (
          <button className="btn btn-primary" disabled style={{ opacity: 0.7 }}>
            Selection locked
          </button>
        ) : hasSubmitted && !hasChanges ? (
          activeTab === "selected" ? (
            <button
              type="button"
              className={`btn btn-undo ${undoHighlighted ? "btn-undo-highlight" : ""}`}
              onClick={() => setShowUndoModal(true)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Undo Submission
            </button>
          ) : null
        ) : selected.size > 0 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowConfirmModal(true)}
          >
            Submit selection
          </button>
        ) : null}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Submit {selected.size} selected photo{selected.size === 1 ? "" : "s"}?</h3>
            <p>
              Your photo selection will be sent directly to your photographer.
              You can still make adjustments until production is finalized.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={submitting}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={handleSubmitSelection}
              >
                {submitting ? "Submitting…" : "Confirm & submit selection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Submission Modal */}
      {showUndoModal && (
        <div className="modal-overlay" onClick={() => setShowUndoModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Undo submitted selection?</h3>
            <p>
              Are you sure you want to undo your submitted selection?
              This will make your photo choices editable again so you can make adjustments.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={undoing}
                onClick={() => setShowUndoModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={undoing}
                onClick={handleUndoSubmission}
              >
                {undoing ? "Undoing…" : "Undo Submission"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Photo Viewer / Slideshow */}
      <PhotoViewer
        isOpen={viewerOpen}
        photos={viewerPhotos}
        currentIndex={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        selected={selected}
        onToggle={handleViewerToggle}
        isLocked={isLocked}
      />

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
