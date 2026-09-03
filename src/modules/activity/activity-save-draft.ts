import { activityInputSchema, type ActivityInput, type ActivityType } from "./activity.dto";

export type ActivitySaveImage = ActivityInput["images"][number] & { file?: File };
export type DraftActivityImage = ActivitySaveImage;

export type ActivitySaveFailure = {
  code: string;
  message: string;
  storageIssue?: "connection-required" | "reconnect-required";
};

export type ActivitySaveDraft = {
  version: 1;
  id: string;
  babyId: string;
  type: ActivityType;
  activityId?: string;
  returnHref: string;
  retryHref: string;
  input: ActivityInput;
  images: ActivitySaveImage[];
  uploadFolderKey: string;
  clientMutationId: string;
  submittedAt: number;
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

export type PersistedActivitySaveImage = PersistedDraftImage;

export type PersistedActivitySaveDraft = Omit<ActivitySaveDraft, "images"> & {
  status: "queued" | "failed";
  images: PersistedActivitySaveImage[];
  failure?: ActivitySaveFailure;
};

function pendingImageUrl(storageKey: string) {
  return `https://pending.invalid/${encodeURIComponent(storageKey)}`;
}

/** Drops volatile blob URLs while retaining Files for IndexedDB structured cloning. */
export function persistDraftImages(images: readonly DraftActivityImage[]): PersistedDraftImage[] {
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
  const hydratedImages = images.map((image): DraftActivityImage => {
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

export function revokeHydratedDraftImageUrls(
  urls: readonly string[],
  revokeObjectUrl: (url: string) => void = (url) => URL.revokeObjectURL(url),
) {
  new Set(urls).forEach(revokeObjectUrl);
}

export function describeActivitySaveFailure(error: unknown): ActivitySaveFailure {
  const code = error instanceof Error ? error.message : "";
  if (code === "STORAGE_CONNECTION_REQUIRED") {
    return {
      code,
      storageIssue: "connection-required",
      message: "Bạn chưa có nơi lưu ảnh. Hãy kết nối Cloudinary hoặc Google Drive, rồi thử lưu lại.",
    };
  }
  if (code === "STORAGE_RECONNECT_REQUIRED") {
    return {
      code,
      storageIssue: "reconnect-required",
      message: "Nơi lưu ảnh hiện tại cần được kết nối lại. Hãy mở nơi lưu ảnh, kết nối lại rồi thử lưu.",
    };
  }
  if (code === "STORAGE_NOT_CONFIGURED") {
    return {
      code,
      storageIssue: "connection-required",
      message: "Chưa có dịch vụ lưu ảnh khả dụng trên máy chủ. Hãy kiểm tra nơi lưu ảnh rồi thử lại.",
    };
  }
  if (code === "IMAGE_PAYLOAD_TOO_LARGE") {
    return { code, message: "Tổng dung lượng ảnh quá lớn. Hãy bớt ảnh hoặc chọn ảnh nhẹ hơn rồi thử lại." };
  }
  if (code.includes("STORAGE") || code.includes("UPLOAD")) {
    return { code: code || "STORAGE_UPLOAD_FAILED", message: "Chưa thể tải ảnh lên storage. Các ảnh chưa thành công vẫn được giữ để bạn thử lại." };
  }
  return { code: code || "ACTIVITY_SAVE_FAILED", message: "Chưa thể lưu hoạt động. Bạn kiểm tra mạng rồi thử lại nhé." };
}

/** Creates an API-safe payload while keeping local File objects outside JSON. */
export function withActivitySaveImages(input: ActivityInput, images: readonly ActivitySaveImage[]): ActivityInput {
  const storedImages = images.map((image) => {
    const { file: _file, ...storedImage } = image;
    return image.file ? { ...storedImage, url: pendingImageUrl(image.storageKey) } : storedImage;
  });
  return { ...input, images: storedImages } as ActivityInput;
}

/** Blob URLs are page-scoped; persist only Files and durable provider URLs. */
export function persistActivitySaveDraft(
  draft: ActivitySaveDraft,
  status: PersistedActivitySaveDraft["status"],
  failure?: ActivitySaveFailure,
): PersistedActivitySaveDraft {
  return {
    ...draft,
    input: withActivitySaveImages(draft.input, draft.images),
    status,
    images: persistDraftImages(draft.images),
    ...(failure ? { failure } : {}),
  };
}

/** Recreates a worker-safe draft. Pending image URLs are never used for upload. */
export function workerDraftFromPersisted(draft: PersistedActivitySaveDraft): ActivitySaveDraft {
  return {
    ...draft,
    images: draft.images.map((image): ActivitySaveImage => image.kind === "pending"
      ? { storageKey: image.storageKey, file: image.file, url: pendingImageUrl(image.storageKey) }
      : { url: image.url, storageKey: image.storageKey, ...(image.provider ? { provider: image.provider } : {}), ...(image.connectionId ? { connectionId: image.connectionId } : {}) }),
  };
}

/** Creates fresh, component-owned preview URLs after returning to a failed draft. */
export function hydrateActivitySaveImages(
  images: readonly PersistedActivitySaveImage[],
  createObjectUrl: (file: File) => string = (file) => URL.createObjectURL(file),
): ActivitySaveImage[] {
  return hydrateDraftImages(images, createObjectUrl).images;
}

export function isPersistedActivitySaveDraft(value: unknown): value is PersistedActivitySaveDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<PersistedActivitySaveDraft>;
  if (
    draft.version !== 1
    || typeof draft.id !== "string"
    || typeof draft.babyId !== "string"
    || typeof draft.type !== "string"
    || typeof draft.returnHref !== "string"
    || typeof draft.retryHref !== "string"
    || typeof draft.uploadFolderKey !== "string"
    || typeof draft.clientMutationId !== "string"
    || typeof draft.submittedAt !== "number"
    || (draft.status !== "queued" && draft.status !== "failed")
    || !isPersistedDraftImageList(draft.images)
  ) return false;
  return activityInputSchema.safeParse(draft.input).success;
}
