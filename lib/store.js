import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getB2Client, BUCKET } from "./b2";

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
    const res = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
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
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
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
  };
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
    photos: Array.isArray(gallery.photos) ? gallery.photos : [],
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
  await client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: galleryKey(id) })
  );
}

export async function deleteObject(key) {
  const client = getB2Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
