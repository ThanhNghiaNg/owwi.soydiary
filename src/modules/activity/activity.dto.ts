import { z } from "zod";
import { isSafeMediaUrl } from "@/lib/validation/safe-image-url";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_ACTIVITY_MEDIA,
} from "@/modules/integrations/storage/storage.constants";

const imageMimeTypes = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);
const videoMimeTypes = new Set<string>(ACCEPTED_VIDEO_MIME_TYPES);

export const activityMediaSyncStatusSchema = z.enum(["pending", "uploading", "failed", "synced"]);
export type ActivityMediaSyncStatus = z.infer<typeof activityMediaSyncStatusSchema>;

export const activityMediaSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.string().min(1).max(2048).refine(isSafeMediaUrl, "Invalid media URL"),
  storageKey: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(100),
  provider: z.enum(["cloudinary", "google-drive"]).optional(),
  connectionId: z.string().min(1).max(200).optional(),
  posterUrl: z.string().min(1).max(2048).refine(isSafeMediaUrl, "Invalid poster URL").optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
}).superRefine((media, context) => {
  const accepted = media.kind === "image" ? imageMimeTypes.has(media.mimeType) : videoMimeTypes.has(media.mimeType);
  if (!accepted) context.addIssue({ code: "custom", path: ["mimeType"], message: `Unsupported ${media.kind} MIME type` });
});
export type ActivityMedia = z.infer<typeof activityMediaSchema>;

const base = z.object({
  occurredAt: z.string().datetime(),
  note: z.string().max(1000).default(""),
  media: z.array(activityMediaSchema).max(MAX_ACTIVITY_MEDIA).default([]),
  mediaSyncStatus: activityMediaSyncStatusSchema.optional(),
  mediaSyncExpectedCount: z.number().int().min(0).max(MAX_ACTIVITY_MEDIA).optional(),
});

export const activityInputSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("breastfeeding"), leftSeconds: z.number().int().min(0), rightSeconds: z.number().int().min(0) }),
  base.extend({ type: z.literal("bottle"), milkType: z.enum(["breast-milk", "formula", "other"]), amountMl: z.number().int().min(0).max(600) }),
  base.extend({ type: z.literal("pump"), leftMl: z.number().int().min(0).max(600), rightMl: z.number().int().min(0).max(600) }),
  base.extend({ type: z.literal("diaper"), diaperType: z.enum(["pee", "poop", "mixed", "dry"]), color: z.string().max(30).optional(), consistency: z.string().max(30).optional() }),
  base.extend({ type: z.literal("sleep"), endedAt: z.string().datetime() }),
  base.extend({ type: z.literal("tummy"), durationMinutes: z.number().int().min(0).max(600), label: z.string().trim().min(1).max(60).default("Tummy Time") }),
  base.extend({ type: z.literal("solid"), label: z.string().trim().min(1).max(60).default("Solid Food") }),
  base.extend({ type: z.literal("moment") }),
  base.extend({ type: z.literal("custom"), label: z.string().trim().min(1).max(60) }),
]).superRefine((activity, context) => {
  if (activity.mediaSyncExpectedCount !== undefined && activity.mediaSyncExpectedCount < activity.media.length) {
    context.addIssue({ code: "custom", path: ["mediaSyncExpectedCount"], message: "Expected media count cannot be smaller than uploaded media" });
  }
  if (activity.mediaSyncStatus === "synced" && activity.mediaSyncExpectedCount !== undefined && activity.mediaSyncExpectedCount !== activity.media.length) {
    context.addIssue({ code: "custom", path: ["mediaSyncExpectedCount"], message: "Synced media count must match uploaded media" });
  }
  if (activity.type === "moment" && !activity.note.trim() && activity.media.length === 0 && !activity.mediaSyncExpectedCount) {
    context.addIssue({ code: "custom", path: ["note"], message: "Khoảnh khắc cần có mô tả hoặc ít nhất một ảnh/video" });
  }
});

export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityType = ActivityInput["type"];

export const activityDtoSchema = z.object({
  id: z.string(),
  babyId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).and(activityInputSchema);
export type ActivityDto = z.infer<typeof activityDtoSchema>;

function legacyImageToMedia(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const image = value as Record<string, unknown>;
  return { ...image, kind: "image", mimeType: typeof image.mimeType === "string" ? image.mimeType : "image/jpeg" };
}

/** Accepts requests made by clients deployed before activity media support. */
export function normalizeLegacyActivityPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if ("media" in body || !("images" in body)) return body;
  const { images, imageSyncStatus, imageSyncExpectedCount, ...rest } = body;
  return {
    ...rest,
    media: Array.isArray(images) ? images.map(legacyImageToMedia) : images,
    ...(imageSyncStatus === undefined ? {} : { mediaSyncStatus: imageSyncStatus }),
    ...(imageSyncExpectedCount === undefined ? {} : { mediaSyncExpectedCount: imageSyncExpectedCount }),
  };
}

/** Compatibility aliases for code importing the old schema names. */
export const activityImageSyncStatusSchema = activityMediaSyncStatusSchema;
export const activityImageSchema = activityMediaSchema;
export type ActivityImageSyncStatus = ActivityMediaSyncStatus;
