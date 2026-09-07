import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getB2Client, getBucket } from "@/lib/b2";
import { verifyToken } from "@/lib/token";
import { verifyAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory LRU-style cache for hot thumbnails (max 100 items, TTL 30 minutes)
const memoryCache = new Map();
const MAX_CACHE_ITEMS = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.buffer;
}

function setCached(key, buffer) {
  if (memoryCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const token = searchParams.get("token");
    const widthParam = parseInt(searchParams.get("w") || "600", 10);
    const qualityParam = parseInt(searchParams.get("q") || "80", 10);

    if (!key || typeof key !== "string" || !key.startsWith("galleries/")) {
      return new NextResponse("Invalid photo key", { status: 400 });
    }

    // Security check: must be either a valid gallery session token or authenticated admin
    let isAuthorized = false;

    if (token) {
      const verified = verifyToken(token);
      if (verified?.galleryId) {
        // Confirm key belongs to this gallery
        if (key.startsWith(`galleries/${verified.galleryId}/`)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      const adminAuth = await verifyAdminAuth(req);
      if (adminAuth) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const width = Math.min(Math.max(widthParam || 600, 100), 1600);
    const quality = Math.min(Math.max(qualityParam || 80, 50), 90);
    const cacheKey = `${key}_w${width}_q${quality}`;

    // 1. Check in-memory cache
    const memHit = getCached(cacheKey);
    if (memHit) {
      return new NextResponse(memHit, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
          "Vary": "Accept",
        },
      });
    }

    const client = getB2Client();
    const bucket = getBucket();

    // 2. Derive thumb key in B2
    const keyParts = key.split("/");
    const filename = keyParts.pop() || "photo.jpg";
    const galleryPrefix = keyParts.join("/");
    const persistentThumbKey = `${galleryPrefix}/_thumbs/${filename}_w${width}.webp`;

    // Try reading persistent thumb from B2 if already generated
    try {
      const thumbRes = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: persistentThumbKey })
      );
      const chunks = [];
      for await (const chunk of thumbRes.Body) {
        chunks.push(chunk);
      }
      const existingThumb = Buffer.concat(chunks);
      setCached(cacheKey, existingThumb);

      return new NextResponse(existingThumb, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
          "Vary": "Accept",
        },
      });
    } catch {
      // Persistent thumb not yet in B2, proceed to generate from source
    }

    // 3. Fetch original from B2 and resize with sharp
    const origRes = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const chunks = [];
    for await (const chunk of origRes.Body) {
      chunks.push(chunk);
    }
    const origBuffer = Buffer.concat(chunks);

    const resizedBuffer = await sharp(origBuffer)
      .rotate() // Auto-orient according to EXIF
      .resize({
        width,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality })
      .toBuffer();

    setCached(cacheKey, resizedBuffer);

    // Asynchronously save generated thumbnail back to B2 for future 0-CPU retrieval
    client
      .send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: persistentThumbKey,
          Body: resizedBuffer,
          ContentType: "image/webp",
        })
      )
      .catch(() => {});

    return new NextResponse(resizedBuffer, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
        "Vary": "Accept",
      },
    });
  } catch (err) {
    console.error("Thumbnail generation error:", err);
    return new NextResponse("Failed to process thumbnail", { status: 500 });
  }
}
