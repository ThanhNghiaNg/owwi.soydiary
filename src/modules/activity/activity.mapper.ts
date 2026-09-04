import type { ActivityDocument } from "./activity.model";
import type { ActivityDto, ActivityMedia, ActivityMediaSyncStatus } from "./activity.dto";
import { legacyOuncesToMilliliters } from "@/lib/volume";

function normalizeMediaItem(value: unknown, legacyImage: boolean): ActivityMedia | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.url !== "string" || typeof raw.storageKey !== "string") return null;
  const kind = legacyImage || raw.kind !== "video" ? "image" : "video";
  const mimeType = typeof raw.mimeType === "string" && raw.mimeType
    ? raw.mimeType
    : kind === "video" ? "video/mp4" : "image/jpeg";
  return {
    kind,
    url: raw.url,
    storageKey: raw.storageKey,
    mimeType,
    ...(raw.provider === "cloudinary" || raw.provider === "google-drive" ? { provider: raw.provider } : {}),
    ...(typeof raw.connectionId === "string" && raw.connectionId ? { connectionId: raw.connectionId } : {}),
    ...(typeof raw.posterUrl === "string" && raw.posterUrl ? { posterUrl: raw.posterUrl } : {}),
    ...(typeof raw.durationMs === "number" && raw.durationMs >= 0 ? { durationMs: Math.round(raw.durationMs) } : {}),
    ...(typeof raw.width === "number" && raw.width > 0 ? { width: Math.round(raw.width) } : {}),
    ...(typeof raw.height === "number" && raw.height > 0 ? { height: Math.round(raw.height) } : {}),
  };
}

function normalizeSyncStatus(value: unknown): ActivityMediaSyncStatus {
  return value === "pending" || value === "uploading" || value === "failed" ? value : "synced";
}

export function toActivityDto(doc: ActivityDocument): ActivityDto {
  if (!doc._id) throw new Error("Activity document has no id");
  const { _id, babyId, ownerId: _ownerId, createdAt, updatedAt, ...input } = doc;
  const raw = input as unknown as Record<string, unknown>;
  const hasCanonicalMedia = Array.isArray(raw.media);
  const source = hasCanonicalMedia ? raw.media as unknown[] : Array.isArray(raw.images) ? raw.images : [];
  const media = source.flatMap((item) => {
    const normalized = normalizeMediaItem(item, !hasCanonicalMedia);
    return normalized ? [normalized] : [];
  });
  const mediaSyncStatus = normalizeSyncStatus(raw.mediaSyncStatus ?? raw.imageSyncStatus);
  const rawExpectedCount = raw.mediaSyncExpectedCount ?? raw.imageSyncExpectedCount;
  const mediaSyncExpectedCount = typeof rawExpectedCount === "number"
    ? Math.max(media.length, Math.trunc(rawExpectedCount))
    : media.length;
  const {
    images: _legacyImages,
    imageSyncStatus: _legacyImageStatus,
    imageSyncExpectedCount: _legacyImageCount,
    media: _storedMedia,
    mediaSyncStatus: _storedMediaStatus,
    mediaSyncExpectedCount: _storedMediaCount,
    ...normalizedInput
  } = raw;
  const common = {
    id: _id.toHexString(),
    babyId: babyId.toHexString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    media,
    mediaSyncStatus,
    mediaSyncExpectedCount,
  };

  if (input.type === "bottle") {
    const amountMl = typeof raw.amountMl === "number"
      ? Math.round(raw.amountMl)
      : legacyOuncesToMilliliters(typeof raw.amountOz === "number" ? raw.amountOz : 0);
    const { amountOz: _legacyAmount, ...normalized } = normalizedInput;
    return { ...normalized, type: "bottle", amountMl, ...common } as ActivityDto;
  }

  if (input.type === "pump") {
    const leftMl = typeof raw.leftMl === "number"
      ? Math.round(raw.leftMl)
      : legacyOuncesToMilliliters(typeof raw.leftOz === "number" ? raw.leftOz : 0);
    const rightMl = typeof raw.rightMl === "number"
      ? Math.round(raw.rightMl)
      : legacyOuncesToMilliliters(typeof raw.rightOz === "number" ? raw.rightOz : 0);
    const { leftOz: _legacyLeft, rightOz: _legacyRight, ...normalized } = normalizedInput;
    return { ...normalized, type: "pump", leftMl, rightMl, ...common } as ActivityDto;
  }

  return { ...normalizedInput, ...common } as ActivityDto;
}
