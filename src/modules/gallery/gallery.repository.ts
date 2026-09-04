import { ObjectId, type Filter } from "mongodb";
import { db } from "@/lib/mongodb";
import type { ActivityDocument } from "@/modules/activity/activity.model";
import type { ActivityType } from "@/modules/activity/activity.dto";
import type { GalleryCursorPosition } from "./gallery.cursor";
import type { GallerySummary } from "./gallery.types";

const collection = async () => (await db()).collection<ActivityDocument>("activities");

type GalleryQuery = {
  ownerId: string;
  babyId: string;
  limit: number;
  type?: ActivityType;
  cursor?: GalleryCursorPosition;
};

type GalleryResult = {
  activities: ActivityDocument[];
  summary: GallerySummary;
  hasMore: boolean;
};

function galleryFilter(ownerId: string, babyId: string, type?: ActivityType): Filter<ActivityDocument> {
  return {
    ownerId,
    babyId: new ObjectId(babyId),
    ...(type ? { type } : {}),
    $or: [
      { "media.0": { $exists: true } },
      { media: { $exists: false }, "images.0": { $exists: true } },
    ],
  } as Filter<ActivityDocument>;
}

export async function listGalleryActivities(query: GalleryQuery): Promise<GalleryResult> {
  const col = await collection();
  const baseFilter = galleryFilter(query.ownerId, query.babyId, query.type);
  const pageFilter: Filter<ActivityDocument> = query.cursor
    ? {
        ...baseFilter,
        $or: [
          { occurredAt: { $lt: query.cursor.occurredAt } },
          { occurredAt: query.cursor.occurredAt, _id: { $lt: query.cursor.id } },
        ],
      }
    : baseFilter;

  const [pageDocuments, summaryDocument] = await Promise.all([
    col.find(pageFilter).sort({ occurredAt: -1, _id: -1 }).limit(query.limit + 1).toArray(),
    col.aggregate<{ _id: null; activityCount: number; mediaCount: number }>([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          activityCount: { $sum: 1 },
          mediaCount: {
            $sum: {
              $size: {
                $cond: [
                  { $isArray: "$media" },
                  "$media",
                  { $ifNull: ["$images", []] },
                ],
              },
            },
          },
        },
      },
    ]).next(),
  ]);

  const hasMore = pageDocuments.length > query.limit;
  return {
    activities: hasMore ? pageDocuments.slice(0, query.limit) : pageDocuments,
    summary: summaryDocument
      ? { activityCount: summaryDocument.activityCount, mediaCount: summaryDocument.mediaCount }
      : { activityCount: 0, mediaCount: 0 },
    hasMore,
  };
}
