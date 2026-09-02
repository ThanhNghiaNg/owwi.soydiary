import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { env } from "@/lib/env";
import type { GalleryFilter } from "./gallery.types";

type GalleryCursorPayload = {
  v: 1;
  occurredAt: string;
  id: string;
  filter: GalleryFilter;
};

export type GalleryCursorPosition = {
  occurredAt: string;
  id: ObjectId;
};

export class InvalidGalleryCursorError extends Error {
  constructor() {
    super("Invalid gallery cursor");
    this.name = "InvalidGalleryCursorError";
  }
}

function cursorKey() {
  if (!env.AUTH_SECRET) throw new Error("Gallery cursor signing is not configured");
  return createHmac("sha256", env.AUTH_SECRET).update("soydiary:gallery-cursor:v1").digest();
}

function sign(encodedPayload: string) {
  return createHmac("sha256", cursorKey()).update(encodedPayload).digest("base64url");
}

export function encodeGalleryCursor(position: GalleryCursorPosition, filter: GalleryFilter) {
  const payload: GalleryCursorPayload = {
    v: 1,
    occurredAt: position.occurredAt,
    id: position.id.toHexString(),
    filter,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function decodeGalleryCursor(rawCursor: string, filter: GalleryFilter): GalleryCursorPosition {
  try {
    if (rawCursor.length > 512) throw new InvalidGalleryCursorError();
    const parts = rawCursor.split(".");
    if (parts.length !== 2) throw new InvalidGalleryCursorError();
    const [encodedPayload, suppliedSignature] = parts;
    if (!encodedPayload || !suppliedSignature || !/^[A-Za-z0-9_-]+$/.test(encodedPayload)) {
      throw new InvalidGalleryCursorError();
    }

    const expectedSignature = sign(encodedPayload);
    const suppliedBuffer = Buffer.from(suppliedSignature, "base64url");
    const expectedBuffer = Buffer.from(expectedSignature, "base64url");
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      throw new InvalidGalleryCursorError();
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<GalleryCursorPayload>;
    if (
      payload.v !== 1
      || typeof payload.occurredAt !== "string"
      || typeof payload.id !== "string"
      || payload.filter !== filter
      || !ObjectId.isValid(payload.id)
    ) {
      throw new InvalidGalleryCursorError();
    }

    const occurredAt = new Date(payload.occurredAt);
    const isUtcIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(payload.occurredAt);
    if (!isUtcIsoTimestamp || Number.isNaN(occurredAt.getTime())) {
      throw new InvalidGalleryCursorError();
    }

    return { occurredAt: payload.occurredAt, id: new ObjectId(payload.id) };
  } catch (error) {
    if (error instanceof InvalidGalleryCursorError) throw error;
    throw new InvalidGalleryCursorError();
  }
}
