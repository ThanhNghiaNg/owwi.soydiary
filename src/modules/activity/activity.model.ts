import type { ObjectId } from "mongodb";
import type { ActivityInput, ActivityMediaSyncStatus } from "./activity.dto";
export type ActivityDocument = ActivityInput & {
  _id?: ObjectId;
  babyId: ObjectId;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Legacy fields kept readable until an old activity is rewritten. */
  images?: Array<Record<string, unknown>>;
  imageSyncStatus?: ActivityMediaSyncStatus;
  imageSyncExpectedCount?: number;
};
