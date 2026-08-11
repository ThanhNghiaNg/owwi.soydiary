import type { ObjectId } from "mongodb";
import type { AnalysisResult, AnalysisWindow } from "./analysis.dto";

export type AnalysisDocument = {
  _id?: ObjectId;
  ownerId: string;
  babyId: ObjectId;
  windowDays: AnalysisWindow;
  timeZone: string;
  model: string;
  analysis: AnalysisResult;
  activityCount: number;
  generatedAt: Date;
  updatedAt: Date;
};
