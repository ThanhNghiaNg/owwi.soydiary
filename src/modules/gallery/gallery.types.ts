import type { ActivityDto, ActivityType } from "@/modules/activity/activity.dto";

export const GALLERY_PAGE_SIZE = 12;

export type GalleryFilter = "all" | ActivityType;

export type GallerySummary = {
  activityCount: number;
  mediaCount: number;
};

export type GalleryPage = {
  activities: ActivityDto[];
  summary: GallerySummary;
  syncedAt: string;
  nextCursor?: string;
};
