import fs from "fs";
import path from "path";
import crypto from "crypto";

const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
function getEnv(key) {
  const match = envContent.match(new RegExp(`${key}\\s*=\\s*([^\\r\\n]+)`));
  return match ? match[1].trim() : "";
}

const adminSecret = getEnv("ADMIN_SESSION_SECRET");

function signAdminToken(email = "digital@com") {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 86400 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ email: email.toLowerCase(), issuedAt, expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", adminSecret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

const baseUrl = "http://localhost:3003";
const adminCookie = `admin_session=${signAdminToken()}`;

async function main() {
  const listRes = await fetch(`${baseUrl}/api/galleries`, {
    headers: { Cookie: adminCookie },
  });
  const listData = await listRes.json();
  console.log("Galleries count:", listData.galleries?.length);

  for (const g of listData.galleries || []) {
    const dRes = await fetch(`${baseUrl}/api/galleries/${g.id}`, {
      headers: { Cookie: adminCookie },
    });
    if (!dRes.ok) {
      console.log(`Gallery ${g.id} failed to load: ${dRes.status}`);
      continue;
    }
    const d = await dRes.json();
    console.log(`\nGallery: "${d.name}" (${d.id})`);
    console.log(`  selectionStatus:`, d.selectionStatus);
    console.log(`  selections (${d.selections?.length || 0}):`, d.selections);
    console.log(`  submittedSelections (${d.submittedSelections?.length || 0}):`, d.submittedSelections);
    console.log(`  photos (${d.photos?.length || 0}):`);
    for (const p of d.photos || []) {
      console.log(`    - ID: ${p.id} | name: "${p.name}" | sourceName: "${p.sourceName}"`);
    }
  }
}

main().catch(console.error);
