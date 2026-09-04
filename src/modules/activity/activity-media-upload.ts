import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_UPLOAD_BATCH_BYTES,
  MAX_UPLOAD_FILES_PER_REQUEST,
} from "../integrations/storage/storage.constants.ts";
import type { ActivityMedia } from "./activity.dto.ts";
import type { ActivitySaveMedia } from "./activity-save-draft.ts";

export class ActivityMediaUploadError extends Error {
  readonly media: ActivitySaveMedia[];

  constructor(message: string, media: ActivitySaveMedia[]) {
    super(message);
    this.name = "ActivityMediaUploadError";
    this.media = media;
  }
}

const acceptedImages = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);
const acceptedVideos = new Set<string>(ACCEPTED_VIDEO_MIME_TYPES);

export function mediaKindForMimeType(mimeType: string): "image" | "video" | undefined {
  if (acceptedImages.has(mimeType)) return "image";
  if (acceptedVideos.has(mimeType)) return "video";
  return undefined;
}

function pendingChunks(media: Array<ActivitySaveMedia & { file: File }>) {
  const chunks: Array<Array<ActivitySaveMedia & { file: File }>> = [];
  let current: Array<ActivitySaveMedia & { file: File }> = [];
  let bytes = 0;
  for (const item of media) {
    if (current.length && (current.length >= MAX_UPLOAD_FILES_PER_REQUEST || bytes + item.file.size > MAX_UPLOAD_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.file.size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function uploadPendingActivityMedia(media: ActivitySaveMedia[], folderKey: string) {
  const pending = media.filter((item): item is ActivitySaveMedia & { file: File } => Boolean(item.file));
  if (!pending.length) return media.map(({ file: _file, ...item }) => item);

  let working = [...media];
  for (const chunk of pendingChunks(pending)) {
    const body = new FormData();
    body.append("keys", JSON.stringify(chunk.map((item) => item.storageKey)));
    body.append("folderKey", folderKey);
    body.append("scope", "activities");
    chunk.forEach((item) => body.append("files", item.file, item.file.name));
    let response: Response;
    try {
      response = await fetch("/api/integrations/storage/upload", { method: "POST", body });
    } catch {
      throw new ActivityMediaUploadError("STORAGE_UPLOAD_FAILED", working);
    }
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      uploads?: Array<{
        key: string;
        secureUrl: string;
        publicId: string;
        kind: ActivityMedia["kind"];
        mimeType: string;
        provider?: ActivityMedia["provider"];
        connectionId?: string;
        posterUrl?: string;
        durationMs?: number;
        width?: number;
        height?: number;
      }>;
      failures?: Array<{ key: string; error: string }>;
    };
    const uploaded = new Map((payload.uploads ?? []).map((item) => [item.key, item]));
    working = working.map((item) => {
      const result = uploaded.get(item.storageKey);
      if (!result || result.kind !== item.kind) return item;
      const { file: _file, ...localMetadata } = item;
      return {
        ...localMetadata,
        kind: result.kind,
        mimeType: result.mimeType,
        url: result.secureUrl,
        storageKey: result.publicId,
        ...(result.provider ? { provider: result.provider } : {}),
        ...(result.connectionId ? { connectionId: result.connectionId } : {}),
        ...(result.posterUrl ? { posterUrl: result.posterUrl } : {}),
        ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
        ...(result.width === undefined ? {} : { width: result.width }),
        ...(result.height === undefined ? {} : { height: result.height }),
      };
    });
    if (!response.ok || payload.failures?.length || uploaded.size !== chunk.length) {
      const code = payload.failures?.[0]?.error ?? payload.error ?? "STORAGE_UPLOAD_FAILED";
      throw new ActivityMediaUploadError(code, working);
    }
  }
  return working.map(({ file: _file, ...item }) => item);
}
