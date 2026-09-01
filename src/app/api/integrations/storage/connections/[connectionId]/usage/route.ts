import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { getStorageConnectionUsage } from "@/modules/integrations/storage/storage.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const actor = await requireActor();
    const { connectionId } = await params;
    return NextResponse.json(await getStorageConnectionUsage(actor.id, connectionId));
  } catch (error) {
    return apiError(error);
  }
}
