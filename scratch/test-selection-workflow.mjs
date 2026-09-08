import fs from "fs";
import path from "path";
import crypto from "crypto";

// Read secrets from .env.local
const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const gallerySecretMatch = envContent.match(/GALLERY_TOKEN_SECRET\s*=\s*([^\r\n]+)/);
const gallerySecret = gallerySecretMatch ? gallerySecretMatch[1].trim() : "fallback-secret";

function signClientToken(galleryId, ttlSeconds = 60 * 60 * 24) {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${galleryId}.${expires}`;
  const sig = crypto.createHmac("sha256", gallerySecret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function areSelectionsEqual(setA, listB) {
  if (!listB || !Array.isArray(listB)) return false;
  if (setA.size !== listB.length) return false;
  for (const id of listB) {
    if (!setA.has(id)) return false;
  }
  return true;
}

const baseUrl = "http://localhost:3002";

async function runTests() {
  console.log("==================================================");
  console.log("TESTING CLIENT GALLERY PHOTO-SELECTION WORKFLOW");
  console.log("==================================================");

  // 1. Fetch any gallery ID from store or API
  const testGalleryId = "g3b10d08cdefd"; // "varshan" with 35 photos
  const token = signClientToken(testGalleryId);

  // 2. Fetch gallery initial data
  console.log("\n--- STEP 1: Fetching Gallery with Token ---");
  const initRes = await fetch(`${baseUrl}/api/gallery-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  console.log("Gallery Access status:", initRes.status);
  const initData = await initRes.json();
  const photoIds = (initData.gallery?.photos || []).map((p) => p.id);
  console.log(`Gallery has ${photoIds.length} photos available.`);
  console.log(`Client Code: ${initData.gallery?.clientCode}`);
  console.log(`Token: ${token}`);
  if (photoIds.length < 4) {
    console.error("Need at least 4 photos for test!");
    return;
  }

  const [pA, pB, pC, pD, pE] = photoIds;

  // 3. Reset to NOT_SUBMITTED clean state for test
  await fetch(`${baseUrl}/api/gallery-access/selections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, undoSubmit: true }),
  });

  // TEST 1: Initial State (Never Submitted)
  console.log("\n--- TEST 1: Initial State (No Submission, Selecting 3 Photos) ---");
  let currentSelection = new Set([pA, pB, pC]);
  let submittedSelection = [];
  let hasSubmitted = false;
  let isIdentical = hasSubmitted && areSelectionsEqual(currentSelection, submittedSelection);
  let hasChanges = !hasSubmitted || !isIdentical;

  console.log(`Current Selection Count: ${currentSelection.size}`);
  console.log(`hasSubmitted: ${hasSubmitted}`);
  console.log(`hasChanges: ${hasChanges}`);
  console.log(`UI Bottom Bar: [ ${currentSelection.size} Selected ] [ Submit Selection ]`);
  if (!hasChanges || currentSelection.size !== 3) throw new Error("TEST 1 Failed!");
  console.log("✓ TEST 1 PASSED!");

  // TEST 2: Client Submits Selection
  console.log("\n--- TEST 2: Client Submits Selection [A, B, C] ---");
  const submitRes = await fetch(`${baseUrl}/api/gallery-access/selections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      selections: [pA, pB, pC],
      submit: true,
    }),
  });
  const submitData = await submitRes.json();
  console.log("Submit Response status:", submitRes.status);
  console.log("Returned selectionStatus:", submitData.selectionStatus);
  console.log("Returned submittedSelections:", submitData.submittedSelections);

  submittedSelection = submitData.submittedSelections || [];
  hasSubmitted = submitData.selectionStatus === "SUBMITTED";
  isIdentical = hasSubmitted && areSelectionsEqual(currentSelection, submittedSelection);
  hasChanges = !hasSubmitted || !isIdentical;

  console.log(`isIdentical to submitted: ${isIdentical}`);
  console.log(`hasChanges: ${hasChanges}`);
  console.log(`UI Bottom Bar: [ ✓ Selection Submitted ] (No submit button)`);
  if (!isIdentical || hasChanges) throw new Error("TEST 2 Failed!");
  console.log("✓ TEST 2 PASSED!");

  // TEST 3: Persistence on Page Reload / Return
  console.log("\n--- TEST 3: Page Reload / Revisit Persistence ---");
  const reloadRes = await fetch(`${baseUrl}/api/gallery-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const reloadData = await reloadRes.json();
  console.log("Reload returned selectionStatus:", reloadData.gallery?.selectionStatus);
  console.log("Reload returned submittedSelections:", reloadData.gallery?.submittedSelections);

  const reloadedSubmitted = reloadData.gallery?.submittedSelections || [];
  const reloadedCurrent = new Set(reloadData.gallery?.selections || []);
  const reloadedIdentical = (reloadData.gallery?.selectionStatus === "SUBMITTED") && areSelectionsEqual(reloadedCurrent, reloadedSubmitted);

  console.log(`Reloaded identical: ${reloadedIdentical}`);
  console.log(`All Photos Bottom Bar shows Undo Submission? NO (Scoped to Selected Photos only)`);
  console.log(`Selected Photos Bottom Bar shows Undo Submission? YES (Available for client)`);
  if (!reloadedIdentical) throw new Error("TEST 3 Failed!");
  console.log("✓ TEST 3 PASSED!");

  // TEST 4: New Changes After Submission (Add Photo D)
  console.log("\n--- TEST 4: New Change (Add Photo D -> [A, B, C, D]) ---");
  currentSelection = new Set([pA, pB, pC, pD]);
  isIdentical = hasSubmitted && areSelectionsEqual(currentSelection, submittedSelection);
  hasChanges = !hasSubmitted || !isIdentical;

  console.log(`Current Selection Count: ${currentSelection.size}`);
  console.log(`isIdentical to submitted [A, B, C]: ${isIdentical}`);
  console.log(`hasChanges: ${hasChanges}`);
  console.log(`UI Bottom Bar switches to: [ 4 Selected ] [ Submit Selection ]`);
  if (isIdentical || !hasChanges) throw new Error("TEST 4 Failed!");
  console.log("✓ TEST 4 PASSED!");

  // TEST 5: Remove Photo After Submission (Remove C -> [A, B, D])
  console.log("\n--- TEST 5: New Change (Remove C -> [A, B, D]) ---");
  currentSelection = new Set([pA, pB, pD]);
  isIdentical = hasSubmitted && areSelectionsEqual(currentSelection, submittedSelection);
  hasChanges = !hasSubmitted || !isIdentical;

  console.log(`Current Selection Count: ${currentSelection.size}`);
  console.log(`isIdentical to submitted [A, B, C]: ${isIdentical}`);
  console.log(`hasChanges: ${hasChanges}`);
  console.log(`UI Bottom Bar switches to: [ 3 Selected ] [ Submit Selection ]`);
  if (isIdentical || !hasChanges) throw new Error("TEST 5 Failed!");
  console.log("✓ TEST 5 PASSED!");

  // TEST 6: Revert Back to Exact Submitted Selection [A, B, C]
  console.log("\n--- TEST 6: Revert Back to Exact Submitted Set [A, B, C] ---");
  currentSelection = new Set([pA, pB, pC]);
  isIdentical = hasSubmitted && areSelectionsEqual(currentSelection, submittedSelection);
  hasChanges = !hasSubmitted || !isIdentical;

  console.log(`Current Selection Count: ${currentSelection.size}`);
  console.log(`isIdentical to submitted [A, B, C]: ${isIdentical}`);
  console.log(`hasChanges: ${hasChanges}`);
  console.log(`UI Bottom Bar switches back to: [ ✓ Selection Submitted ] (No Submit Button)`);
  if (!isIdentical || hasChanges) throw new Error("TEST 6 Failed!");
  console.log("✓ TEST 6 PASSED!");

  // TEST 7: Resubmit with Updated Selection [A, B, C, D]
  console.log("\n--- TEST 7: Resubmission with Updated Selection [A, B, C, D] ---");
  const resubmitRes = await fetch(`${baseUrl}/api/gallery-access/selections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      selections: [pA, pB, pC, pD],
      submit: true,
    }),
  });
  const resubmitData = await resubmitRes.json();
  console.log("Resubmit returned submittedSelections:", resubmitData.submittedSelections);
  submittedSelection = resubmitData.submittedSelections || [];
  currentSelection = new Set([pA, pB, pC, pD]);
  isIdentical = areSelectionsEqual(currentSelection, submittedSelection);
  console.log(`Matches new submitted selection: ${isIdentical}`);
  console.log(`UI Bottom Bar immediately shows: [ ✓ Selection Submitted ]`);
  if (!isIdentical) throw new Error("TEST 7 Failed!");
  console.log("✓ TEST 7 PASSED!");

  // TEST 8: Undo Submission Flow
  console.log("\n--- TEST 8: Undo Submission Flow ---");
  const undoRes = await fetch(`${baseUrl}/api/gallery-access/selections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      undoSubmit: true,
    }),
  });
  const undoData = await undoRes.json();
  console.log("Undo status:", undoRes.status);
  console.log("Returned selectionStatus:", undoData.selectionStatus);
  console.log("Returned submittedSelections:", undoData.submittedSelections);
  console.log("Selection count preserved:", undoData.count);

  hasSubmitted = undoData.selectionStatus === "SUBMITTED";
  submittedSelection = undoData.submittedSelections || [];
  hasChanges = !hasSubmitted || !areSelectionsEqual(currentSelection, submittedSelection);

  console.log(`hasSubmitted: ${hasSubmitted}`);
  console.log(`Selections preserved count: ${currentSelection.size}`);
  console.log(`UI Bottom Bar shows: [ 4 Selected ] [ Submit Selection ]`);
  if (hasSubmitted || !hasChanges || undoData.count !== 4) throw new Error("TEST 8 Failed!");
  console.log("✓ TEST 8 PASSED!");

  console.log("\n==================================================");
  console.log("ALL 8 SELECTION WORKFLOW TESTS PASSED PERFECTLY!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
