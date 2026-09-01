import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { uploadImagesToActiveStorage } from "@/modules/integrations/storage/storage.service";
import {
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_FILES_PER_REQUEST,
  STORAGE_ROOT_FOLDER,
} from "@/modules/integrations/storage/storage.constants";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const MAX_BATCH_BYTES = MAX_UPLOAD_FILES_PER_REQUEST * MAX_IMAGE_BYTES;
const STORAGE_SCOPES = new Set(["activities"]);
const UPLOAD_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

function safeFolderKey(value: string) {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80);
  if (!sanitized) throw new Error("VALIDATION_ERROR");
  return sanitized;
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
    if (
      !files.length ||
      files.length !== keys.length ||
      files.length > MAX_UPLOAD_FILES_PER_REQUEST ||
      new Set(keys).size !== keys.length
    ) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.size;
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error("UNSUPPORTED_IMAGE");
      if (file.size > MAX_IMAGE_BYTES || totalBytes > MAX_BATCH_BYTES) {
        throw new Error("IMAGE_PAYLOAD_TOO_LARGE");
      }
    }

    const folder = `${STORAGE_ROOT_FOLDER}/${scope}/${safeFolderKey(rawFolderKey)}`;
    const results = await uploadImagesToActiveStorage(
      actor.id,
      files.map((file, index) => ({ key: keys[index]!, file })),
      folder,
    );
    const uploads = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);
    const reconnectRequired = failures.some(
      (failure) => failure.error === "STORAGE_RECONNECT_REQUIRED",
    );

    return NextResponse.json(
      { uploads, failures },
      { status: reconnectRequired ? 401 : failures.length ? 502 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
