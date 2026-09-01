import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import {
  activateStorageConnection,
  disconnectStorageConnection,
} from "@/modules/integrations/storage/storage.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const actor = await requireActor();
    const { connectionId } = await params;
    const payload = (await request.json().catch(() => ({}))) as { active?: boolean };
    if (payload.active !== true) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    return NextResponse.json(await activateStorageConnection(actor.id, connectionId));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const actor = await requireActor();
    const { connectionId } = await params;
    return NextResponse.json(await disconnectStorageConnection(actor.id, connectionId));
  } catch (error) {
    return apiError(error);
  }
}
