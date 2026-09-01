import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const cloudinaryConnectionSchema = new Schema(
  {
    userId: { type: String, required: true },
    oauthClientId: { type: String, default: "", trim: true },
    oauthRedirectUri: { type: String, default: "", trim: true },
    cloudName: { type: String, default: "", trim: true },
    accountSubject: { type: String, default: "", trim: true },
    accountEmail: { type: String, default: "", trim: true, lowercase: true },
    accountName: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: false },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, required: true, select: false },
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    scope: [{ type: String }],
    uploadPrefix: { type: String, default: "https://api.cloudinary.com" },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);

// A Cloudinary cloud name identifies a product environment. Re-authorizing the
// same environment refreshes the existing connection rather than creating a duplicate.
cloudinaryConnectionSchema.index(
  { userId: 1, cloudName: 1 },
  { unique: true, name: "cloudinary_user_cloud_unique" },
);
// Only one Cloudinary connection can be active for a user. The storage layer also
// coordinates this flag across provider adapters when more providers are added.
cloudinaryConnectionSchema.index(
  { userId: 1, isActive: 1 },
  {
    unique: true,
    name: "cloudinary_user_active_unique",
    partialFilterExpression: { isActive: true },
  },
);
cloudinaryConnectionSchema.index(
  { userId: 1, updatedAt: -1 },
  { name: "cloudinary_user_recent" },
);

export type CloudinaryConnectionDocument = InferSchemaType<typeof cloudinaryConnectionSchema>;
export const CloudinaryConnectionModel: Model<CloudinaryConnectionDocument> =
  (models.CloudinaryConnection as Model<CloudinaryConnectionDocument> | undefined) ??
  model<CloudinaryConnectionDocument>("CloudinaryConnection", cloudinaryConnectionSchema);
