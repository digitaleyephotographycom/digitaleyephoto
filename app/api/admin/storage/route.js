import { NextResponse } from "next/server";
import { ListObjectVersionsCommand } from "@aws-sdk/client-s3";
import { getB2Client, getBucket } from "@/lib/b2";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedStorage = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// 10 GB Maximum Capacity (10 * 1024 * 1024 * 1024 bytes)
const CAPACITY_BYTES = 10 * 1024 * 1024 * 1024;
const CAPACITY_FORMATTED = "10 GB";

function formatStorageUnits(bytes) {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1000 * 1000 * 1000) {
    const mb = bytes / (1000 * 1000);
    return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
  }
  const gb = bytes / (1000 * 1000 * 1000);
  return `${gb.toFixed(2)} GB`;
}

export async function GET(req) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  const now = Date.now();
  if (!forceRefresh && cachedStorage && now < cacheExpiresAt) {
    return NextResponse.json(cachedStorage);
  }

  try {
    const client = getB2Client();
    const bucket = getBucket();

    let totalBytes = 0;
    let versionCount = 0;
    let keyMarker = undefined;
    let versionIdMarker = undefined;
    let isTruncated = true;

    // List all object versions (originals, previews, thumbs, metadata, and retained versions)
    // to match actual storage provider accounting accurately
    while (isTruncated) {
      const command = new ListObjectVersionsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      });
      const res = await client.send(command);

      for (const item of res.Versions || []) {
        totalBytes += item.Size || 0;
        versionCount++;
      }

      isTruncated = Boolean(res.IsTruncated);
      keyMarker = res.NextKeyMarker;
      versionIdMarker = res.NextVersionIdMarker;
    }

    const percentage = Number(((totalBytes / CAPACITY_BYTES) * 100).toFixed(2));

    cachedStorage = {
      usedBytes: totalBytes,
      usedFormatted: formatStorageUnits(totalBytes),
      capacityBytes: CAPACITY_BYTES,
      capacityFormatted: CAPACITY_FORMATTED,
      percentage,
      versionCount,
    };
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json(cachedStorage);
  } catch (err) {
    console.error("Failed to calculate storage:", err);
    return NextResponse.json(
      { error: "Storage information is temporarily unavailable." },
      { status: 500 }
    );
  }
}
