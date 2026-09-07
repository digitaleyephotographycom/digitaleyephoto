import { NextResponse } from "next/server";
import {
  getGallery,
  saveGallery,
  deleteGalleryMeta,
  deleteObject,
  getIndex,
  saveIndex,
} from "@/lib/store";
import { signedUrlFor } from "@/lib/b2";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }
    safe.photos = await Promise.all(
      (safe.photos || []).map(async (photo) => {
        let thumbUrl = null;
        if (photo.thumbKey) {
          try {
            thumbUrl = await signedUrlFor(photo.thumbKey, 7200);
          } catch {}
        }
        if (!thumbUrl && photo.key) {
          thumbUrl = `/api/photos/thumb?key=${encodeURIComponent(photo.key)}&w=600`;
        }
        return {
          ...photo,
          thumbUrl,
          url: thumbUrl,
        };
      })
    );
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Failed to fetch gallery:", err);
    return NextResponse.json(
      { error: err?.message || "Could not load gallery." },
      { status: 500 }
    );
  }
}

export async function PATCH(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    const body = await req.json();
    const { status, selectionLocked, name, customerName, eventDate, type } = body || {};

    const validStatuses = ["DRAFT", "ACTIVE", "SELECTION_SUBMITTED", "COMPLETED", "ARCHIVED"];

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      gallery.status = status;
    }

    if (selectionLocked !== undefined) {
      gallery.selectionLocked = Boolean(selectionLocked);
    }

    if (name !== undefined && name.trim()) {
      gallery.name = name.trim();
    }
    if (customerName !== undefined) {
      gallery.customerName = customerName.trim();
    }
    if (eventDate !== undefined) {
      gallery.eventDate = eventDate.trim();
    }
    if (type !== undefined && type.trim()) {
      gallery.type = type.trim();
    }

    await saveGallery(params.id, gallery);

    // Update index entry
    const index = await getIndex();
    const entryIndex = (index.galleries || []).findIndex((g) => g.id === params.id);
    if (entryIndex !== -1) {
      index.galleries[entryIndex] = {
        ...index.galleries[entryIndex],
        name: gallery.name,
        customerName: gallery.customerName,
        type: gallery.type,
        eventDate: gallery.eventDate,
        status: gallery.status,
        selectionStatus: gallery.selectionStatus,
        selectionLocked: gallery.selectionLocked,
        selectionCount: (gallery.selections || []).length,
      };
      await saveIndex(index);
    }

    const { passwordHash, ...safe } = gallery;
    return NextResponse.json(safe);
  } catch (err) {
    console.error("Failed to update gallery:", err);
    return NextResponse.json(
      { error: err?.message || "Could not update gallery." },
      { status: 500 }
    );
  }
}

export async function DELETE(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    for (const photo of gallery.photos || []) {
      try {
        if (photo.key) await deleteObject(photo.key);
      } catch {
        // best-effort cleanup — continue even if one file is already gone
      }
    }
    await deleteGalleryMeta(params.id);

    const index = await getIndex();
    index.galleries = index.galleries.filter((g) => g.id !== params.id);
    await saveIndex(index);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete gallery:", err);
    return NextResponse.json(
      { error: err?.message || "Could not delete gallery." },
      { status: 500 }
    );
  }
}
