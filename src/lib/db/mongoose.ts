import mongoose from "mongoose";
import { env } from "@/lib/env";

type Cache = { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalWithMongoose = globalThis as typeof globalThis & { mongooseCache?: Cache };
const cache = globalWithMongoose.mongooseCache ?? { connection: null, promise: null };
globalWithMongoose.mongooseCache = cache;

export async function connectMongoose(): Promise<typeof mongoose> {
  if (cache.connection) return cache.connection;
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  cache.promise ??= mongoose.connect(env.MONGODB_URI, {
    dbName: "babytrack",
    bufferCommands: false,
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
  });
  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    // A transient cold-start failure must not poison this warm function forever.
    cache.promise = null;
    throw error;
  }
}
