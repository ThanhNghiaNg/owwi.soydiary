import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import { activityInputSchema, type ActivityType } from "@/modules/activity/activity.dto";
import { createActivity, listActivities } from "@/modules/activity/activity.repository";
import { toActivityDto } from "@/modules/activity/activity.mapper";

const allowedTypes = new Set<ActivityType>(["breastfeeding","bottle","pump","diaper","sleep","tummy","solid","moment","custom"]);
const privateNoStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ activities: [] }, { headers: privateNoStore });
  const rawType = request.nextUrl.searchParams.get("type");
  const type = rawType && allowedTypes.has(rawType as ActivityType) ? rawType as ActivityType : undefined;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.min(5000, Math.max(1, Math.trunc(rawLimit))) : 100;
  const rawFrom = request.nextUrl.searchParams.get("from");
  const rawTo = request.nextUrl.searchParams.get("to");
  const from = rawFrom && !Number.isNaN(Date.parse(rawFrom)) ? new Date(rawFrom).toISOString() : undefined;
  const to = rawTo && !Number.isNaN(Date.parse(rawTo)) ? new Date(rawTo).toISOString() : undefined;
  if (from && to && from > to) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  const docs = await listActivities(session.user.id, baby._id.toHexString(), limit, type, from, to);
  return NextResponse.json({ activities: docs.map(toActivityDto), syncedAt: new Date().toISOString() }, { headers: privateNoStore });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) return NextResponse.json({ error: "Onboarding required" }, { status: 409 });
  const body: unknown = await request.json();
  const parsed = activityInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const rawMutationId = body && typeof body === "object" && "clientMutationId" in body ? (body as { clientMutationId?: unknown }).clientMutationId : undefined;
  const clientMutationId = typeof rawMutationId === "string" && rawMutationId.length >= 8 && rawMutationId.length <= 200 ? rawMutationId : undefined;
  if (parsed.data.type === "sleep" && new Date(parsed.data.endedAt) < new Date(parsed.data.occurredAt)) {
    return NextResponse.json({ error: "Wake time must be after sleep time" }, { status: 400 });
  }
  const doc = await createActivity(session.user.id, baby._id.toHexString(), parsed.data, clientMutationId);
  return NextResponse.json({ activity: toActivityDto(doc) }, { status: 201, headers: privateNoStore });
}
