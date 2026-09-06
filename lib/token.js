import crypto from "crypto";

const SECRET = process.env.GALLERY_TOKEN_SECRET || "dev-secret-change-me";

// After a client enters the correct code + password once, we hand back a
// signed token instead of asking them to resend the password on every
// action. It just proves "this browser already unlocked gallery X".
export function signToken(galleryId, ttlSeconds = 60 * 60 * 6) {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${galleryId}.${expires}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const [galleryId, expires, sig] = decoded.split(".");
    const payload = `${galleryId}.${expires}`;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");
    if (sig !== expected) return null;
    if (Date.now() > Number(expires)) return null;
    return { galleryId };
  } catch {
    return null;
  }
}
