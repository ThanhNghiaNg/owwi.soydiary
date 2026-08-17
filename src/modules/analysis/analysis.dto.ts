import { z } from "zod";
import { analysisReferenceIds, isAnalysisReferenceId } from "./analysis.references";

const baseAnalysisResultSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  highlights: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    detail: z.string().trim().min(1).max(500),
  })).max(4),
  patterns: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    detail: z.string().trim().min(1).max(500),
  })).max(4),
  nextSteps: z.array(z.string().trim().min(1).max(300)).max(4),
});

export const analysisResultSchema = baseAnalysisResultSchema.extend({
  conclusion: z.string().trim().min(80).max(1600),
  conclusionSourceIds: z.array(z.enum(analysisReferenceIds)).max(3).refine((ids) => new Set(ids).size === ids.length),
});

export const storedAnalysisResultSchema = baseAnalysisResultSchema.extend({
  conclusion: z.string().trim().max(1600).optional().default(""),
  conclusionSourceIds: z.array(z.string()).max(10).optional().default([]).transform((ids) => [...new Set(ids.filter(isAnalysisReferenceId))].slice(0, 3)),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const analysisWindowSchema = z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]);
export type AnalysisWindow = z.infer<typeof analysisWindowSchema>;

export const analysisRequestSchema = z.object({
  days: analysisWindowSchema,
  timeZone: z.string().trim().min(1).max(80).refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("vi-VN", { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Múi giờ không hợp lệ"),
});

export type AnalysisResponse = {
  analysis: AnalysisResult;
  activityCount: number;
  generatedAt: string;
  windowDays: AnalysisWindow;
};
