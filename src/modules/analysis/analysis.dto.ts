import { z } from "zod";

export const analysisResultSchema = z.object({
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
