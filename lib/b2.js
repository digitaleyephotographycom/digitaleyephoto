import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client;

export function getBucket() {
  const name = (
    process.env.B2_BUCKET_NAME ||
    process.env.B2_BUCKET ||
    ""
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!name) {
    throw new Error(
      "Missing Backblaze B2 bucket name. Please configure B2_BUCKET_NAME in your environment variables."
    );
  }
  return name;
}

// Dynamically evaluates bucket name so it remains accurate across serverless environments
export const BUCKET = new Proxy(
  {},
  {
    get(_, prop) {
      const val = getBucket();
      return typeof val[prop] === "function" ? val[prop].bind(val) : val[prop];
    },
    [Symbol.toPrimitive]() {
      return getBucket();
    },
    toString() {
      return getBucket();
    },
    valueOf() {
      return getBucket();
    },
  }
);

// Backblaze B2 speaks the S3 API, so the regular AWS S3 SDK works against it —
// we just point it at B2's endpoint/region and use B2 application key credentials.
export function getB2Client() {
  const region = (
    process.env.B2_REGION ||
    "us-east-005"
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  let endpoint = (
    process.env.B2_ENDPOINT ||
    ""
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!endpoint && region) {
    endpoint = `https://s3.${region}.backblazeb2.com`;
  }
  if (endpoint && !endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    endpoint = `https://${endpoint}`;
  }

  const accessKeyId = (
    process.env.B2_KEY_ID ||
    process.env.B2_APPLICATION_KEY_ID ||
    ""
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  const secretAccessKey = (
    process.env.B2_APPLICATION_KEY ||
    process.env.B2_APP_KEY ||
    ""
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing Backblaze B2 credentials. Please ensure B2_KEY_ID and B2_APPLICATION_KEY are set in environment variables."
    );
  }

  if (client) return client;
  client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  return client;
}

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

  const bucketName = getBucket();
  const s3Client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  // Cache for expiresIn minus a 10-minute safety window
  signedUrlCache.set(key, {
    url,
    expiresAt: now + Math.max(60, expiresIn - 600) * 1000,
  });
  return url;
}
