import type { ActivityDocument } from "./activity.model";
import type { ActivityDto } from "./activity.dto";
import { legacyOuncesToMilliliters } from "@/lib/volume";

export function toActivityDto(doc: ActivityDocument): ActivityDto {
  if (!doc._id) throw new Error("Activity document has no id");
  const { _id, babyId, ownerId: _ownerId, createdAt, updatedAt, ...input } = doc;
  const raw = input as unknown as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? raw.images : [];
  const imageSyncStatus = raw.imageSyncStatus === "pending" || raw.imageSyncStatus === "uploading" || raw.imageSyncStatus === "failed"
    ? raw.imageSyncStatus
    : "synced";
  const imageSyncExpectedCount = typeof raw.imageSyncExpectedCount === "number"
    ? Math.max(images.length, Math.trunc(raw.imageSyncExpectedCount))
    : images.length;
  const common = {
    id: _id.toHexString(),
    babyId: babyId.toHexString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    imageSyncStatus,
    imageSyncExpectedCount,
  };

  if (input.type === "bottle") {
    const amountMl = typeof raw.amountMl === "number"
      ? Math.round(raw.amountMl)
      : legacyOuncesToMilliliters(typeof raw.amountOz === "number" ? raw.amountOz : 0);
    const { amountOz: _legacyAmount, ...normalized } = raw;
    return { ...normalized, images, type: "bottle", amountMl, ...common } as ActivityDto;
  }

  if (input.type === "pump") {
    const leftMl = typeof raw.leftMl === "number"
      ? Math.round(raw.leftMl)
      : legacyOuncesToMilliliters(typeof raw.leftOz === "number" ? raw.leftOz : 0);
    const rightMl = typeof raw.rightMl === "number"
      ? Math.round(raw.rightMl)
      : legacyOuncesToMilliliters(typeof raw.rightOz === "number" ? raw.rightOz : 0);
    const { leftOz: _legacyLeft, rightOz: _legacyRight, ...normalized } = raw;
    return { ...normalized, images, type: "pump", leftMl, rightMl, ...common } as ActivityDto;
  }

  return { ...input, images, ...common } as ActivityDto;
}
