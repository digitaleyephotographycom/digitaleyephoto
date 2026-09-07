import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getIndex, saveIndex, saveGallery } from "@/lib/store";
import { newId, genCode } from "@/lib/ids";
import { signedUrlFor } from "@/lib/b2";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const index = await getIndex();
    const galleries = await Promise.all(
      (index.galleries || []).map(async (g) => {
        let coverUrl = null;
        if (g.coverThumbKey) {
          try {
            coverUrl = await signedUrlFor(g.coverThumbKey, 7200);
          } catch {
            coverUrl = null;
          }
        } else if (g.coverKey) {
          coverUrl = `/api/photos/thumb?key=${encodeURIComponent(g.coverKey)}&w=450`;
        }
        return {
          ...g,
          coverUrl,
        };
      })
    );
    return NextResponse.json({ ...index, galleries });
  } catch (err) {
    console.error("Failed to load galleries index:", err);
    return NextResponse.json(
      { error: err?.message || "Could not load galleries." },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { name, customerName, type, eventDate, password, status } = body || {};

    if (!name?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: "Name and password are required." },
        { status: 400 }
      );
    }

    const id = newId("g");
    const code = genCode(name);
    const passwordHash = await bcrypt.hash(password, 10);

    const validStatus = ["DRAFT", "ACTIVE", "SELECTION_SUBMITTED", "COMPLETED", "ARCHIVED"].includes(status)
      ? status
      : "ACTIVE";

    const gallery = {
      id,
      code,
      name: name.trim(),
      customerName: (customerName || "").trim(),
      type: type || "Wedding",
      eventDate: (eventDate || "").trim(),
      status: validStatus,
      selectionStatus: "NOT_SUBMITTED",
      selectionLocked: false,
      selectionSubmittedAt: null,
      passwordHash,
      photos: [],
      selections: [],
      createdAt: Date.now(),
    };
    await saveGallery(id, gallery);

    const index = await getIndex();
    index.galleries.unshift({
      id,
      code,
      name: gallery.name,
      customerName: gallery.customerName,
      type: gallery.type,
      eventDate: gallery.eventDate,
      status: gallery.status,
      selectionStatus: gallery.selectionStatus,
      selectionLocked: gallery.selectionLocked,
      photoCount: 0,
      selectionCount: 0,
      coverKey: null,
      createdAt: gallery.createdAt,
    });
    await saveIndex(index);

    return NextResponse.json({ id, code });
  } catch (err) {
    console.error("Failed to create gallery:", err);
    return NextResponse.json(
      { error: err?.message || "Could not create gallery." },
      { status: 500 }
    );
  }
}
