import crypto from "crypto";

function getEncryptionKey() {
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.GALLERY_TOKEN_SECRET ||
    "fallback-admin-dev-secret-change-in-env";
  // Derive a deterministic 32-byte key from the server secret
  return crypto.scryptSync(secret, "gallery-pass-salt-v1", 32);
}

/**
 * Encrypt a plaintext password using AES-256-GCM.
 * Output format: ivHex:authTagHex:encryptedHex
 */
export function encryptPassword(plaintext) {
  if (!plaintext || typeof plaintext !== "string") return null;
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("Encryption error:", err);
    return null;
  }
}

/**
 * Decrypt a stored AES-256-GCM password string.
 */
export function decryptPassword(payload) {
  if (!payload || typeof payload !== "string") return null;
  try {
    const parts = payload.split(":");
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedHex] = parts;

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption error:", err);
    return null;
  }
}
