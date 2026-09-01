import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { getStorageSettings } from "@/modules/integrations/storage/storage.service";

export async function GET() {
  try {
    const actor = await requireActor();
    return NextResponse.json(await getStorageSettings(actor.id));
  } catch (error) {
    return apiError(error);
  }
}
