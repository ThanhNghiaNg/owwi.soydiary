import { db } from "@/lib/mongodb";
import type { BabyDocument } from "./baby.model";
import type { BabyInput } from "./baby.dto";

const collection = async () => (await db()).collection<BabyDocument>("babies");

export async function getBabyByOwner(ownerId: string) {
  return (await collection()).findOne({ ownerId });
}

export async function upsertBaby(ownerId: string, input: BabyInput) {
  const now = new Date();
  await (await collection()).updateOne(
    { ownerId },
    { $set: { ...input, updatedAt: now }, $setOnInsert: { createdAt: now, ownerId } },
    { upsert: true },
  );
  return getBabyByOwner(ownerId);
}
