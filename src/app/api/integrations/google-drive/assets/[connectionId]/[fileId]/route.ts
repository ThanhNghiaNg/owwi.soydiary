import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { isGoogleDriveFileId } from "@/lib/utils/google-drive-image-url";
import { downloadGoogleDriveMedia } from "@/modules/integrations/google-drive/google-drive.service";
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/modules/integrations/storage/storage.constants";

const CONNECTION_ID_PATTERN = /^[a-f0-9]{24}$/i;
const acceptedImages = new Set<string>(ACCEPTED_IMAGE_MIME_TYPES);
const acceptedVideos = new Set<string>(ACCEPTED_VIDEO_MIME_TYPES);

function upstreamSize(headers: Headers) {
  const contentRange = headers.get("content-range");
  const totalFromRange = contentRange?.match(/\/(\d+)$/)?.[1];
  const raw = totalFromRange ?? headers.get("content-length");
  const size = Number(raw);
  return Number.isFinite(size) ? size : undefined;
}

function responseHeaders(upstream: Response, contentType: string) {
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "private, max-age=3600",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
    "accept-ranges": upstream.headers.get("accept-ranges") ?? "bytes",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; fileId: string }> },
) {
  try {
    const actor = await requireActor();
    const { connectionId, fileId } = await params;
    if (!CONNECTION_ID_PATTERN.test(connectionId) || !isGoogleDriveFileId(fileId)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const range = request.headers.get("range") ?? undefined;
    if (range && !/^bytes=\d*-\d*$/.test(range)) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const upstream = await downloadGoogleDriveMedia(actor.id, connectionId, fileId, range);
    if (upstream.status === 416) {
      const headers = new Headers();
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) headers.set("content-range", contentRange);
      return new Response(null, { status: 416, headers });
    }
    const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
    const isImage = acceptedImages.has(contentType);
    const isVideo = acceptedVideos.has(contentType);
    if (!isImage && !isVideo) return NextResponse.json({ error: "UNSUPPORTED_MEDIA" }, { status: 415 });

    const size = upstreamSize(upstream.headers);
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (size !== undefined && size > maxBytes) {
      return NextResponse.json({ error: "MEDIA_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }

    if (isVideo) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders(upstream, contentType),
      });
    }

    const image = await upstream.arrayBuffer();
    if (image.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "MEDIA_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const headers = responseHeaders(upstream, contentType);
    headers.set("content-length", String(image.byteLength));
    return new Response(image, { status: upstream.status, headers });
  } catch (error) {
    return apiError(error);
  }
}
