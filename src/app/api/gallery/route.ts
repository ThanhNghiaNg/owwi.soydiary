import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBabyByOwner } from "@/modules/baby/baby.repository";
import type { ActivityType } from "@/modules/activity/activity.dto";
import { toActivityDto } from "@/modules/activity/activity.mapper";
import { ACTIVITY_REGISTRY } from "@/modules/activity/activity.registry";
import {
  decodeGalleryCursor,
  encodeGalleryCursor,
  InvalidGalleryCursorError,
  type GalleryCursorPosition,
} from "@/modules/gallery/gallery.cursor";
import { listGalleryActivities } from "@/modules/gallery/gallery.repository";
import {
  GALLERY_PAGE_SIZE,
  type GalleryFilter,
  type GalleryPage,
} from "@/modules/gallery/gallery.types";

const MAX_GALLERY_PAGE_SIZE = 48;
const activityTypes = new Set<ActivityType>(ACTIVITY_REGISTRY.map(({ type }) => type));
const privateNoStore = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

type ParsedGalleryQuery = {
  limit: number;
  filter: GalleryFilter;
  type?: ActivityType;
  cursor?: GalleryCursorPosition;
};

function invalidRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: privateNoStore });
}

function hasRepeatedParameter(params: URLSearchParams, name: string) {
  return params.getAll(name).length > 1;
}

function parseGalleryQuery(request: NextRequest): ParsedGalleryQuery | NextResponse {
  const params = request.nextUrl.searchParams;
  if (["limit", "type", "cursor"].some((name) => hasRepeatedParameter(params, name))) {
    return invalidRequest("Invalid gallery query");
  }

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? GALLERY_PAGE_SIZE : Number(rawLimit);
  if (
    (rawLimit !== null && !/^\d+$/.test(rawLimit))
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > MAX_GALLERY_PAGE_SIZE
  ) {
    return invalidRequest(`limit must be an integer between 1 and ${MAX_GALLERY_PAGE_SIZE}`);
  }

  const rawType = params.get("type");
  if (rawType !== null && (rawType === "" || (rawType !== "all" && !activityTypes.has(rawType as ActivityType)))) {
    return invalidRequest("Invalid activity type");
  }
  const type = rawType && rawType !== "all" ? rawType as ActivityType : undefined;
  const filter: GalleryFilter = type ?? "all";

  const rawCursor = params.get("cursor");
  if (rawCursor === "") return invalidRequest("Invalid gallery cursor");
  try {
    const cursor = rawCursor ? decodeGalleryCursor(rawCursor, filter) : undefined;
    return {
      limit,
      filter,
      ...(type ? { type } : {}),
      ...(cursor ? { cursor } : {}),
    };
  } catch (error) {
    if (error instanceof InvalidGalleryCursorError) return invalidRequest("Invalid gallery cursor");
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: privateNoStore });
  }

  const parsed = parseGalleryQuery(request);
  if (parsed instanceof NextResponse) return parsed;

  const baby = await getBabyByOwner(session.user.id);
  if (!baby?._id) {
    const emptyPage: GalleryPage = {
      activities: [],
      summary: { activityCount: 0, mediaCount: 0 },
      syncedAt: new Date().toISOString(),
    };
    return NextResponse.json(emptyPage, { headers: privateNoStore });
  }

  const result = await listGalleryActivities({
    ownerId: session.user.id,
    babyId: baby._id.toHexString(),
    limit: parsed.limit,
    ...(parsed.type ? { type: parsed.type } : {}),
    ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
  });
  const lastActivity = result.activities.at(-1);
  const nextCursor = result.hasMore && lastActivity?._id
    ? encodeGalleryCursor(
        { occurredAt: lastActivity.occurredAt, id: lastActivity._id },
        parsed.filter,
      )
    : undefined;
  const page: GalleryPage = {
    activities: result.activities.map(toActivityDto),
    summary: result.summary,
    syncedAt: new Date().toISOString(),
    ...(nextCursor ? { nextCursor } : {}),
  };
  return NextResponse.json(page, { headers: privateNoStore });
}
