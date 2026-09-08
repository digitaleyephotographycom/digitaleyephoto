import archiver from "archiver";
import { PassThrough, Readable } from "stream";
import { getGallery } from "@/lib/store";
import { verifyToken } from "@/lib/token";
import { signedUrlFor } from "@/lib/b2";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { token, photoIds } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Session token required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = verifyToken(token);
    if (!payload?.galleryId) {
      return new Response(JSON.stringify({ error: "Invalid or expired session token." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const gallery = await getGallery(payload.galleryId);
    if (!gallery) {
      return new Response(JSON.stringify({ error: "Gallery not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (gallery.status === "DRAFT" || gallery.status === "ARCHIVED") {
      return new Response(JSON.stringify({ error: "Gallery not currently accessible." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ids = Array.isArray(photoIds) && photoIds.length > 0 ? photoIds : gallery.selections;
    const photos = (gallery.photos || []).filter((p) => ids.includes(p.id));

    if (photos.length === 0) {
      return new Response(JSON.stringify({ error: "No photos to download." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    const usedNames = new Set();

    // Fetch each full-quality original from Backblaze B2 using temporary signed GET URLs
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

          let filename = photo.sourceName || photo.name || "photo.jpg";
          if (usedNames.has(filename)) {
            const dotIdx = filename.lastIndexOf(".");
            const base = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
            const ext = dotIdx > 0 ? filename.slice(dotIdx) : "";
            let counter = 1;
            while (usedNames.has(`${base} (${counter})${ext}`)) {
              counter++;
            }
            filename = `${base} (${counter})${ext}`;
          }
          usedNames.add(filename);

          archive.append(buf, { name: filename });
        } catch (err) {
          console.error("Failed to fetch original for client ZIP:", photo.name, err);
        }
      }
      archive.finalize();
    })();

    const safeName = (gallery.name || "photos").replace(/\s+/g, "_");

    return new Response(Readable.toWeb(passthrough), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}_original.zip"`,
      },
    });
  } catch (err) {
    console.error("Client ZIP download error:", err);
    return new Response(JSON.stringify({ error: "Could not create ZIP archive." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
