import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Missing MONGODB_URI");

const options = {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
};

declare global {
  var __babytrackMongoClient: MongoClient | undefined;
}

const client = global.__babytrackMongoClient ?? new MongoClient(uri, options);
if (process.env.NODE_ENV !== "production") global.__babytrackMongoClient = client;

export default client;

export async function db() {
  await client.connect();
  return client.db("babytrack");
}
