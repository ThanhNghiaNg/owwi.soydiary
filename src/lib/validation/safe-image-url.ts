import { isGoogleDriveAssetUrl } from "@/lib/utils/google-drive-image-url";

export function isSafeImageUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return isGoogleDriveAssetUrl(trimmed);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) return false;
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
      const [a, b] = parts as [number, number, number, number];
      if (
        a === 10 || a === 127 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}
