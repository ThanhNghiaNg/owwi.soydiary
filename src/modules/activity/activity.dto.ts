import { z } from "zod";
import { isSafeImageUrl } from "@/lib/validation/safe-image-url";
import { MAX_ACTIVITY_IMAGES } from "@/modules/integrations/storage/storage.constants";

const base = z.object({
  occurredAt: z.string().datetime(),
  note: z.string().max(1000).default(""),
  images: z.array(z.object({
    url: z.string().min(1).max(2048).refine(isSafeImageUrl, "Invalid image URL"),
    storageKey: z.string().min(1).max(512),
    provider: z.enum(["cloudinary", "google-drive"]).optional(),
    connectionId: z.string().min(1).max(200).optional(),
  })).max(MAX_ACTIVITY_IMAGES).default([]),
});

export const activityInputSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("breastfeeding"), leftSeconds: z.number().int().min(0), rightSeconds: z.number().int().min(0) }),
  base.extend({ type: z.literal("bottle"), milkType: z.enum(["breast-milk", "formula", "other"]), amountMl: z.number().int().min(0).max(600) }),
  base.extend({ type: z.literal("pump"), leftMl: z.number().int().min(0).max(600), rightMl: z.number().int().min(0).max(600) }),
  base.extend({ type: z.literal("diaper"), diaperType: z.enum(["pee", "poop", "mixed", "dry"]), color: z.string().max(30).optional(), consistency: z.string().max(30).optional() }),
  base.extend({ type: z.literal("sleep"), endedAt: z.string().datetime() }),
  base.extend({ type: z.literal("tummy"), durationMinutes: z.number().int().min(0).max(600), label: z.string().trim().min(1).max(60).default("Tummy Time") }),
  base.extend({ type: z.literal("solid"), label: z.string().trim().min(1).max(60).default("Solid Food") }),
  base.extend({ type: z.literal("custom"), label: z.string().trim().min(1).max(60) }),
]);

export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityType = ActivityInput["type"];

export const activityDtoSchema = z.object({
  id: z.string(),
  babyId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).and(activityInputSchema);
export type ActivityDto = z.infer<typeof activityDtoSchema>;
