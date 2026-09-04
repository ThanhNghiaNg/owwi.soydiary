import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { activityInputSchema, activityMediaSchema, activityMediaSyncStatusSchema, normalizeLegacyActivityPayload } from "@/modules/activity/activity.dto";
import { deleteActivity, getActivityById, updateActivity, updateActivityMediaSync } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { MAX_ACTIVITY_MEDIA } from "@/modules/integrations/storage/storage.constants";

const privateNoStore = { "Cache-Control": "private, no-store" };
const mediaSyncPatchSchema = z.object({
  mediaSync: z.object({
    status: activityMediaSyncStatusSchema,
    expectedCount: z.number().int().min(0).max(MAX_ACTIVITY_MEDIA),
    media: z.array(activityMediaSchema).max(MAX_ACTIVITY_MEDIA).optional(),
  }).strict(),
}).strict();

function normalizeLegacySyncPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if ("mediaSync" in body || !("imageSync" in body) || !body.imageSync || typeof body.imageSync !== "object") return body;
  const legacy = body.imageSync as Record<string, unknown>;
  const normalized = normalizeLegacyActivityPayload({ images: legacy.images }) as Record<string, unknown>;
  return {
    mediaSync: {
      status: legacy.status,
      expectedCount: legacy.expectedCount,
      ...(legacy.images === undefined ? {} : { media: normalized.media }),
    },
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Onboarding required" }, { status: 409 });
  const { id } = await params;
  const current = await getActivityById(session.user.id, baby._id.toHexString(), id);
  if (!current) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const rawBody: unknown = await request.json();
  const syncBody = normalizeLegacySyncPatch(rawBody);
  const mediaSyncPatch = mediaSyncPatchSchema.safeParse(syncBody);
  if (mediaSyncPatch.success) {
    const { status, expectedCount, media } = mediaSyncPatch.data.mediaSync;
    if (media && expectedCount < media.length) {
      return NextResponse.json({ error: "Expected media count cannot be smaller than uploaded media count" }, { status: 400 });
    }
    if (status === "synced" && (!media || expectedCount !== media.length)) {
      return NextResponse.json({ error: "Synced media count does not match uploaded media" }, { status: 400 });
    }
    const updated = await updateActivityMediaSync(
      session.user.id,
      baby._id.toHexString(),
      id,
      { status, expectedCount, ...(media ? { media } : {}) },
    );
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: toActivityDto(updated) }, { headers: privateNoStore });
  }
  const body = normalizeLegacyActivityPayload(rawBody);
  const currentDto = toActivityDto(current);
  const withExistingMedia = body && typeof body === "object" && !("media" in body)
    ? { ...body, media: currentDto.media }
    : body;
  const parsed = activityInputSchema.safeParse(withExistingMedia);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.type !== current.type) return NextResponse.json({ error: "Activity type cannot be changed" }, { status: 400 });
  if (parsed.data.type === "sleep" && new Date(parsed.data.endedAt) < new Date(parsed.data.occurredAt)) {
    return NextResponse.json({ error: "Wake time must be after sleep time" }, { status: 400 });
  }
  const preserveMedia = Boolean(body && typeof body === "object" && !("media" in body));
  const updated = await updateActivity(session.user.id, baby._id.toHexString(), id, parsed.data, preserveMedia);
  if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ activity: toActivityDto(updated) }, { headers: privateNoStore });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Onboarding required" }, { status: 409 });
  const { id } = await params;
  const deleted = await deleteActivity(session.user.id, baby._id.toHexString(), id);
  if (!deleted) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  return NextResponse.json({ deleted: true }, { headers: privateNoStore });
}
