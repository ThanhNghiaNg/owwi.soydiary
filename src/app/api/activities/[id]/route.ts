import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { activityInputSchema } from "@/modules/activity/activity.dto";
import { deleteActivity, getActivityById, updateActivity } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";

const privateNoStore = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Onboarding required" }, { status: 409 });
  const { id } = await params;
  const current = await getActivityById(session.user.id, baby._id.toHexString(), id);
  if (!current) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  const parsed = activityInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.type !== current.type) return NextResponse.json({ error: "Activity type cannot be changed" }, { status: 400 });
  if (parsed.data.type === "sleep" && new Date(parsed.data.endedAt) < new Date(parsed.data.occurredAt)) {
    return NextResponse.json({ error: "Wake time must be after sleep time" }, { status: 400 });
  }
  const updated = await updateActivity(session.user.id, baby._id.toHexString(), id, parsed.data);
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
