import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getGallery, saveGallery } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";
import { encryptPassword, decryptPassword } from "@/lib/crypto-pass";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    let password = null;
    let available = false;

    if (gallery.encPassword) {
      const decrypted = decryptPassword(gallery.encPassword);
      if (decrypted) {
        password = decrypted;
        available = true;
      }
    } else if (gallery.clientPassword) {
      password = gallery.clientPassword;
      available = true;
    }

    return NextResponse.json({
      available,
      password: available ? password : null,
    });
  } catch (err) {
    console.error("Failed to retrieve gallery password:", err);
    return NextResponse.json(
      { error: "Unable to retrieve password." },
      { status: 500 }
    );
  }
}

export async function POST(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const newPassword = (body?.password || "").trim();

    if (!newPassword) {
      return NextResponse.json(
        { error: "A valid password is required." },
        { status: 400 }
      );
    }

    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    // 1. Update authentication hash
    gallery.passwordHash = await bcrypt.hash(newPassword, 10);

    // 2. Encrypt and store password for Admin retrieval
    gallery.encPassword = encryptPassword(newPassword);
    delete gallery.clientPassword;

    // 3. Save gallery metadata
    await saveGallery(params.id, gallery);

    return NextResponse.json({
      ok: true,
      available: true,
      password: newPassword,
    });
  } catch (err) {
    console.error("Failed to update gallery password:", err);
    return NextResponse.json(
      { error: "Unable to update password." },
      { status: 500 }
    );
  }
}
