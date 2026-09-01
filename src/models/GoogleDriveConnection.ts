import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const googleDriveConnectionSchema = new Schema(
  {
    userId: { type: String, required: true },
    googleAccountId: { type: String, required: true, trim: true },
    accountEmail: { type: String, default: "", trim: true, lowercase: true },
    accountName: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: false },
    reconnectRequired: { type: Boolean, default: false },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, required: true, select: false },
    accessTokenExpiresAt: { type: Date, required: true },
    scope: [{ type: String }],
    rootFolderId: { type: String, default: "", trim: true },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);

googleDriveConnectionSchema.index(
  { userId: 1, googleAccountId: 1 },
  { unique: true, name: "google_drive_user_account_unique" },
);
googleDriveConnectionSchema.index(
  { userId: 1, isActive: 1 },
  {
    unique: true,
    name: "google_drive_user_active_unique",
    partialFilterExpression: { isActive: true },
  },
);
googleDriveConnectionSchema.index(
  { userId: 1, updatedAt: -1 },
  { name: "google_drive_user_recent" },
);

export type GoogleDriveConnectionDocument = InferSchemaType<typeof googleDriveConnectionSchema>;
export const GoogleDriveConnectionModel: Model<GoogleDriveConnectionDocument> =
  (models.GoogleDriveConnection as Model<GoogleDriveConnectionDocument> | undefined) ??
  model<GoogleDriveConnectionDocument>("GoogleDriveConnection", googleDriveConnectionSchema);
