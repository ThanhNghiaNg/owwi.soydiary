import type { ObjectId } from "mongodb";
import type { ActivityInput } from "./activity.dto";
export type ActivityDocument = ActivityInput & {
  _id?: ObjectId;
  babyId: ObjectId;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};
