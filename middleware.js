import { NextResponse } from "next/server";

const ADMIN_COOKIE_NAME = "admin_session";

async function isValidAdminSession(token) {
  if (!token || typeof token !== "string") return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;

    const [payloadB64, sig] = parts;
    const secret =
      process.env.ADMIN_SESSION_SECRET ||
      process.env.GALLERY_TOKEN_SECRET ||
      "fallback-admin-dev-secret-change-in-env";

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const hexSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (sig !== hexSig) return false;

    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = atob(padded);
    const { expiresAt } = JSON.parse(decoded);

    return Date.now() <= Number(expiresAt);
  } catch {
    return false;
  }
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/studio/login";
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthenticated = await isValidAdminSession(token);

  // If accessing protected studio pages without valid session, redirect to login
  if (!isAuthenticated && !isLoginPage) {
    const loginUrl = new URL("/studio/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // If already logged in and visiting login page, redirect to studio dashboard
  if (isAuthenticated && isLoginPage) {
    const studioUrl = new URL("/studio", req.url);
    return NextResponse.redirect(studioUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/studio/:path*"],
};
