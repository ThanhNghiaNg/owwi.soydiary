import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { activityImageSchema, activityImageSyncStatusSchema, activityInputSchema } from "@/modules/activity/activity.dto";
import { deleteActivity, getActivityById, updateActivity, updateActivityImageSync } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { MAX_ACTIVITY_IMAGES } from "@/modules/integrations/storage/storage.constants";

const privateNoStore = { "Cache-Control": "private, no-store" };
const imageSyncPatchSchema = z.object({
  imageSync: z.object({
    status: activityImageSyncStatusSchema,
    expectedCount: z.number().int().min(0).max(MAX_ACTIVITY_IMAGES),
    images: z.array(activityImageSchema).max(MAX_ACTIVITY_IMAGES).optional(),
  }).strict(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Onboarding required" }, { status: 409 });
  const { id } = await params;
  const current = await getActivityById(session.user.id, baby._id.toHexString(), id);
  if (!current) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const body: unknown = await request.json();
  const imageSyncPatch = imageSyncPatchSchema.safeParse(body);
  if (imageSyncPatch.success) {
    const { status, expectedCount, images } = imageSyncPatch.data.imageSync;
    if (images && expectedCount < images.length) {
      return NextResponse.json({ error: "Expected image count cannot be smaller than uploaded image count" }, { status: 400 });
    }
    if (status === "synced" && (!images || expectedCount !== images.length)) {
      return NextResponse.json({ error: "Synced image count does not match uploaded images" }, { status: 400 });
    }
    const updated = await updateActivityImageSync(
      session.user.id,
      baby._id.toHexString(),
      id,
      { status, expectedCount, ...(images ? { images } : {}) },
    );
    if (!updated) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    return NextResponse.json({ activity: toActivityDto(updated) }, { headers: privateNoStore });
  }
  const withExistingImages = body && typeof body === "object" && !("images" in body)
    ? { ...body, images: current.images ?? [] }
    : body;
  const parsed = activityInputSchema.safeParse(withExistingImages);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.type !== current.type) return NextResponse.json({ error: "Activity type cannot be changed" }, { status: 400 });
  if (parsed.data.type === "sleep" && new Date(parsed.data.endedAt) < new Date(parsed.data.occurredAt)) {
    return NextResponse.json({ error: "Wake time must be after sleep time" }, { status: 400 });
  }
  const preserveImages = Boolean(body && typeof body === "object" && !("images" in body));
  const updated = await updateActivity(session.user.id, baby._id.toHexString(), id, parsed.data, preserveImages);
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
