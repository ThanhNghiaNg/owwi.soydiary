import { ObjectId, type Filter } from "mongodb";
import { createHash } from "node:crypto";
import { db } from "@/lib/mongodb";
import type { ActivityDocument } from "./activity.model";
import type { ActivityInput, ActivityType } from "./activity.dto";

const collection = async () => (await db()).collection<ActivityDocument>("activities");

export async function ensureActivityIndexes() {
  const col = await collection();
  await Promise.all([
    col.createIndex({ ownerId: 1, babyId: 1, occurredAt: -1, _id: -1 }),
    col.createIndex({ ownerId: 1, babyId: 1, type: 1, occurredAt: -1, _id: -1 }),
  ]);
}

export async function listActivities(ownerId: string, babyId: string, limit = 50, type?: ActivityType, from?: string, to?: string) {
  const query: Filter<ActivityDocument> = { ownerId, babyId: new ObjectId(babyId) };
  if (type) query.type = type;
  if (from || to) query.occurredAt = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
  return (await collection()).find(query).sort({ occurredAt: -1 }).limit(limit).toArray();
}

export async function createActivity(ownerId: string, babyId: string, input: ActivityInput, clientMutationId?: string) {
  const now = new Date();
  const documentId = clientMutationId
    ? new ObjectId(createHash("sha256").update(`${ownerId}:${babyId}:${clientMutationId}`).digest("hex").slice(0, 24))
    : new ObjectId();
  const doc = { ...input, _id: documentId, ownerId, babyId: new ObjectId(babyId), createdAt: now, updatedAt: now } as ActivityDocument;
  const col = await collection();
  if (clientMutationId) {
    const { _id: _documentId, ownerId: _ownerId, babyId: _babyId, createdAt: _createdAt, ...updateFields } = doc;
    const saved = await col.findOneAndUpdate(
      { _id: documentId, ownerId, babyId: new ObjectId(babyId) },
      {
        $set: updateFields,
        $setOnInsert: { ownerId, babyId: new ObjectId(babyId), createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!saved) throw new Error("Failed to create idempotent activity");
    return saved;
  }
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function getActivityById(ownerId: string, babyId: string, activityId: string) {
  if (!ObjectId.isValid(activityId)) return null;
  return (await collection()).findOne({ _id: new ObjectId(activityId), ownerId, babyId: new ObjectId(babyId) });
}

export async function updateActivity(ownerId: string, babyId: string, activityId: string, input: ActivityInput) {
  if (!ObjectId.isValid(activityId)) return null;
  return (await collection()).findOneAndUpdate(
    { _id: new ObjectId(activityId), ownerId, babyId: new ObjectId(babyId) },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function deleteActivity(ownerId: string, babyId: string, activityId: string) {
  if (!ObjectId.isValid(activityId)) return false;
  const result = await (await collection()).deleteOne({
    _id: new ObjectId(activityId),
    ownerId,
    babyId: new ObjectId(babyId),
  });
  return result.deletedCount === 1;
}
