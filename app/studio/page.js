"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SELECTION_SUBMITTED: "Selection Submitted",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export default function StudioDashboard() {
  const [galleries, setGalleries] = useState([]);
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [type, setType] = useState("Wedding");
  const [eventDate, setEventDate] = useState("");
  const [password, setPassword] = useState("");
  const [initialStatus, setInitialStatus] = useState("ACTIVE");
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef(null);

  // Search, filter, and sorting states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("newest");
  const [mobileClientTab, setMobileClientTab] = useState("CURRENT"); // 'CURRENT' | 'COMPLETED'

  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  function handleTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Detect horizontal swipe (> 45px and predominantly horizontal)
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        // Swiped left: Current Clients -> Completed Clients
        setMobileClientTab("COMPLETED");
      } else {
        // Swiped right: Completed Clients -> Current Clients
        setMobileClientTab("CURRENT");
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }

  async function loadGalleries() {
    const res = await fetch("/api/galleries");
    if (res.status === 401) {
      window.location.href = "/studio/login";
      return;
    }
    const data = await res.json();
    setGalleries(data.galleries || []);
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/studio/login";
  }

  useEffect(() => {
    loadGalleries();
  }, []);

  const toastTimerRef = useRef(null);

  function showToast(msg) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 2600);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function handleFiles(list) {
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  const [uploadProgress, setUploadProgress] = useState(null);

  async function createClientThumbnail(file, maxWidth = 800, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith("image/")) return resolve(null);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const maxDim = Math.max(img.width, img.height);
          const scale = maxDim > maxWidth ? maxWidth / maxDim : 1;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function createGallery() {
    if (!name.trim() || !password.trim()) {
      showToast("Add a gallery name and password first.");
      return;
    }
    if (files.length === 0) {
      showToast("Choose at least one photo to upload.");
      return;
    }

    setBusy(true);
    setUploadProgress({ text: "Creating gallery…" });
    try {
      const createRes = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          customerName,
          type,
          eventDate,
          password,
          status: initialStatus,
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(created.error || `Could not create gallery (Server error ${createRes.status}).`);
      }

      // Step 1: Request all upload URLs in a single fast batch
      setUploadProgress({ text: `Preparing ${files.length} uploads…` });
      const urlRes = await fetch(`/api/galleries/${created.id}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ fileName: f.name, contentType: f.type })),
        }),
      });
      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error || `Could not prepare uploads (Server error ${urlRes.status}).`);
      }
      const { items } = await urlRes.json().catch(() => ({}));
      if (!items || items.length === 0) {
        throw new Error("No upload URLs generated.");
      }

      // Step 2: Concurrently upload files to Backblaze B2 (pool of 4 parallel streams)
      let completed = 0;
      const uploadedPhotos = [];
      const concurrency = 4;
      const queue = items.map((item, index) => ({ item, file: files[index] }));

      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0) {
          const task = queue.shift();
          if (!task) break;
          const { item, file } = task;

          // 2a. Upload original 4K photo directly to Backblaze B2
          const uploadRes = await fetch(item.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!uploadRes.ok) {
            throw new Error(`Failed to upload ${file.name} to storage.`);
          }

          // 2b. Generate and upload lightweight WebP thumbnail directly to B2
          if (item.thumbUploadUrl) {
            try {
              const thumbBlob = await createClientThumbnail(file, 800, 0.82);
              if (thumbBlob) {
                await fetch(item.thumbUploadUrl, {
                  method: "PUT",
                  headers: { "Content-Type": "image/webp" },
                  body: thumbBlob,
                });
              }
            } catch (thumbErr) {
              console.warn("Client thumbnail upload skipped for", file.name, thumbErr);
            }
          }

          completed++;
          const pct = Math.round((completed / files.length) * 100);
          setUploadProgress({ text: `Uploading ${completed} of ${files.length} (${pct}%)…` });

          uploadedPhotos.push({
            photoId: item.photoId,
            key: item.key,
            thumbKey: item.thumbKey,
            name: file.name,
          });
        }
      });

      await Promise.all(workers);

      // Step 3: Commit all photo records in a single fast batch call
      setUploadProgress({ text: "Finalizing gallery…" });
      const saveRes = await fetch(`/api/galleries/${created.id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: uploadedPhotos }),
      });
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        throw new Error(errData.error || "Could not save photo records.");
      }

      setName("");
      setCustomerName("");
      setEventDate("");
      setPassword("");
      setFiles([]);
      setUploadProgress(null);
      window.location.href = `/studio/${created.id}`;
    } catch (err) {
      showToast(err.message || "Something went wrong.");
      setBusy(false);
      setUploadProgress(null);
    }
  }

  // Filter and sort computation
  const filteredGalleries = galleries
    .filter((g) => {
      if (statusFilter !== "ALL" && (g.status || "ACTIVE") !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (g.name || "").toLowerCase().includes(q);
        const custMatch = (g.customerName || "").toLowerCase().includes(q);
        const codeMatch = (g.code || "").toLowerCase().includes(q);
        if (!nameMatch && !custMatch && !codeMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === "oldest") return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === "name_asc") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
      if (sortBy === "photos") return (b.photoCount || 0) - (a.photoCount || 0);
      if (sortBy === "selected") return (b.selectionCount || 0) - (a.selectionCount || 0);
      return 0;
    });

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
          <Link href="/" className="btn btn-ghost">
            Exit
          </Link>
        </div>
      </div>

      <div className="admin-wrap">
        <div className="page-head">
          <div>
            <div className="eyebrow">Studio workspace</div>
            <h1>Gallery manager</h1>
            <p>Everything your clients need, from one private link.</p>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <span>Galleries</span>
            <strong>{galleries.length}</strong>
          </div>
          <div className="stat">
            <span>Photos</span>
            <strong>{galleries.reduce((n, g) => n + (g.photoCount || 0), 0)}</strong>
          </div>
          <div className="stat">
            <span>Selections</span>
            <strong>{galleries.reduce((n, g) => n + (g.selectionCount || 0), 0)}</strong>
          </div>
          <div className="stat">
            <span>Completed</span>
            <strong style={{ fontSize: 28 }}>
              {galleries.filter((g) => (g.status || "ACTIVE") === "COMPLETED").length}
            </strong>
          </div>
        </div>

        {/* Create Gallery Panel */}
        <div className="panel">
          <div className="section-title">
            <h2>Create a new gallery</h2>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="new-gname">Gallery name</label>
              <input
                id="new-gname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul & Priya Wedding"
              />
            </div>
            <div className="field">
              <label htmlFor="new-gcust">Customer / Client name</label>
              <input
                id="new-gcust"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Rahul & Priya"
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="new-gtype">Event type</label>
              <select id="new-gtype" value={type} onChange={(e) => setType(e.target.value)}>
                <option>Wedding</option>
                <option>Baby shower</option>
                <option>Event</option>
                <option>Portrait session</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-gdate">Event date</label>
              <input
                id="new-gdate"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="new-gpass">Gallery password</label>
              <input
                id="new-gpass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Shared with client, e.g. rahul2026"
              />
            </div>
            <div className="field">
              <label htmlFor="new-gstatus">Initial status</label>
              <select
                id="new-gstatus"
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value)}
              >
                <option value="ACTIVE">Active (Accessible to customer)</option>
                <option value="DRAFT">Draft (Hidden from customer)</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>Photos</label>
            <div
              className={`dropzone ${dragOver ? "drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <div>
                <strong>Click to choose photos</strong>, or drag and drop them here.
              </div>
              <div style={{ marginTop: 6 }}>
                Upload high-resolution client photos — full pristine quality preserved.
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="file-chip-row">
              {files.map((f, i) => (
                <div key={i} className="file-chip">
                  {f.name}
                </div>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={createGallery}>
            {busy ? (uploadProgress?.text || "Uploading…") : "Create gallery & upload"}
          </button>
        </div>

        {/* Client Galleries Management Panel */}
        <div className="panel">
          <div className="section-title">
            <h2>CLIENT GALLERY</h2>
            <span>
              {galleries.filter((g) => (g.status || "ACTIVE") !== "COMPLETED").length} active ·{" "}
              {galleries.filter((g) => (g.status || "ACTIVE") === "COMPLETED").length} completed
            </span>
          </div>

          {/* Mobile Tab Switcher */}
          <div className="mobile-client-tabs" role="tablist" aria-label="Client gallery tabs">
            <button
              type="button"
              role="tab"
              aria-selected={mobileClientTab === "CURRENT"}
              className={`mobile-tab-btn ${mobileClientTab === "CURRENT" ? "active" : ""}`}
              onClick={() => setMobileClientTab("CURRENT")}
            >
              Current Clients
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileClientTab === "COMPLETED"}
              className={`mobile-tab-btn ${mobileClientTab === "COMPLETED" ? "active" : ""}`}
              onClick={() => setMobileClientTab("COMPLETED")}
            >
              Completed Clients
            </button>
          </div>

          {/* Search, Filter & Sort Toolbar */}
          <div className={`toolbar ${mobileClientTab === "COMPLETED" ? "mobile-hide-on-completed" : ""}`}>
            <div className="toolbar-search">
              <input
                type="text"
                placeholder="Search by client name, gallery, or code…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="toolbar-filters">
              {[
                { id: "ALL", label: "All" },
                { id: "DRAFT", label: "Draft" },
                { id: "SELECTION_SUBMITTED", label: "Selection Submitted" },
                { id: "NOT_SELECTED_YET", label: "Not Selected Yet" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  className={`filter-btn ${statusFilter === tab.id ? "active" : ""}`}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              className="toolbar-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="photos">Most Photos</option>
              <option value="selected">Most Selected</option>
            </select>
          </div>

          {/* Two-Column Client Management Grid */}
          <div
            className={`client-management-grid mobile-show-${mobileClientTab.toLowerCase()}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* COLUMN 1: CURRENT CLIENTS */}
            <div className="client-col-current">
              <div className="client-col-header">
                <h3>CURRENT CLIENTS</h3>
                <span>
                  {
                    galleries
                      .filter((g) => (g.status || "ACTIVE") !== "COMPLETED")
                      .filter((g) => {
                        const st = g.status || "ACTIVE";
                        const isSub = g.selectionStatus === "SUBMITTED" || st === "SELECTION_SUBMITTED";
                        if (statusFilter === "DRAFT") return st === "DRAFT";
                        if (statusFilter === "SELECTION_SUBMITTED") return isSub;
                        if (statusFilter === "NOT_SELECTED_YET") return !isSub && st !== "DRAFT";
                        return true;
                      })
                      .filter((g) => {
                        if (searchQuery.trim()) {
                          const q = searchQuery.toLowerCase().trim();
                          const nameMatch = (g.name || "").toLowerCase().includes(q);
                          const custMatch = (g.customerName || "").toLowerCase().includes(q);
                          const codeMatch = (g.code || "").toLowerCase().includes(q);
                          if (!nameMatch && !custMatch && !codeMatch) return false;
                        }
                        return true;
                      }).length
                  }{" "}
                  clients
                </span>
              </div>

              {(() => {
                const currentFiltered = galleries
                  .filter((g) => (g.status || "ACTIVE") !== "COMPLETED")
                  .filter((g) => {
                    const st = g.status || "ACTIVE";
                    const isSub = g.selectionStatus === "SUBMITTED" || st === "SELECTION_SUBMITTED";
                    if (statusFilter === "DRAFT") return st === "DRAFT";
                    if (statusFilter === "SELECTION_SUBMITTED") return isSub;
                    if (statusFilter === "NOT_SELECTED_YET") return !isSub && st !== "DRAFT";
                    return true;
                  })
                  .filter((g) => {
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase().trim();
                      const nameMatch = (g.name || "").toLowerCase().includes(q);
                      const custMatch = (g.customerName || "").toLowerCase().includes(q);
                      const codeMatch = (g.code || "").toLowerCase().includes(q);
                      if (!nameMatch && !custMatch && !codeMatch) return false;
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    if (sortBy === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
                    if (sortBy === "oldest") return (a.createdAt || 0) - (b.createdAt || 0);
                    if (sortBy === "name_asc") return (a.name || "").localeCompare(b.name || "");
                    if (sortBy === "name_desc") return (b.name || "").localeCompare(a.name || "");
                    if (sortBy === "photos") return (b.photoCount || 0) - (a.photoCount || 0);
                    if (sortBy === "selected") return (b.selectionCount || 0) - (a.selectionCount || 0);
                    return 0;
                  });

                if (currentFiltered.length === 0) {
                  return (
                    <div className="empty">
                      {galleries.filter((g) => (g.status || "ACTIVE") !== "COMPLETED").length === 0
                        ? "No current clients yet — create a gallery above to get started."
                        : "No current clients match your search or filter."}
                    </div>
                  );
                }

                return (
                  <div className="client-list-wrap">
                    {currentFiltered.map((g) => {
                      const st = g.status || "ACTIVE";
                      const isSubmitted = g.selectionStatus === "SUBMITTED" || st === "SELECTION_SUBMITTED";
                      const isDraft = st === "DRAFT";
                      const displayName = g.customerName ? g.customerName : g.name;
                      const subName = g.customerName && g.name !== g.customerName ? g.name : "";

                      return (
                        <div key={g.id} className="client-row">
                          <div className="client-info">
                            <div className="client-name">{displayName}</div>
                            <div className="client-sub">
                              {subName && <span>{subName} · </span>}
                              <span>{g.type}</span>
                              <span>·</span>
                              <span>{g.photoCount || 0} photos</span>
                              <span>·</span>
                              <span>
                                Code <code>{g.code}</code>
                              </span>
                              {g.eventDate && (
                                <>
                                  <span>·</span>
                                  <span>{g.eventDate}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="client-actions">
                            {isSubmitted ? (
                              <span className="status-squircle status-squircle-green">
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
                            ) : isDraft ? (
                              <span className="status-squircle status-squircle-draft">Draft</span>
                            ) : (
                              <span className="status-squircle status-squircle-muted">
                                Not Selected Yet
                              </span>
                            )}

                            <Link
                              href={`/studio/${g.id}`}
                              className="btn btn-primary"
                              style={{ padding: "8px 18px", fontSize: "12px" }}
                            >
                              View
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* COLUMN 2: COMPLETED */}
            <div className="client-col-completed">
              <div className="completed-panel">
                <div className="client-col-header">
                  <h3>COMPLETED CLIENTS</h3>
                  <span>
                    {galleries.filter((g) => (g.status || "ACTIVE") === "COMPLETED").length}
                  </span>
                </div>

                {(() => {
                  const completed = galleries.filter((g) => (g.status || "ACTIVE") === "COMPLETED");
                  if (completed.length === 0) {
                    return (
                      <div className="empty" style={{ padding: "20px 14px" }}>
                        No completed clients yet.
                      </div>
                    );
                  }
                  return (
                    <ul className="completed-list">
                      {completed.map((g) => {
                        const title = g.customerName
                          ? `${g.customerName}${g.name && g.name !== g.customerName ? ` (${g.name})` : ""}`
                          : g.name;
                        return (
                          <li key={g.id} className="completed-item">
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <span className="completed-dot" />
                              <span
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {title}
                              </span>
                            </div>
                            <Link
                              href={`/studio/${g.id}`}
                              className="btn btn-ghost"
                              style={{ padding: "4px 8px", fontSize: "11px", flexShrink: 0 }}
                            >
                              View
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
