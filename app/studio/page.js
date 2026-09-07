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

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  function handleFiles(list) {
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  const [uploadProgress, setUploadProgress] = useState(null);

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

          const uploadRes = await fetch(item.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!uploadRes.ok) {
            throw new Error(`Failed to upload ${file.name} to storage.`);
          }

          completed++;
          const pct = Math.round((completed / files.length) * 100);
          setUploadProgress({ text: `Uploading ${completed} of ${files.length} (${pct}%)…` });

          uploadedPhotos.push({
            photoId: item.photoId,
            key: item.key,
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
          <button className="btn btn-ghost" onClick={handleLogout}>
            Logout
          </button>
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
            <span>Storage</span>
            <strong style={{ fontSize: 18 }}>Backblaze B2</strong>
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
                Originals upload directly to your Backblaze B2 bucket — full 4K quality kept.
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

        {/* Galleries List Panel */}
        <div className="panel">
          <div className="section-title">
            <h2>Your galleries</h2>
            <span>{filteredGalleries.length} of {galleries.length} total</span>
          </div>

          {/* Search, Filter & Sort Toolbar */}
          <div className="toolbar">
            <div className="toolbar-search">
              <input
                type="text"
                placeholder="Search by gallery name, customer, or code…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="toolbar-filters">
              {["ALL", "ACTIVE", "SELECTION_SUBMITTED", "COMPLETED", "DRAFT", "ARCHIVED"].map((st) => (
                <button
                  key={st}
                  className={`filter-btn ${statusFilter === st ? "active" : ""}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === "ALL" ? "All" : STATUS_LABELS[st] || st}
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

          <div className="gallery-list">
            {filteredGalleries.length === 0 && (
              <div className="empty">
                {galleries.length === 0
                  ? "No galleries yet — create one above to get a shareable link."
                  : "No galleries match your search or filter."}
              </div>
            )}
            {filteredGalleries.map((g) => {
              const st = g.status || "ACTIVE";
              return (
                <Link key={g.id} href={`/studio/${g.id}`} className="gcard">
                  <div className="cover">
                    {g.coverUrl ? <img src={g.coverUrl} alt="" /> : <span>No photos yet</span>}
                  </div>
                  {g.selectionCount > 0 && <div className="badge">{g.selectionCount} selected</div>}
                  <div className="meta">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span className={`status-badge status-${st}`}>
                        {STATUS_LABELS[st] || st}
                      </span>
                      {g.selectionLocked && (
                        <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>
                          🔒 Locked
                        </span>
                      )}
                    </div>
                    <h4>{g.name}</h4>
                    {g.customerName && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                        Client: <strong>{g.customerName}</strong>
                      </div>
                    )}
                    <div className="tag">
                      {g.type} · {g.photoCount || 0} photos · code <code>{g.code}</code>
                      {g.eventDate ? ` · ${g.eventDate}` : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="note-banner">
          <strong>How storage works here:</strong> full-resolution photos live in your Backblaze B2 bucket.
          Gallery details — name, hashed password, photo list, client selections — are kept as small JSON
          files in that same bucket, so there's no separate database to run.
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
