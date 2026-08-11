import type { ObjectId } from "mongodb";
export interface BabyDocument {
  _id?: ObjectId;
  ownerId: string;
  name: string;
  birthDate: string;
  createdAt: Date;
  updatedAt: Date;
}
