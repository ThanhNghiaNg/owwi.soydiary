import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { isGoogleDriveFileId } from "@/lib/utils/google-drive-image-url";
import { downloadGoogleDriveImage } from "@/modules/integrations/google-drive/google-drive.service";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CONNECTION_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string; fileId: string }> },
) {
  try {
    const actor = await requireActor();
    const { connectionId, fileId } = await params;
    if (!CONNECTION_ID_PATTERN.test(connectionId) || !isGoogleDriveFileId(fileId)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const upstream = await downloadGoogleDriveImage(actor.id, connectionId, fileId);
    const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: "UNSUPPORTED_IMAGE" }, { status: 415 });
    }
    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "IMAGE_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const image = await upstream.arrayBuffer();
    if (image.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "IMAGE_PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    return new Response(image, {
      headers: {
        "content-type": contentType,
        "content-length": String(image.byteLength),
        "cache-control": "private, max-age=3600",
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
