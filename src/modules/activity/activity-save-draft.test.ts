import assert from "node:assert/strict";
import test from "node:test";
import {
  activityMetadataPayload,
  describeActivitySaveFailure,
  durableActivityMedia,
  hydrateDraftMedia,
  isPersistedActivitySaveDraft,
  normalizePersistedActivitySaveDraft,
  pendingActivityMediaCount,
  persistActivitySaveDraft,
  type ActivitySaveDraft,
  type ActivitySaveMedia,
} from "./activity-save-draft.ts";
import {
  ActivityMediaUploadError,
  mediaKindForMimeType,
  uploadPendingActivityMedia,
} from "./activity-media-upload.ts";
import { hasExpectedMediaSignature } from "../integrations/storage/media-signature.ts";

const videoFile = new File(["video"], "moment.mp4", { type: "video/mp4", lastModified: 123 });
const media: ActivitySaveMedia[] = [
  {
    kind: "video",
    mimeType: "video/mp4",
    url: "blob:preview",
    storageKey: "pending-video",
    durationMs: 4200,
    file: videoFile,
  },
  {
    kind: "image",
    mimeType: "image/jpeg",
    url: "https://res.cloudinary.com/example/image/upload/saved.jpg",
    storageKey: "saved-image",
    provider: "cloudinary",
    connectionId: "connection-1",
  },
];

const draft: ActivitySaveDraft = {
  version: 3,
  id: "job-1",
  babyId: "baby-1",
  type: "moment",
  input: {
    type: "moment",
    occurredAt: "2026-09-03T10:00:00.000Z",
    note: "Khoảnh khắc",
    media: [],
  },
  media,
  uploadFolderKey: "activity-folder",
  clientMutationId: "mutation-1",
  submittedAt: 123,
};

test("separates durable media from pending image and video files", () => {
  assert.equal(pendingActivityMediaCount(media), 1);
  assert.deepEqual(durableActivityMedia(media), [{
    kind: "image",
    mimeType: "image/jpeg",
    url: "https://res.cloudinary.com/example/image/upload/saved.jpg",
    storageKey: "saved-image",
    provider: "cloudinary",
    connectionId: "connection-1",
  }]);
});

test("builds the first database write without pending media payloads", () => {
  const payload = activityMetadataPayload(draft);
  assert.deepEqual(payload.media, durableActivityMedia(media));
  assert.equal(payload.mediaSyncStatus, "pending");
  assert.equal(payload.mediaSyncExpectedCount, 2);
});

test("preserves an active media job when editing non-media fields", () => {
  const payload = activityMetadataPayload({
    ...draft,
    activityId: "activity-1",
    media: [media[1]!],
    preserveMediaSync: true,
    input: {
      ...draft.input,
      media: [media[1]!],
      mediaSyncStatus: "failed",
      mediaSyncExpectedCount: 2,
    },
  });
  assert.equal("media" in payload, false);
  assert.equal("mediaSyncStatus" in payload, false);
  assert.equal("mediaSyncExpectedCount" in payload, false);
  assert.equal(payload.note, "Khoảnh khắc");
});

test("persists video Files without blob URLs and hydrates a fresh preview", () => {
  const persisted = persistActivitySaveDraft(draft, "upload", "pending");
  assert.equal(isPersistedActivitySaveDraft(persisted), true);
  assert.deepEqual(persisted.media[0], {
    state: "pending",
    kind: "video",
    mimeType: "video/mp4",
    storageKey: "pending-video",
    file: videoFile,
  });

  const hydrated = hydrateDraftMedia(persisted.media, () => "blob:fresh-preview");
  assert.deepEqual(hydrated.media[0], {
    kind: "video",
    mimeType: "video/mp4",
    url: "blob:fresh-preview",
    storageKey: "pending-video",
    file: videoFile,
  });
  assert.deepEqual(hydrated.objectUrls, ["blob:fresh-preview"]);
});

test("migrates a version 2 image job without losing its File", () => {
  const imageFile = new File(["image"], "legacy.png", { type: "image/png" });
  const migrated = normalizePersistedActivitySaveDraft({
    version: 2,
    id: "legacy-job",
    babyId: "baby-1",
    type: "moment",
    input: {
      type: "moment",
      occurredAt: "2026-09-03T10:00:00.000Z",
      note: "",
      images: [{ url: "https://pending.invalid/legacy-key", storageKey: "legacy-key" }],
      imageSyncStatus: "pending",
      imageSyncExpectedCount: 1,
    },
    images: [{ kind: "pending", storageKey: "legacy-key", file: imageFile }],
    uploadFolderKey: "activity-folder",
    clientMutationId: "mutation-legacy",
    submittedAt: 100,
    phase: "upload",
    status: "failed",
  });
  assert.ok(migrated);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.media[0]?.state, "pending");
  assert.equal(migrated.media[0]?.kind, "image");
  assert.equal(migrated.media[0]?.state === "pending" ? migrated.media[0].file : undefined, imageFile);
  assert.equal(migrated.input.mediaSyncStatus, "pending");
});

test("maps storage connection failures to an actionable retry state", () => {
  assert.deepEqual(describeActivitySaveFailure(new Error("STORAGE_CONNECTION_REQUIRED")), {
    code: "STORAGE_CONNECTION_REQUIRED",
    storageIssue: "connection-required",
    message: "Bạn chưa có nơi lưu media. Hãy kết nối Cloudinary hoặc Google Drive rồi tải lại.",
  });
});

test("recognizes supported image and video MIME types", () => {
  assert.equal(mediaKindForMimeType("image/avif"), "image");
  assert.equal(mediaKindForMimeType("video/mp4"), "video");
  assert.equal(mediaKindForMimeType("video/quicktime"), "video");
  assert.equal(mediaKindForMimeType("application/octet-stream"), undefined);
});

test("rejects renamed files and accepts MP4/WebM signatures", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  const renamed = new TextEncoder().encode("this is not a video");
  assert.equal(hasExpectedMediaSignature("video/mp4", mp4), true);
  assert.equal(hasExpectedMediaSignature("video/webm", webm), true);
  assert.equal(hasExpectedMediaSignature("video/mp4", renamed), false);
});

test("uploads a mixed image/video batch and keeps media metadata", async () => {
  const originalFetch = globalThis.fetch;
  const imageFile = new File(["image"], "photo.jpg", { type: "image/jpeg" });
  const clipFile = new File(["video"], "clip.mp4", { type: "video/mp4" });
  globalThis.fetch = async (_input, init) => {
    const body = init?.body as FormData;
    assert.deepEqual(JSON.parse(String(body.get("keys"))), ["image-key", "video-key"]);
    return new Response(JSON.stringify({
      uploads: [
        { key: "image-key", secureUrl: "https://cdn.example/photo.jpg", publicId: "stored-image", kind: "image", mimeType: "image/jpeg", provider: "cloudinary", connectionId: "connection-1" },
        { key: "video-key", secureUrl: "https://cdn.example/clip.mp4", publicId: "stored-video", kind: "video", mimeType: "video/mp4", provider: "cloudinary", connectionId: "connection-1", posterUrl: "https://cdn.example/clip.jpg", durationMs: 2500 },
      ],
      failures: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const uploaded = await uploadPendingActivityMedia([
      { kind: "image", mimeType: "image/jpeg", url: "blob:image", storageKey: "image-key", file: imageFile },
      { kind: "video", mimeType: "video/mp4", url: "blob:video", storageKey: "video-key", file: clipFile },
    ], "folder");
    assert.equal(uploaded[0]?.storageKey, "stored-image");
    assert.equal(uploaded[1]?.storageKey, "stored-video");
    assert.equal(uploaded[1]?.kind, "video");
    assert.equal(uploaded[1]?.durationMs, 2500);
    assert.equal("file" in uploaded[0]!, false);
    assert.equal("file" in uploaded[1]!, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("partial upload retains only failed Files for retry", async () => {
  const originalFetch = globalThis.fetch;
  const imageFile = new File(["image"], "photo.jpg", { type: "image/jpeg" });
  const clipFile = new File(["video"], "clip.mp4", { type: "video/mp4" });
  globalThis.fetch = async () => new Response(JSON.stringify({
    uploads: [
      { key: "image-key", secureUrl: "https://cdn.example/photo.jpg", publicId: "stored-image", kind: "image", mimeType: "image/jpeg", provider: "google-drive", connectionId: "connection-1" },
    ],
    failures: [{ key: "video-key", error: "STORAGE_UPLOAD_FAILED" }],
  }), { status: 502, headers: { "content-type": "application/json" } });
  try {
    await assert.rejects(
      uploadPendingActivityMedia([
        { kind: "image", mimeType: "image/jpeg", url: "blob:image", storageKey: "image-key", file: imageFile },
        { kind: "video", mimeType: "video/mp4", url: "blob:video", storageKey: "video-key", file: clipFile },
      ], "folder"),
      (error: unknown) => {
        assert.ok(error instanceof ActivityMediaUploadError);
        assert.equal("file" in error.media[0]!, false);
        assert.equal(error.media[0]?.storageKey, "stored-image");
        assert.equal(error.media[1]?.file, clipFile);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
