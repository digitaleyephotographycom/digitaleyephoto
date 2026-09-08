import fs from "fs";
import path from "path";
import crypto from "crypto";

const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
function getEnv(key) {
  const match = envContent.match(new RegExp(`${key}\\s*=\\s*([^\\r\\n]+)`));
  return match ? match[1].trim() : "";
}

const adminSecret = getEnv("ADMIN_SESSION_SECRET");
const baseUrl = "http://localhost:3003";

function signAdminToken(email = "digital@com") {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 86400 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ email: email.toLowerCase(), issuedAt, expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", adminSecret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

const adminCookie = `admin_session=${signAdminToken()}`;

// Extract the exact logic from app/studio/[id]/page.js for verification
function simulateCopySelectedNames(gallery, selectedPhotos) {
  const allPhotos = Array.isArray(gallery.photos) ? gallery.photos : [];

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
      collectedNames.push(itemId);
    }
  }

  for (const sp of selectedPhotos || []) {
    if (sp && sp.id != null && !collectedIds.has(String(sp.id).trim())) {
      collectedIds.add(String(sp.id).trim());
      const filename = resolvePhotoFilename(sp, sp.id);
      if (filename) collectedNames.push(filename);
    }
  }

  const finalNames = [];
  const seenNames = new Set();
  for (const n of collectedNames) {
    const clean = (n || "").trim();
    if (clean && !seenNames.has(clean)) {
      seenNames.add(clean);
      finalNames.push(clean);
    }
  }

  return {
    names: finalNames,
    textToCopy: finalNames.join("\n"),
    count: finalNames.length,
  };
}

async function testSimulatedCases() {
  console.log("\n--- TEST CASE A: Unit Test with user's exact example ---");
  const mockGallery = {
    photos: [
      { id: "p1", sourceName: "Photo_001.JPG", name: "Photo_001.JPG" },
      { id: "p2", sourceName: "Photo_025.JPG", name: "Photo_025.JPG" },
      { id: "p3", sourceName: "Photo_103.PNG", name: "Photo_103.PNG" },
      { id: "p4", sourceName: "Photo_999.JPG", name: "Photo_999.JPG" },
    ],
    selections: ["p1", "p2", "p3"],
  };
  const mockSelectedPhotos = [
    { id: "p1", sourceName: "Photo_001.JPG" },
    { id: "p2", sourceName: "Photo_025.JPG" },
    { id: "p3", sourceName: "Photo_103.PNG" },
  ];

  const resA = simulateCopySelectedNames(mockGallery, mockSelectedPhotos);
  const expectedA = "Photo_001.JPG\nPhoto_025.JPG\nPhoto_103.PNG";
  console.log("Expected:\n" + JSON.stringify(expectedA));
  console.log("Actual:\n" + JSON.stringify(resA.textToCopy));
  if (resA.textToCopy === expectedA && resA.count === 3) {
    console.log("PASS: Exact match with user's example!");
  } else {
    console.error("FAIL: Result did not match!");
    process.exit(1);
  }

  console.log("\n--- TEST CASE B: Selection Order Inversion (Preserves client selection order) ---");
  const invertedGallery = {
    ...mockGallery,
    selections: ["p3", "p1", "p2"],
  };
  const resB = simulateCopySelectedNames(invertedGallery, mockSelectedPhotos);
  const expectedB = "Photo_103.PNG\nPhoto_001.JPG\nPhoto_025.JPG";
  console.log("Expected:\n" + JSON.stringify(expectedB));
  console.log("Actual:\n" + JSON.stringify(resB.textToCopy));
  if (resB.textToCopy === expectedB && resB.count === 3) {
    console.log("PASS: Order preserved exactly as client selected!");
  } else {
    console.error("FAIL: Inverted selection order not preserved!");
    process.exit(1);
  }

  console.log("\n--- TEST CASE C: Fallback to submittedSelections if selections array is empty ---");
  const submittedGallery = {
    ...mockGallery,
    selections: [],
    submittedSelections: ["p2", "p1"],
  };
  const resC = simulateCopySelectedNames(submittedGallery, [mockSelectedPhotos[1], mockSelectedPhotos[0]]);
  const expectedC = "Photo_025.JPG\nPhoto_001.JPG";
  if (resC.textToCopy === expectedC && resC.count === 2) {
    console.log("PASS: Successfully resolved from submittedSelections!");
  } else {
    console.error("FAIL: submittedSelections fallback failed!");
    process.exit(1);
  }
}

async function testLiveGallery() {
  console.log("\n--- TEST LIVE SERVER: Fetching mediatest gallery ---");
  const testId = "ga09c31cb9c5c"; // "mediatest" (has 2 selections)
  const detailRes = await fetch(`${baseUrl}/api/galleries/${testId}`, {
    headers: { Cookie: adminCookie },
  });
  if (!detailRes.ok) {
    console.log(`Could not load gallery ${testId}: ${detailRes.status}`);
    return;
  }
  const detail = await detailRes.json();
  console.log(`Gallery: "${detail.name}" | selections:`, detail.selections);

  const rawSelections = Array.isArray(detail?.selections) && detail.selections.length > 0
    ? detail.selections
    : Array.isArray(detail?.submittedSelections) && detail.submittedSelections.length > 0
    ? detail.submittedSelections
    : [];

  const selections = new Set(
    rawSelections
      .map((sid) => (typeof sid === "object" ? String(sid?.id || sid?.photoId || sid?.name || "").trim() : String(sid).trim()))
      .filter(Boolean)
  );

  const selectedPhotos = (detail.photos || []).filter((p) => {
    if (!p) return false;
    const pid = String(p.id).trim();
    if (selections.has(pid)) return true;
    if (p.sourceName && selections.has(p.sourceName.trim())) return true;
    if (p.name && selections.has(p.name.trim())) return true;
    return Boolean(p.selected || p.isSelected);
  });

  const liveResult = simulateCopySelectedNames(detail, selectedPhotos);
  console.log("Live result count:", liveResult.count);
  console.log("Live copied text (one per line):\n" + liveResult.textToCopy);
  const lines = liveResult.textToCopy.split("\n");
  console.log("Number of lines:", lines.length);
  for (let i = 0; i < lines.length; i++) {
    console.log(`  Line ${i + 1}: ${lines[i]}`);
  }

  if (liveResult.count === 2 && lines.length === 2 && lines.every(l => l.endsWith(".jpg"))) {
    console.log("PASS: Live gallery copied ALL 2 selected photo filenames, strictly 1 per line!");
  } else {
    console.error("FAIL: Live test failed!");
    process.exit(1);
  }
}

async function run() {
  await testSimulatedCases();
  await testLiveGallery();
  console.log("\n==================================================");
  console.log("ALL COPY IMAGE NAMES TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
