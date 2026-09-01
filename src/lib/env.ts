import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().optional(), AUTH_SECRET: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(), AUTH_GOOGLE_SECRET: z.string().optional(),
  GOOGLE_DRIVE_CLIENT_ID: z.string().optional(), GOOGLE_DRIVE_CLIENT_SECRET: z.string().optional(),
});

export const env = envSchema.parse({
  MONGODB_URI: process.env.MONGODB_URI, AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID,
  GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
});

export const isCloudinaryOAuthConfigured = Boolean(env.AUTH_SECRET);
export const isGoogleDriveOAuthConfigured = Boolean(
  ((env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET) ||
    (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)) && env.AUTH_SECRET,
);
