export const STORAGE_ROOT_FOLDER = "soydiary";
export const MAX_ACTIVITY_MEDIA = 20;
/** @deprecated Use MAX_ACTIVITY_MEDIA. */
export const MAX_ACTIVITY_IMAGES = MAX_ACTIVITY_MEDIA;
export const MAX_UPLOAD_FILES_PER_REQUEST = 10;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_BATCH_BYTES = 100 * 1024 * 1024;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const ACCEPTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ACCEPTED_MEDIA_MIME_TYPES = [
  ...ACCEPTED_IMAGE_MIME_TYPES,
  ...ACCEPTED_VIDEO_MIME_TYPES,
] as const;
