import type { ActivityInput, ActivityMedia, ActivityType } from "./activity.dto";

export type ActivitySaveMedia = ActivityMedia & { file?: File };

export type ActivitySaveFailure = {
  code: string;
  message: string;
  storageIssue?: "connection-required" | "reconnect-required";
};

export type ActivitySavePhase = "activity" | "upload" | "sync";
export type ActivitySaveJobStatus = "pending" | "uploading" | "failed";

export type ActivitySaveDraft = {
  version: 3;
  id: string;
  babyId: string;
  type: ActivityType;
  activityId?: string;
  input: ActivityInput;
  media: ActivitySaveMedia[];
  uploadFolderKey: string;
  clientMutationId: string;
  submittedAt: number;
  preserveMediaSync?: boolean;
};

export type PersistedDraftMedia =
  | { state: "pending"; kind: "image" | "video"; mimeType: string; storageKey: string; file: File }
  | ({ state: "uploaded" } & ActivityMedia);

export type PersistedActivitySaveDraft = Omit<ActivitySaveDraft, "media"> & {
  phase: ActivitySavePhase;
  status: ActivitySaveJobStatus;
  media: PersistedDraftMedia[];
  failure?: ActivitySaveFailure;
};

function pendingMediaUrl(storageKey: string) {
  return `https://pending.invalid/${encodeURIComponent(storageKey)}`;
}

export function durableActivityMedia(media: readonly ActivitySaveMedia[]): ActivityInput["media"] {
  return media.flatMap((item) => {
    if (item.file) return [];
    const { file: _file, ...storedMedia } = item;
    return [storedMedia];
  });
}

export function pendingActivityMediaCount(media: readonly ActivitySaveMedia[]) {
  return media.reduce((count, item) => count + (item.file ? 1 : 0), 0);
}

export function activityMetadataPayload(draft: ActivitySaveDraft): Record<string, unknown> {
  const pendingCount = pendingActivityMediaCount(draft.media);
  if (draft.preserveMediaSync && draft.activityId && pendingCount === 0) {
    const {
      media: _media,
      mediaSyncStatus: _mediaSyncStatus,
      mediaSyncExpectedCount: _mediaSyncExpectedCount,
      ...nonMediaInput
    } = draft.input;
    return nonMediaInput;
  }
  return {
    ...draft.input,
    media: durableActivityMedia(draft.media),
    mediaSyncStatus: pendingCount ? "pending" : "synced",
    mediaSyncExpectedCount: draft.media.length,
  };
}

/** Drops volatile blob URLs while retaining Files for IndexedDB structured cloning. */
export function persistDraftMedia(media: readonly ActivitySaveMedia[]): PersistedDraftMedia[] {
  return media.map((item) => item.file
    ? { state: "pending", kind: item.kind, mimeType: item.mimeType, storageKey: item.storageKey, file: item.file }
    : { state: "uploaded", ...item });
}

function isUploadedMedia(value: unknown): value is PersistedDraftMedia & { state: "uploaded" } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.state === "uploaded"
    && (item.kind === "image" || item.kind === "video")
    && typeof item.mimeType === "string"
    && typeof item.storageKey === "string"
    && typeof item.url === "string";
}

function isPendingMedia(value: unknown): value is PersistedDraftMedia & { state: "pending" } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.state === "pending"
    && (item.kind === "image" || item.kind === "video")
    && typeof item.mimeType === "string"
    && typeof item.storageKey === "string"
    && typeof File !== "undefined"
    && item.file instanceof File;
}

export function isPersistedDraftMediaList(value: unknown): value is PersistedDraftMedia[] {
  return Array.isArray(value) && value.every((item) => isPendingMedia(item) || isUploadedMedia(item));
}

export function hydrateDraftMedia(
  media: readonly PersistedDraftMedia[],
  createObjectUrl: (file: File) => string = (file) => URL.createObjectURL(file),
) {
  const objectUrls: string[] = [];
  const hydratedMedia = media.map((item): ActivitySaveMedia => {
    if (item.state === "pending") {
      const url = createObjectUrl(item.file);
      objectUrls.push(url);
      return { kind: item.kind, mimeType: item.mimeType, url, storageKey: item.storageKey, file: item.file };
    }
    const { state: _state, ...storedMedia } = item;
    return storedMedia;
  });
  return { media: hydratedMedia, objectUrls };
}

export function describeActivitySaveFailure(error: unknown): ActivitySaveFailure {
  const code = error instanceof Error ? error.message : "";
  if (code === "STORAGE_CONNECTION_REQUIRED") return {
    code,
    storageIssue: "connection-required",
    message: "Bạn chưa có nơi lưu media. Hãy kết nối Cloudinary hoặc Google Drive rồi tải lại.",
  };
  if (code === "STORAGE_RECONNECT_REQUIRED") return {
    code,
    storageIssue: "reconnect-required",
    message: "Nơi lưu media cần được kết nối lại trước khi tải lên.",
  };
  if (code === "STORAGE_NOT_CONFIGURED") return {
    code,
    storageIssue: "connection-required",
    message: "Chưa có dịch vụ lưu media khả dụng trên máy chủ.",
  };
  if (code === "MEDIA_PAYLOAD_TOO_LARGE" || code === "IMAGE_PAYLOAD_TOO_LARGE") {
    return { code, message: "Tổng dung lượng media quá lớn. Hãy chọn lại file nhẹ hơn." };
  }
  if (code === "UNSUPPORTED_MEDIA" || code === "UNSUPPORTED_IMAGE") {
    return { code, message: "Định dạng ảnh hoặc video này chưa được hỗ trợ." };
  }
  if (code === "MEDIA_QUEUE_UNAVAILABLE" || code === "IMAGE_QUEUE_UNAVAILABLE") {
    return { code, message: "Không thể giữ media trên thiết bị để tải nền. Hãy kiểm tra quyền lưu trữ của trình duyệt rồi thử lại." };
  }
  if (code === "ACTIVITY_MEDIA_SYNC_FAILED" || code === "ACTIVITY_IMAGE_SYNC_FAILED") {
    return { code, message: "Media đã tải lên nhưng chưa thể đồng bộ vào hoạt động. Ứng dụng sẽ thử lại." };
  }
  if (code.includes("STORAGE") || code.includes("UPLOAD")) {
    return { code: code || "STORAGE_UPLOAD_FAILED", message: "Chưa thể tải media lên storage. Các file còn lại vẫn được giữ để thử lại." };
  }
  return { code: code || "ACTIVITY_SAVE_FAILED", message: "Chưa thể lưu hoạt động. Bạn kiểm tra mạng rồi thử lại nhé." };
}

/** Creates a validation-safe payload while keeping local File objects outside JSON. */
export function withActivitySaveMedia(input: ActivityInput, media: readonly ActivitySaveMedia[]): ActivityInput {
  const storedMedia = media.map((item) => {
    const { file: _file, ...storedItem } = item;
    return item.file ? { ...storedItem, url: pendingMediaUrl(item.storageKey) } : storedItem;
  });
  return { ...input, media: storedMedia } as ActivityInput;
}

export function persistActivitySaveDraft(
  draft: ActivitySaveDraft,
  phase: ActivitySavePhase,
  status: ActivitySaveJobStatus,
  failure?: ActivitySaveFailure,
): PersistedActivitySaveDraft {
  return {
    ...draft,
    input: withActivitySaveMedia(draft.input, draft.media),
    phase,
    status,
    media: persistDraftMedia(draft.media),
    ...(failure ? { failure } : {}),
  };
}

export function workerDraftFromPersisted(draft: PersistedActivitySaveDraft): ActivitySaveDraft {
  return {
    ...draft,
    media: draft.media.map((item): ActivitySaveMedia => item.state === "pending"
      ? { kind: item.kind, mimeType: item.mimeType, storageKey: item.storageKey, file: item.file, url: pendingMediaUrl(item.storageKey) }
      : (({ state: _state, ...storedMedia }) => storedMedia)(item)),
  };
}

function isActivityInput(value: unknown): value is ActivityInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<ActivityInput>;
  return typeof input.type === "string" && typeof input.occurredAt === "string" && typeof input.note === "string" && Array.isArray(input.media);
}

export function isPersistedActivitySaveDraft(value: unknown): value is PersistedActivitySaveDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<PersistedActivitySaveDraft>;
  return draft.version === 3
    && typeof draft.id === "string"
    && typeof draft.babyId === "string"
    && typeof draft.type === "string"
    && (draft.activityId === undefined || typeof draft.activityId === "string")
    && typeof draft.uploadFolderKey === "string"
    && typeof draft.clientMutationId === "string"
    && typeof draft.submittedAt === "number"
    && (draft.phase === "activity" || draft.phase === "upload" || draft.phase === "sync")
    && (draft.status === "pending" || draft.status === "uploading" || draft.status === "failed")
    && isPersistedDraftMediaList(draft.media)
    && isActivityInput(draft.input);
}

function migrateLegacyV2Draft(value: unknown): PersistedActivitySaveDraft | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.version !== 2 || !Array.isArray(legacy.images) || !legacy.input || typeof legacy.input !== "object") return null;
  const media: PersistedDraftMedia[] = [];
  for (const rawItem of legacy.images) {
    if (!rawItem || typeof rawItem !== "object") return null;
    const item = rawItem as Record<string, unknown>;
    if (item.kind === "pending" && typeof item.storageKey === "string" && typeof File !== "undefined" && item.file instanceof File) {
      media.push({ state: "pending", kind: "image", mimeType: item.file.type || "image/jpeg", storageKey: item.storageKey, file: item.file });
      continue;
    }
    if (item.kind === "uploaded" && typeof item.url === "string" && typeof item.storageKey === "string") {
      media.push({
        state: "uploaded",
        kind: "image",
        mimeType: "image/jpeg",
        url: item.url,
        storageKey: item.storageKey,
        ...(item.provider === "cloudinary" || item.provider === "google-drive" ? { provider: item.provider } : {}),
        ...(typeof item.connectionId === "string" ? { connectionId: item.connectionId } : {}),
      });
      continue;
    }
    return null;
  }
  const legacyInput = legacy.input as Record<string, unknown>;
  const { images: _images, imageSyncStatus, imageSyncExpectedCount, ...inputRest } = legacyInput;
  const input = {
    ...inputRest,
    media: media.map((item) => item.state === "pending"
      ? { kind: item.kind, mimeType: item.mimeType, storageKey: item.storageKey, url: pendingMediaUrl(item.storageKey) }
      : (({ state: _state, ...storedMedia }) => storedMedia)(item)),
    ...(imageSyncStatus === undefined ? {} : { mediaSyncStatus: imageSyncStatus }),
    ...(imageSyncExpectedCount === undefined ? {} : { mediaSyncExpectedCount: imageSyncExpectedCount }),
  } as ActivityInput;
  const migrated = {
    ...legacy,
    version: 3,
    input,
    media,
    preserveMediaSync: legacy.preserveImageSync === true,
  } as unknown as PersistedActivitySaveDraft;
  delete (migrated as unknown as Record<string, unknown>).images;
  delete (migrated as unknown as Record<string, unknown>).preserveImageSync;
  return isPersistedActivitySaveDraft(migrated) ? migrated : null;
}

export function normalizePersistedActivitySaveDraft(value: unknown): PersistedActivitySaveDraft | null {
  if (isPersistedActivitySaveDraft(value)) return value;
  return migrateLegacyV2Draft(value);
}
