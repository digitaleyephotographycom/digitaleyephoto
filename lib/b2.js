import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client;

// Backblaze B2 speaks the S3 API, so the regular AWS S3 SDK works against it —
// we just point it at B2's endpoint/region and use B2 application key credentials.
export function getB2Client() {
  if (client) return client;
  client = new S3Client({
    region: process.env.B2_REGION,
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
  });
  return client;
}

export const BUCKET = process.env.B2_BUCKET_NAME;

const signedUrlCache = new Map();

// Generate a short-lived presigned GET URL for securely viewing or downloading
// a private B2 object without making the bucket or file public.
export async function signedUrlFor(key, expiresIn = 3600) {
  if (!key) return null;
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn,
  });

  // Cache for expiresIn minus a 10-minute safety window
  signedUrlCache.set(key, {
    url,
    expiresAt: now + Math.max(60, expiresIn - 600) * 1000,
  });
  return url;
}
