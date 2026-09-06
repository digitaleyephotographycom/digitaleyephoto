import { NextResponse } from "next/server";
import { getGallery, saveGallery, getIndex, saveIndex } from "@/lib/store";
import { verifyToken } from "@/lib/token";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { token, selections, submit } = await req.json();
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Your session expired — please re-enter the gallery." },
        { status: 401 }
      );
    }

    const gallery = await getGallery(payload.galleryId);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    if (gallery.selectionLocked) {
      return NextResponse.json(
        { error: "Selections for this gallery are currently locked by your photographer." },
        { status: 403 }
      );
    }

    const validPhotoIds = new Set((gallery.photos || []).map((p) => p.id));
    const cleanSelections = Array.isArray(selections)
      ? selections.filter((id) => validPhotoIds.has(id))
      : [];

    gallery.selections = cleanSelections;

    if (submit) {
      gallery.selectionStatus = "SUBMITTED";
      gallery.selectionSubmittedAt = Date.now();
      gallery.status = "SELECTION_SUBMITTED";
    }

    await saveGallery(payload.galleryId, gallery);

    const index = await getIndex();
    const entry = index.galleries.find((g) => g.id === payload.galleryId);
    if (entry) {
      entry.selectionCount = cleanSelections.length;
      if (submit) {
        entry.status = "SELECTION_SUBMITTED";
        entry.selectionStatus = "SUBMITTED";
      }
      await saveIndex(index);
    }

    return NextResponse.json({
      ok: true,
      count: cleanSelections.length,
      status: gallery.status,
      selectionStatus: gallery.selectionStatus,
      selectionSubmittedAt: gallery.selectionSubmittedAt,
    });
  } catch (err) {
    console.error("Failed to update selections:", err);
    return NextResponse.json(
      { error: "Could not update selections." },
      { status: 500 }
    );
  }
}
