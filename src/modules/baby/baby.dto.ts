import { z } from "zod";

export const babyInputSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên của bé").max(60),
  birthDate: z.string().date(),
});
export type BabyInput = z.infer<typeof babyInputSchema>;

export const babyDtoSchema = babyInputSchema.extend({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BabyDto = z.infer<typeof babyDtoSchema>;
