import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { uploadMediaToActiveStorage } from "@/modules/integrations/storage/storage.service";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BATCH_BYTES,
  MAX_UPLOAD_FILES_PER_REQUEST,
  MAX_VIDEO_BYTES,
  STORAGE_ROOT_FOLDER,
} from "@/modules/integrations/storage/storage.constants";
import { fileHasExpectedMediaSignature } from "@/modules/integrations/storage/media-signature";
import type { StorageMediaKind } from "@/modules/integrations/storage/domain/types";

const acceptedImages = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);
const acceptedVideos = new Set<string>(ACCEPTED_VIDEO_MIME_TYPES);
const STORAGE_SCOPES = new Set(["activities"]);
const UPLOAD_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

function safeFolderKey(value: string) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80);
  if (!sanitized) throw new Error("VALIDATION_ERROR");
  return sanitized;
}

function kindForMimeType(mimeType: string): StorageMediaKind | undefined {
  if (acceptedImages.has(mimeType)) return "image";
  if (acceptedVideos.has(mimeType)) return "video";
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor();
    const formData = await request.formData();
    const rawKeys = formData.get("keys");
    const rawFolderKey = formData.get("folderKey");
    const rawScope = formData.get("scope");
    if (typeof rawKeys !== "string" || typeof rawFolderKey !== "string") {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const scope = rawScope === null ? "activities" : rawScope;
    if (typeof scope !== "string" || !STORAGE_SCOPES.has(scope)) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    let keys: string[];
    try {
      const parsed = JSON.parse(rawKeys);
      keys = Array.isArray(parsed) && parsed.every(
        (value) => typeof value === "string" && UPLOAD_KEY_PATTERN.test(value),
      ) ? parsed : [];
    } catch {
      keys = [];
    }
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length !== keys.length || files.length > MAX_UPLOAD_FILES_PER_REQUEST || new Set(keys).size !== keys.length) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    let totalBytes = 0;
    const kinds: StorageMediaKind[] = [];
    for (const file of files) {
      const kind = kindForMimeType(file.type);
      if (!kind || !(await fileHasExpectedMediaSignature(file))) throw new Error("UNSUPPORTED_MEDIA");
      totalBytes += file.size;
      const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (!file.size || file.size > maxBytes || totalBytes > MAX_UPLOAD_BATCH_BYTES) {
        throw new Error("MEDIA_PAYLOAD_TOO_LARGE");
      }
      kinds.push(kind);
    }

    const folder = `${STORAGE_ROOT_FOLDER}/${scope}/${safeFolderKey(rawFolderKey)}`;
    const results = await uploadMediaToActiveStorage(
      actor.id,
      files.map((file, index) => ({ key: keys[index]!, file, kind: kinds[index]! })),
      folder,
    );
    const uploads = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);
    const reconnectRequired = failures.some((failure) => failure.error === "STORAGE_RECONNECT_REQUIRED");

    return NextResponse.json(
      { uploads, failures },
      { status: reconnectRequired ? 401 : failures.length ? 502 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
