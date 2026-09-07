import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getB2Client, getBucket } from "@/lib/b2";
import { newId } from "@/lib/ids";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

// Photos never pass through our own server — the browser uploads the
// original file directly to Backblaze B2 using this short-lived signed PUT URL.
// That keeps 4K originals off our serverless function entirely (avoiding
// upload size/time limits) and off any per-request bill.
export async function POST(req, { params }) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const client = getB2Client();
    const bucket = getBucket();

    // Batch mode: multiple files in one request
    if (Array.isArray(body?.files)) {
      const items = await Promise.all(
        body.files.map(async (f) => {
          const photoId = newId("p");
          const safeName = (f.fileName || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
          const key = `galleries/${params.id}/${photoId}-${safeName}`;
          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: f.contentType || "image/jpeg",
          });
          const uploadUrl = await getSignedUrl(client, command, { expiresIn: 1800 });
          return {
            photoId,
            key,
            fileName: f.fileName,
            uploadUrl,
          };
        })
      );
      return NextResponse.json({ items });
    }

    // Single file mode (backward compatibility)
    const { fileName, contentType } = body || {};
    const photoId = newId("p");
    const safeName = (fileName || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `galleries/${params.id}/${photoId}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "image/jpeg",
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 1800 });

    return NextResponse.json({
      uploadUrl,
      key,
      photoId,
    });
  } catch (err) {
    console.error("Failed to generate upload URL:", err);
    return NextResponse.json(
      { error: err?.message || "Could not prepare upload. Please try again." },
      { status: 500 }
    );
  }
}
