import { NextResponse } from "next/server";
import { isGoogleDriveFileId } from "@/lib/utils/google-drive-image-url";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=31536000, s-maxage=31536000, immutable";
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!isGoogleDriveFileId(fileId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const upstream = await fetch(
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`,
    {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*",
        range: `bytes=0-${MAX_IMAGE_BYTES - 1}`,
      },
      next: { revalidate: 3600 },
    },
  ).catch(() => undefined);
  if (!upstream?.ok) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) {
    return NextResponse.json({ error: "UNSUPPORTED_IMAGE" }, { status: 415 });
  }

  const contentRange = upstream.headers.get("content-range");
  const totalBytes = contentRange ? Number(contentRange.match(/\/(\d+)$/)?.[1]) : undefined;
  if (totalBytes && totalBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "IMAGE_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const image = await upstream.arrayBuffer();
  if (image.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "IMAGE_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  return new Response(image, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(image.byteLength),
      "cache-control": CACHE_CONTROL,
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
