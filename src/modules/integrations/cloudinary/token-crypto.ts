import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function encryptionKey() {
  if (!env.AUTH_SECRET) throw new Error("CLOUDINARY_NOT_CONFIGURED");
  return createHash("sha256")
    .update(`soydiary:cloudinary-oauth:${env.AUTH_SECRET}`)
    .digest();
}

export function encryptCloudinaryToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCloudinaryToken(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("CLOUDINARY_RECONNECT_REQUIRED");
  }
}
