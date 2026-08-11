import { auth } from "@/auth";
import { babyInputSchema } from "@/modules/baby/baby.dto";
import { getBabyByOwner, upsertBaby } from "@/modules/baby/baby.repository";
import { toBabyDto } from "@/modules/baby/baby.mapper";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const baby = await getBabyByOwner(session.user.id);
  return NextResponse.json({ baby: baby ? toBabyDto(baby) : null });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = babyInputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const baby = await upsertBaby(session.user.id, parsed.data);
  if (!baby) return NextResponse.json({ error: "Failed to save baby" }, { status: 500 });
  return NextResponse.json({ baby: toBabyDto(baby) });
}
