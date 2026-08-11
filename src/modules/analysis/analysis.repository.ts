import { ObjectId } from "mongodb";
import { db } from "@/lib/mongodb";
import type { AnalysisResult, AnalysisWindow } from "./analysis.dto";
import type { AnalysisDocument } from "./analysis.model";

const collection = async () => (await db()).collection<AnalysisDocument>("analysis_results");

export async function getSavedAnalysis(ownerId: string, babyId: string, windowDays: AnalysisWindow) {
  return (await collection()).findOne({ ownerId, babyId: new ObjectId(babyId), windowDays });
}

export async function saveAnalysis(input: {
  ownerId: string;
  babyId: string;
  windowDays: AnalysisWindow;
  timeZone: string;
  model: string;
  analysis: AnalysisResult;
  activityCount: number;
  generatedAt: Date;
}) {
  const col = await collection();
  await col.createIndex({ ownerId: 1, babyId: 1, windowDays: 1 }, { unique: true });
  const now = new Date();
  await col.updateOne(
    { ownerId: input.ownerId, babyId: new ObjectId(input.babyId), windowDays: input.windowDays },
    { $set: { ...input, babyId: new ObjectId(input.babyId), updatedAt: now } },
    { upsert: true },
  );
}
