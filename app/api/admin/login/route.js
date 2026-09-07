import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signAdminToken, setAdminCookie, getAdminPasswordHash } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();
    const identifier = (body?.email || body?.username || "").trim();
    const password = (body?.password || "").trim();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Invalid admin credentials." },
        { status: 401 }
      );
    }

    const configuredEmail = (process.env.ADMIN_EMAIL || "").trim();
    const configuredHash = getAdminPasswordHash();

    if (!configuredEmail || !configuredHash) {
      console.error("Admin credentials not configured in environment variables.");
      return NextResponse.json(
        { error: "Admin authentication is not configured on the server." },
        { status: 500 }
      );
    }

    // Verify email/username matches configured admin identity
    const emailMatch =
      identifier.toLowerCase() === configuredEmail.toLowerCase() ||
      identifier.toLowerCase() === configuredEmail.split("@")[0].toLowerCase();

    if (!emailMatch) {
      return NextResponse.json(
        { error: "Invalid admin credentials." },
        { status: 401 }
      );
    }

    // Verify password against secure bcrypt hash or configured password
    let isValid = false;
    if (configuredHash.startsWith("$2")) {
      isValid = await bcrypt.compare(password, configuredHash);
    } else {
      isValid = (password === configuredHash);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid admin credentials." },
        { status: 401 }
      );
    }

    // Create session token and set secure HttpOnly cookie
    const token = signAdminToken(configuredEmail, 60 * 60 * 24);
    const res = NextResponse.json({ ok: true });
    setAdminCookie(res, token, 60 * 60 * 24);

    return res;
  } catch (err) {
    console.error("Admin login error:", err);
    return NextResponse.json(
      { error: "An error occurred during authentication." },
      { status: 500 }
    );
  }
}
