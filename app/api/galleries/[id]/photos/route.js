import { NextResponse } from "next/server";
import { getGallery, saveGallery, getIndex, saveIndex } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const gallery = await getGallery(params.id);
    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found." }, { status: 404 });
    }

    if (!Array.isArray(gallery.photos)) {
      gallery.photos = [];
    }

    // Batch mode: multiple photos registered at once
    if (Array.isArray(body?.photos)) {
      const validItems = body.photos.filter((p) => p?.photoId && p?.key);
      if (validItems.length === 0) {
        return NextResponse.json(
          { error: "No valid photo items provided." },
          { status: 400 }
        );
      }

      for (const p of validItems) {
        gallery.photos.push({
          id: p.photoId,
          key: p.key,
          name: p.name || "photo.jpg",
        });
      }

      await saveGallery(params.id, gallery);

      const index = await getIndex();
      const entry = index.galleries.find((g) => g.id === params.id);
      if (entry) {
        entry.photoCount = gallery.photos.length;
        if (!entry.coverKey && gallery.photos[0]?.key) {
          entry.coverKey = gallery.photos[0].key;
        }
      }
      await saveIndex(index);

      return NextResponse.json({ ok: true, count: gallery.photos.length });
    }

    // Single photo mode (backward compatibility)
    const { photoId, key, name } = body || {};

    if (!photoId || !key) {
      return NextResponse.json(
        { error: "photoId and key are required." },
        { status: 400 }
      );
    }

    gallery.photos.push({
      id: photoId,
      key,
      name: name || "photo.jpg",
    });
    await saveGallery(params.id, gallery);

    const index = await getIndex();
    const entry = index.galleries.find((g) => g.id === params.id);
    if (entry) {
      entry.photoCount = gallery.photos.length;
      if (!entry.coverKey) {
        entry.coverKey = key;
      }
    }
    await saveIndex(index);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save photo metadata:", err);
    return NextResponse.json(
      { error: "Could not save photo metadata." },
      { status: 500 }
    );
  }
}
