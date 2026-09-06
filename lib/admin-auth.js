import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "admin_session";

function getSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.GALLERY_TOKEN_SECRET ||
    "fallback-admin-dev-secret-change-in-env"
  );
}

let cachedAdminHash = null;

// Reliably resolve the configured admin bcrypt password hash.
// Next.js dotenv-expand may evaluate $ in .env as variables, so if process.env
// was truncated, read the raw unexpanded hash from .env.local as a fallback.
export function getAdminPasswordHash() {
  if (cachedAdminHash) return cachedAdminHash;

  const envHash = (process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (envHash.startsWith("$2") && envHash.length >= 59) {
    cachedAdminHash = envHash;
    return cachedAdminHash;
  }

  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("ADMIN_PASSWORD_HASH=")) {
          const raw = trimmed.slice("ADMIN_PASSWORD_HASH=".length).trim().replace(/^['"]|['"]$/g, "");
          if (raw.startsWith("$2")) {
            cachedAdminHash = raw;
            return cachedAdminHash;
          }
        }
      }
    }
  } catch {}

  return envHash;
}

// Generate a signed, tamper-proof session token for the authenticated admin
export function signAdminToken(email, ttlSeconds = 60 * 60 * 24) {
  const secret = getSecret();
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

// Verify admin session token integrity, signature, and expiration
export function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, sig] = parts;
    const secret = getSecret();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("hex");

    if (sig !== expectedSig) return null;

    const decodedJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const { email, expiresAt } = JSON.parse(decodedJson);

    if (Date.now() > Number(expiresAt)) return null;

    // Verify email matches configured admin email
    const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (configuredEmail && email.toLowerCase() !== configuredEmail) {
      return null;
    }

    return { ok: true, email };
  } catch {
    return null;
  }
}

// Extract admin token from request cookies or next/headers cookies
export function getAdminTokenFromRequest(req) {
  // 1. Try NextRequest cookie helper
  if (req?.cookies?.get) {
    const val = req.cookies.get(ADMIN_COOKIE_NAME);
    if (typeof val === "string") return val;
    if (val?.value) return val.value;
  }

  // 2. Try parsing Cookie header string
  if (req?.headers?.get) {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${ADMIN_COOKIE_NAME}=`));
      if (match) {
        return decodeURIComponent(match.slice(ADMIN_COOKIE_NAME.length + 1));
      }
    }
  }

  // 3. Fall back to next/headers cookies()
  try {
    const cookieStore = cookies();
    const val = cookieStore.get(ADMIN_COOKIE_NAME);
    if (val?.value) return val.value;
  } catch {
    // cookies() may not be available outside server request context
  }

  return null;
}

// Verify admin authentication for incoming request
export async function verifyAdminAuth(req) {
  const token = getAdminTokenFromRequest(req);
  return verifyAdminToken(token);
}

// Reusable server-side route guard for protecting admin API endpoints
export async function requireAdmin(req) {
  const auth = await verifyAdminAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized. Admin login required." },
      { status: 401 }
    );
  }
  return null;
}

// Set HttpOnly, SameSite=Lax, secure session cookie on Next.js response
export function setAdminCookie(response, token, ttlSeconds = 60 * 60 * 24) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
  return response;
}

// Clear the admin session cookie on logout
export function clearAdminCookie(response) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
