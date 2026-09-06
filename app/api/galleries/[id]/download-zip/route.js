import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { getGallery } from "@/lib/store";
import { signedUrlFor } from "@/lib/b2";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const { photoIds } = await req.json();
    const gallery = await getGallery(params.id);

    if (!gallery) {
      return new Response(JSON.stringify({ error: "Gallery not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ids = Array.isArray(photoIds) ? photoIds : gallery.selections;
    const photos = (gallery.photos || []).filter((p) => ids.includes(p.id));

    if (photos.length === 0) {
      return new Response(JSON.stringify({ error: "No photos to zip." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    // Fetch each full-quality original from Backblaze using temporary signed GET URLs
    // and stream directly into the zip archive.
    (async () => {
      for (const photo of photos) {
        try {
          if (!photo.key) continue;
          const url = await signedUrlFor(photo.key, 3600);
          if (!url) continue;
          const res = await fetch(url);
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          archive.append(buf, { name: photo.name });
        } catch (err) {
          console.error("Failed to fetch original for ZIP:", photo.name, err);
          // skip a photo that failed to fetch rather than failing the whole zip
        }
      }
      archive.finalize();
    })();

    const safeName = (gallery.name || "gallery").replace(/\s+/g, "_");

    return new Response(Readable.toWeb(passthrough), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}_selected.zip"`,
      },
    });
  } catch (err) {
    console.error("ZIP download error:", err);
    return new Response(JSON.stringify({ error: "Could not create ZIP archive." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
