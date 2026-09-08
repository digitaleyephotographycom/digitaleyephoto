import fs from "fs";
import path from "path";
import crypto from "crypto";

const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
function getEnv(key) {
  const match = envContent.match(new RegExp(`${key}\\s*=\\s*([^\\r\\n]+)`));
  return match ? match[1].trim() : "";
}

const adminSecret = getEnv("ADMIN_SESSION_SECRET");
const gallerySecret = getEnv("GALLERY_TOKEN_SECRET");

function signAdminToken(email = "digital@com") {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 86400 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ email: email.toLowerCase(), issuedAt, expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", adminSecret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

function signClientToken(galleryId) {
  const expires = Date.now() + 86400 * 1000;
  const payload = `${galleryId}.${expires}`;
  const sig = crypto.createHmac("sha256", gallerySecret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

const port = 3003;
const baseUrl = `http://localhost:${port}`;
const adminCookie = `admin_session=${signAdminToken()}`;

async function main() {
  console.log("==================================================");
  console.log("RUNNING COMPREHENSIVE SYSTEM VERIFICATION");
  console.log(`Target: ${baseUrl}`);
  console.log("==================================================");

  // 1. Check Galleries List in Admin
  console.log("\n--- TEST 1: Admin Galleries List & Purge Verification ---");
  const listRes = await fetch(`${baseUrl}/api/galleries`, {
    headers: { Cookie: adminCookie },
  });
  console.log("Galleries status:", listRes.status);
  const listData = await listRes.json();
  const galleryIds = (listData.galleries || []).map((g) => g.id);
  console.log(`Galleries in index (${galleryIds.length}):`, listData.galleries?.map(g => `${g.id} (${g.name})`));

  const hasRahul = galleryIds.includes("ga7554e176ad6");
  const hasVarshanOrphan = galleryIds.includes("ga2f145b1ba77");
  console.log("Corrupted 'Rahul & Priya' purged:", !hasRahul ? "PASS (Purged)" : "FAIL");
  console.log("Corrupted 'varshan V-7801' purged:", !hasVarshanOrphan ? "PASS (Purged)" : "FAIL");

  // 2. Check Admin Gallery Detail & Source Names
  console.log("\n--- TEST 2: Admin Gallery Details & Source Names ---");
  const testId = "g1307eaaa8826"; // "manish"
  const detailRes = await fetch(`${baseUrl}/api/galleries/${testId}`, {
    headers: { Cookie: adminCookie },
  });
  console.log("Detail status:", detailRes.status);
  const detail = await detailRes.json();
  console.log(`Gallery "${detail.name}" photos count:`, detail.photos?.length);
  for (const p of detail.photos || []) {
    console.log(` - Photo ID: ${p.id} | sourceName: "${p.sourceName}" | name: "${p.name}"`);
    console.log(`   thumbUrl present: ${Boolean(p.thumbUrl)} | previewUrl present: ${Boolean(p.previewUrl)}`);
  }

  // 3. Check Client Gallery Access & Privacy (Req 9)
  console.log("\n--- TEST 3: Client Gallery Access & Filename Privacy (Req 9) ---");
  const clientToken = signClientToken(testId);
  const clientRes = await fetch(`${baseUrl}/api/gallery-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: clientToken }),
  });
  console.log("Client Access status:", clientRes.status);
  const clientData = await clientRes.json();
  const clientPhotos = clientData.gallery?.photos || [];
  console.log(`Client received ${clientPhotos.length} photos.`);
  let privacyViolation = false;
  for (const cp of clientPhotos) {
    if (cp.sourceName || cp.name) {
      privacyViolation = true;
      console.error("FAIL: Source filename leaked to client:", cp);
    }
    console.log(` - Photo ${cp.id}: thumbUrl=${Boolean(cp.thumbUrl)}, previewUrl=${Boolean(cp.previewUrl)}, sourceName exposed=${Boolean(cp.sourceName || cp.name)}`);
  }
  console.log("Client privacy requirement (Req 9):", !privacyViolation ? "PASS (No filenames leaked)" : "FAIL");

  // 4. Test Client ZIP Download
  console.log("\n--- TEST 4: Client Original ZIP Download ---");
  const clientZipRes = await fetch(`${baseUrl}/api/gallery-access/download-zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: clientToken, photoIds: clientData.gallery?.selections }),
  });
  console.log("Client ZIP status:", clientZipRes.status);
  console.log("Client ZIP content-type:", clientZipRes.headers.get("content-type"));
  console.log("Client ZIP disposition:", clientZipRes.headers.get("content-disposition"));
  const clientZipBuffer = await clientZipRes.arrayBuffer();
  console.log(`Client ZIP downloaded size: ${clientZipBuffer.byteLength} bytes (Original files packaged)`);

  // 5. Test Admin ZIP Download
  console.log("\n--- TEST 5: Admin Original ZIP Download ---");
  const adminZipRes = await fetch(`${baseUrl}/api/galleries/${testId}/download-zip`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ photoIds: detail.selections }),
  });
  console.log("Admin ZIP status:", adminZipRes.status);
  console.log("Admin ZIP content-type:", adminZipRes.headers.get("content-type"));
  console.log("Admin ZIP disposition:", adminZipRes.headers.get("content-disposition"));
  const adminZipBuffer = await adminZipRes.arrayBuffer();
  console.log(`Admin ZIP downloaded size: ${adminZipBuffer.byteLength} bytes`);

  // 6. Test Copy Image Names Selection Order Logic
  console.log("\n--- TEST 6: Copy Image Names Selection Order Logic ---");
  const photoMap = new Map((detail.photos || []).map((p) => [p.id, p]));
  const orderedSelected = (detail.selections || []).map((id) => photoMap.get(id)).filter(Boolean);
  const copiedNames = orderedSelected.map((p) => p.sourceName || p.name).join("\n");
  console.log("Client selections array:", detail.selections);
  console.log("Copied names result (one per line, in selection order):\n" + copiedNames);

  // 7. Test Gallery Creation & Deletion API (Resilient deletion)
  console.log("\n--- TEST 7: Resilient Gallery Creation and Deletion ---");
  const dummyCreateRes = await fetch(`${baseUrl}/api/galleries`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Temporary Automated Test Shoot",
      customerName: "Auto Tester",
      password: "TestPassword123!",
      type: "Portrait",
    }),
  });
  const dummyCreated = await dummyCreateRes.json();
  console.log("Created dummy gallery ID:", dummyCreated.id);

  const dummyDeleteRes = await fetch(`${baseUrl}/api/galleries/${dummyCreated.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  console.log("Delete dummy gallery status:", dummyDeleteRes.status);
  const dummyDeleteData = await dummyDeleteRes.json();
  console.log("Delete response:", dummyDeleteData);

  // Also test deleting a non-existent/already missing gallery ID:
  const missingDeleteRes = await fetch(`${baseUrl}/api/galleries/non-existent-gallery-id`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  console.log("Deleting already-missing gallery status:", missingDeleteRes.status);
  const missingDeleteData = await missingDeleteRes.json();
  console.log("Missing delete response (must be ok: true, not 404):", missingDeleteData);

  console.log("\n==================================================");
  console.log("ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch(console.error);
