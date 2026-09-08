import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getB2Client, getBucket } from "./b2";

// Gallery metadata (names, hashed passwords, photo lists, client selections)
// is stored as small JSON files inside the same B2 bucket as the photos —
// one bucket, one credential, no separate database to run or pay for.
const INDEX_KEY = "_meta/index.json";

// In-memory cache to eliminate repeated remote B2 network calls on read paths
const storeCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function getJson(key, fallback) {
  const now = Date.now();
  const cached = storeCache.get(key);
  if (cached && cached.expiresAt > now) {
    // Return a clone to prevent accidental mutations by callers
    return JSON.parse(JSON.stringify(cached.data));
  }

  try {
    const client = getB2Client();
    const bucket = getBucket();
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const text = await streamToString(res.Body);
    const data = JSON.parse(text);
    storeCache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
    return JSON.parse(JSON.stringify(data));
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (err?.name === "NoSuchKey" || status === 404) return fallback;
    throw err;
  }
}

async function putJson(key, data) {
  // Update cache immediately so next read is 0ms
  storeCache.set(key, {
    data: JSON.parse(JSON.stringify(data)),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  const client = getB2Client();
  const bucket = getBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

export function normalizeIndexEntry(entry) {
  if (!entry) return null;
  return {
    ...entry,
    customerName: entry.customerName || "",
    eventDate: entry.eventDate || "",
    status: entry.status || "ACTIVE",
    selectionStatus: entry.selectionStatus || "NOT_SUBMITTED",
    selectionLocked: Boolean(entry.selectionLocked),
    photoCount: entry.photoCount || 0,
    selectionCount: entry.selectionCount || 0,
    coverKey: entry.coverKey || null,
    coverThumbKey: entry.coverThumbKey || null,
  };
}

export function deriveSourceName(p) {
  if (p?.sourceName && typeof p.sourceName === "string" && p.sourceName.trim()) {
    return p.sourceName.trim();
  }
  if (p?.name && typeof p.name === "string" && p.name.trim() && p.name !== "photo.jpg") {
    return p.name.trim();
  }
  if (p?.key && typeof p.key === "string") {
    const filename = p.key.split("/").pop() || "";
    // Key format: "p[id]-[actualfilename]"
    const dashIdx = filename.indexOf("-");
    if (dashIdx > 0 && dashIdx < 20) {
      return filename.slice(dashIdx + 1);
    }
    return filename;
  }
  return p?.name || "photo.jpg";
}

export function normalizeGallery(gallery) {
  if (!gallery) return null;
  return {
    ...gallery,
    customerName: gallery.customerName || "",
    eventDate: gallery.eventDate || "",
    status: gallery.status || "ACTIVE",
    selectionStatus: gallery.selectionStatus || "NOT_SUBMITTED",
    selectionLocked: Boolean(gallery.selectionLocked),
    selectionSubmittedAt: gallery.selectionSubmittedAt || null,
    photos: Array.isArray(gallery.photos)
      ? gallery.photos.map((p) => {
          const sourceName = deriveSourceName(p);
          return {
            id: p.id,
            key: p.key,
            thumbKey: p.thumbKey || null,
            previewKey: p.previewKey || null,
            name: sourceName,
            sourceName,
          };
        })
      : [],
    selections: Array.isArray(gallery.selections) ? gallery.selections : [],
  };
}

export async function getIndex() {
  const index = await getJson(INDEX_KEY, { galleries: [] });
  if (Array.isArray(index.galleries)) {
    index.galleries = index.galleries.map(normalizeIndexEntry);
  }
  return index;
}

export async function saveIndex(index) {
  await putJson(INDEX_KEY, index);
}

export function galleryKey(id) {
  return `_meta/galleries/${id}.json`;
}

export async function getGallery(id) {
  const gallery = await getJson(galleryKey(id), null);
  return normalizeGallery(gallery);
}

export async function saveGallery(id, data) {
  await putJson(galleryKey(id), data);
}

export async function deleteGalleryMeta(id) {
  storeCache.delete(galleryKey(id));
  const client = getB2Client();
  const bucket = getBucket();
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: galleryKey(id) })
    );
  } catch (err) {
    if (err?.name !== "NoSuchKey" && err?.$metadata?.httpStatusCode !== 404) {
      throw err;
    }
  }
}

export async function deleteGalleryFiles(galleryId) {
  const client = getB2Client();
  const bucket = getBucket();
  try {
    let continuationToken = undefined;
    do {
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `galleries/${galleryId}/`,
          ContinuationToken: continuationToken,
        })
      );
      for (const item of list.Contents || []) {
        if (item.Key) {
          try {
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
          } catch {}
        }
      }
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    console.warn(`Could not delete prefix files for gallery ${galleryId}:`, err?.message);
  }
}

export async function deleteObject(key) {
  const client = getB2Client();
  const bucket = getBucket();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
