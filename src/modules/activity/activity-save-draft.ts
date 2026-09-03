import type { ActivityInput, ActivityType } from "./activity.dto";

export type ActivitySaveImage = ActivityInput["images"][number] & { file?: File };

export type ActivitySaveFailure = {
  code: string;
  message: string;
  storageIssue?: "connection-required" | "reconnect-required";
};

export type ActivitySavePhase = "activity" | "upload" | "sync";
export type ActivitySaveJobStatus = "pending" | "uploading" | "failed";

export type ActivitySaveDraft = {
  version: 2;
  id: string;
  babyId: string;
  type: ActivityType;
  activityId?: string;
  input: ActivityInput;
  images: ActivitySaveImage[];
  uploadFolderKey: string;
  clientMutationId: string;
  submittedAt: number;
  preserveImageSync?: boolean;
};

export type PersistedDraftImage =
  | { kind: "pending"; storageKey: string; file: File }
  | {
      kind: "uploaded";
      url: string;
      storageKey: string;
      provider?: "cloudinary" | "google-drive";
      connectionId?: string;
    };

export type PersistedActivitySaveDraft = Omit<ActivitySaveDraft, "images"> & {
  phase: ActivitySavePhase;
  status: ActivitySaveJobStatus;
  images: PersistedDraftImage[];
  failure?: ActivitySaveFailure;
};

function pendingImageUrl(storageKey: string) {
  return `https://pending.invalid/${encodeURIComponent(storageKey)}`;
}

export function durableActivityImages(images: readonly ActivitySaveImage[]): ActivityInput["images"] {
  return images.flatMap((image) => {
    if (image.file) return [];
    const { file: _file, ...storedImage } = image;
    return [storedImage];
  });
}

export function pendingActivityImageCount(images: readonly ActivitySaveImage[]) {
  return images.reduce((count, image) => count + (image.file ? 1 : 0), 0);
}

export function activityMetadataPayload(draft: ActivitySaveDraft): Record<string, unknown> {
  const pendingCount = pendingActivityImageCount(draft.images);
  if (draft.preserveImageSync && draft.activityId && pendingCount === 0) {
    const {
      images: _images,
      imageSyncStatus: _imageSyncStatus,
      imageSyncExpectedCount: _imageSyncExpectedCount,
      ...nonImageInput
    } = draft.input;
    return nonImageInput;
  }
  return {
    ...draft.input,
    images: durableActivityImages(draft.images),
    imageSyncStatus: pendingCount ? "pending" : "synced",
    imageSyncExpectedCount: draft.images.length,
  };
}

/** Drops volatile blob URLs while retaining Files for IndexedDB structured cloning. */
export function persistDraftImages(images: readonly ActivitySaveImage[]): PersistedDraftImage[] {
  return images.map((image) => image.file
    ? { kind: "pending", storageKey: image.storageKey, file: image.file }
    : {
        kind: "uploaded",
        url: image.url,
        storageKey: image.storageKey,
        ...(image.provider ? { provider: image.provider } : {}),
        ...(image.connectionId ? { connectionId: image.connectionId } : {}),
      });
}

export function isPersistedDraftImageList(value: unknown): value is PersistedDraftImage[] {
  if (!Array.isArray(value)) return false;
  return value.every((image) => {
    if (!image || typeof image !== "object") return false;
    const candidate = image as Partial<PersistedDraftImage>;
    if (candidate.kind === "pending") {
      return typeof candidate.storageKey === "string"
        && candidate.storageKey.length > 0
        && typeof File !== "undefined"
        && candidate.file instanceof File;
    }
    return candidate.kind === "uploaded"
      && typeof candidate.storageKey === "string"
      && candidate.storageKey.length > 0
      && typeof candidate.url === "string"
      && candidate.url.length > 0
      && (candidate.provider === undefined || candidate.provider === "cloudinary" || candidate.provider === "google-drive")
      && (candidate.connectionId === undefined || typeof candidate.connectionId === "string");
  });
}

export function hydrateDraftImages(
  images: readonly PersistedDraftImage[],
  createObjectUrl: (file: File) => string = (file) => URL.createObjectURL(file),
) {
  const objectUrls: string[] = [];
  const hydratedImages = images.map((image): ActivitySaveImage => {
    if (image.kind === "pending") {
      const url = createObjectUrl(image.file);
      objectUrls.push(url);
      return { url, storageKey: image.storageKey, file: image.file };
    }
    const { kind: _kind, ...storedImage } = image;
    return storedImage;
  });
  return { images: hydratedImages, objectUrls };
}

export function describeActivitySaveFailure(error: unknown): ActivitySaveFailure {
  const code = error instanceof Error ? error.message : "";
  if (code === "STORAGE_CONNECTION_REQUIRED") {
    return {
      code,
      storageIssue: "connection-required",
      message: "Bạn chưa có nơi lưu ảnh. Hãy kết nối Cloudinary hoặc Google Drive rồi tải ảnh lại.",
    };
  }
  if (code === "STORAGE_RECONNECT_REQUIRED") {
    return {
      code,
      storageIssue: "reconnect-required",
      message: "Nơi lưu ảnh cần được kết nối lại trước khi tải ảnh.",
    };
  }
  if (code === "STORAGE_NOT_CONFIGURED") {
    return {
      code,
      storageIssue: "connection-required",
      message: "Chưa có dịch vụ lưu ảnh khả dụng trên máy chủ.",
    };
  }
  if (code === "IMAGE_PAYLOAD_TOO_LARGE") {
    return { code, message: "Tổng dung lượng ảnh quá lớn. Hãy chọn lại ảnh nhẹ hơn." };
  }
  if (code === "IMAGE_QUEUE_UNAVAILABLE") {
    return { code, message: "Không thể giữ ảnh trên thiết bị để tải nền. Hãy kiểm tra quyền lưu trữ của trình duyệt rồi thử lại." };
  }
  if (code === "ACTIVITY_IMAGE_SYNC_FAILED") {
    return { code, message: "Ảnh đã tải lên nhưng chưa thể đồng bộ vào hoạt động. Ứng dụng sẽ thử lại." };
  }
  if (code.includes("STORAGE") || code.includes("UPLOAD")) {
    return { code: code || "STORAGE_UPLOAD_FAILED", message: "Chưa thể tải ảnh lên storage. Các ảnh còn lại vẫn được giữ để thử lại." };
  }
  return { code: code || "ACTIVITY_SAVE_FAILED", message: "Chưa thể lưu hoạt động. Bạn kiểm tra mạng rồi thử lại nhé." };
}

/** Creates a validation-safe payload while keeping local File objects outside JSON. */
export function withActivitySaveImages(input: ActivityInput, images: readonly ActivitySaveImage[]): ActivityInput {
  const storedImages = images.map((image) => {
    const { file: _file, ...storedImage } = image;
    return image.file ? { ...storedImage, url: pendingImageUrl(image.storageKey) } : storedImage;
  });
  return { ...input, images: storedImages } as ActivityInput;
}

export function persistActivitySaveDraft(
  draft: ActivitySaveDraft,
  phase: ActivitySavePhase,
  status: ActivitySaveJobStatus,
  failure?: ActivitySaveFailure,
): PersistedActivitySaveDraft {
  return {
    ...draft,
    input: withActivitySaveImages(draft.input, draft.images),
    phase,
    status,
    images: persistDraftImages(draft.images),
    ...(failure ? { failure } : {}),
  };
}

export function workerDraftFromPersisted(draft: PersistedActivitySaveDraft): ActivitySaveDraft {
  return {
    ...draft,
    images: draft.images.map((image): ActivitySaveImage => image.kind === "pending"
      ? { storageKey: image.storageKey, file: image.file, url: pendingImageUrl(image.storageKey) }
      : {
          url: image.url,
          storageKey: image.storageKey,
          ...(image.provider ? { provider: image.provider } : {}),
          ...(image.connectionId ? { connectionId: image.connectionId } : {}),
        }),
  };
}

function isActivityInput(value: unknown): value is ActivityInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<ActivityInput>;
  return typeof input.type === "string"
    && typeof input.occurredAt === "string"
    && typeof input.note === "string"
    && Array.isArray(input.images);
}

export function isPersistedActivitySaveDraft(value: unknown): value is PersistedActivitySaveDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<PersistedActivitySaveDraft>;
  return draft.version === 2
    && typeof draft.id === "string"
    && typeof draft.babyId === "string"
    && typeof draft.type === "string"
    && (draft.activityId === undefined || typeof draft.activityId === "string")
    && typeof draft.uploadFolderKey === "string"
    && typeof draft.clientMutationId === "string"
    && typeof draft.submittedAt === "number"
    && (draft.phase === "activity" || draft.phase === "upload" || draft.phase === "sync")
    && (draft.status === "pending" || draft.status === "uploading" || draft.status === "failed")
    && isPersistedDraftImageList(draft.images)
    && isActivityInput(draft.input);
}
