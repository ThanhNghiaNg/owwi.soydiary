import assert from "node:assert/strict";
import test from "node:test";
import {
  activityMetadataPayload,
  describeActivitySaveFailure,
  durableActivityImages,
  hydrateDraftImages,
  isPersistedActivitySaveDraft,
  pendingActivityImageCount,
  persistActivitySaveDraft,
  type ActivitySaveDraft,
  type ActivitySaveImage,
} from "./activity-save-draft.ts";

const file = new File(["image"], "moment.png", { type: "image/png", lastModified: 123 });
const images: ActivitySaveImage[] = [
  { url: "blob:preview", storageKey: "pending-image", file },
  {
    url: "https://res.cloudinary.com/example/image/upload/saved.jpg",
    storageKey: "saved-image",
    provider: "cloudinary",
    connectionId: "connection-1",
  },
];

const draft: ActivitySaveDraft = {
  version: 2,
  id: "job-1",
  babyId: "baby-1",
  type: "moment",
  input: {
    type: "moment",
    occurredAt: "2026-09-03T10:00:00.000Z",
    note: "Khoảnh khắc",
    images: [],
  },
  images,
  uploadFolderKey: "activity-folder",
  clientMutationId: "mutation-1",
  submittedAt: 123,
};

test("separates durable images from pending files", () => {
  assert.equal(pendingActivityImageCount(images), 1);
  assert.deepEqual(durableActivityImages(images), [{
    url: "https://res.cloudinary.com/example/image/upload/saved.jpg",
    storageKey: "saved-image",
    provider: "cloudinary",
    connectionId: "connection-1",
  }]);
});

test("builds the first database write without pending image payloads", () => {
  const payload = activityMetadataPayload(draft);
  assert.deepEqual(payload.images, [{
    url: "https://res.cloudinary.com/example/image/upload/saved.jpg",
    storageKey: "saved-image",
    provider: "cloudinary",
    connectionId: "connection-1",
  }]);
  assert.equal(payload.imageSyncStatus, "pending");
  assert.equal(payload.imageSyncExpectedCount, 2);
});

test("preserves an active image job when editing non-image fields", () => {
  const payload = activityMetadataPayload({
    ...draft,
    activityId: "activity-1",
    images: [images[1]!],
    preserveImageSync: true,
    input: {
      ...draft.input,
      images: [images[1]!],
      imageSyncStatus: "failed",
      imageSyncExpectedCount: 2,
    },
  });
  assert.equal("images" in payload, false);
  assert.equal("imageSyncStatus" in payload, false);
  assert.equal("imageSyncExpectedCount" in payload, false);
  assert.equal(payload.note, "Khoảnh khắc");
});

test("persists files without volatile blob URLs and hydrates a fresh preview", () => {
  const persisted = persistActivitySaveDraft(draft, "upload", "pending");
  assert.equal(isPersistedActivitySaveDraft(persisted), true);
  assert.deepEqual(persisted.images[0], { kind: "pending", storageKey: "pending-image", file });

  const hydrated = hydrateDraftImages(persisted.images, () => "blob:fresh-preview");
  assert.deepEqual(hydrated.images[0], { url: "blob:fresh-preview", storageKey: "pending-image", file });
  assert.deepEqual(hydrated.objectUrls, ["blob:fresh-preview"]);
});

test("maps storage connection failures to an actionable retry state", () => {
  assert.deepEqual(describeActivitySaveFailure(new Error("STORAGE_CONNECTION_REQUIRED")), {
    code: "STORAGE_CONNECTION_REQUIRED",
    storageIssue: "connection-required",
    message: "Bạn chưa có nơi lưu ảnh. Hãy kết nối Cloudinary hoặc Google Drive rồi tải ảnh lại.",
  });
});
