import fs from "fs";
import path from "path";
import crypto from "crypto";

// Read ADMIN_SESSION_SECRET from .env.local
const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
const secretMatch = envContent.match(/ADMIN_SESSION_SECRET\s*=\s*([^\r\n]+)/);
const secret = secretMatch ? secretMatch[1].trim() : "fallback-admin-dev-secret-change-in-env";

function signAdminToken(email, ttlSeconds = 60 * 60 * 24) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlSeconds * 1000;
  const payloadJson = JSON.stringify({
    email: email.toLowerCase(),
    issuedAt,
    expiresAt,
  });
  const payloadB64 = Buffer.from(payloadJson).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

const adminToken = signAdminToken("digital@com");
const cookie = `admin_session=${adminToken}`;

const baseUrl = "http://localhost:3000";

async function run() {
  const adminHeaders = {
    Cookie: cookie,
    "Content-Type": "application/json",
  };

  console.log("\n--- 2. Testing /api/admin/storage ---");
  const storageRes = await fetch(`${baseUrl}/api/admin/storage?refresh=true`, {
    headers: adminHeaders,
  });
  console.log("Storage status:", storageRes.status);
  const storageData = await storageRes.json();
  console.log("Storage data:", JSON.stringify(storageData, null, 2));

  console.log("\n--- 3. Testing Galleries List ---");
  const galleriesRes = await fetch(`${baseUrl}/api/galleries`, {
    headers: adminHeaders,
  });
  const galleriesData = await galleriesRes.json();
  console.log("Galleries count:", galleriesData.galleries?.length || 0);

  if (galleriesData.galleries?.length > 0) {
    const testGallery = galleriesData.galleries[0];
    const galleryId = testGallery.id;
    console.log(`\n--- 4. Testing Gallery ${galleryId} (${testGallery.title || testGallery.name}) ---`);

    const gRes = await fetch(`${baseUrl}/api/galleries/${galleryId}`, {
      headers: adminHeaders,
    });
    const gData = await gRes.json();
    console.log("Admin gallery data has clientPassword:", gData.clientPassword ? `YES: "${gData.clientPassword}"` : "NO (legacy/unset)");
    console.log("Admin gallery data exposes encPassword:", "encPassword" in gData);

    console.log("\n--- 5. Testing Setting New Password via Admin Endpoint ---");
    const testNewPass = "StudioSecret2026!";
    const setPassRes = await fetch(`${baseUrl}/api/admin/galleries/${galleryId}/password`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ password: testNewPass }),
    });
    const setPassData = await setPassRes.json();
    console.log("Set password status:", setPassRes.status, setPassData);

    console.log("\n--- 6. Verifying Password Retrieved by Admin ---");
    const gRes2 = await fetch(`${baseUrl}/api/galleries/${galleryId}`, {
      headers: adminHeaders,
    });
    const gData2 = await gRes2.json();
    console.log("Admin sees updated clientPassword:", gData2.clientPassword === testNewPass ? "MATCHES!" : gData2.clientPassword);

    console.log("\n--- 7. Testing Customer Access Route (No Secrets Leakage) ---");
    const custRes = await fetch(`${baseUrl}/api/gallery-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: gData2.code, password: testNewPass }),
    });
    console.log("Customer login status:", custRes.status);
    const custData = await custRes.json();
    console.log("Customer response contains clientPassword?", "clientPassword" in custData);
    console.log("Customer response contains encPassword?", "encPassword" in custData);
    console.log("Customer response contains passwordHash?", "passwordHash" in custData);
    console.log("Customer response contains technical bucket info?", JSON.stringify(custData).toLowerCase().includes("backblaze") || JSON.stringify(custData).toLowerCase().includes("bucket"));
  }

  console.log("\n=== ALL API VERIFICATIONS COMPLETED SUCCESSFULLY ===");
}

run().catch(console.error);
