import { NextResponse } from "next/server";
import { ZodError } from "zod";

const knownErrors: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  LEVEL_LOCKED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  CLOUDINARY_CONNECTION_INVALID: 400,
  CLOUDINARY_RECONNECT_REQUIRED: 401,
  CLOUDINARY_NOT_CONFIGURED: 503,
  CLOUDINARY_UPLOAD_FAILED: 502,
  GOOGLE_DRIVE_CONNECTION_INVALID: 400,
  GOOGLE_DRIVE_RECONNECT_REQUIRED: 401,
  GOOGLE_DRIVE_NOT_CONFIGURED: 503,
  GOOGLE_DRIVE_UPLOAD_FAILED: 502,
  STORAGE_RECONNECT_REQUIRED: 401,
  STORAGE_NOT_CONFIGURED: 503,
  STORAGE_UPLOAD_FAILED: 502,
  STORAGE_USAGE_FAILED: 502,
  IMAGE_PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 400,
};

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: error.issues }, { status: 400 });
  }

  if (error instanceof Error) {
    const status = knownErrors[error.message];
    if (status) return NextResponse.json({ error: error.message }, { status });

    // Mongoose validation/cast failures are client input errors, but do not expose
    // internal paths or connection details to the caller.
    if (error.name === "ValidationError" || error.name === "CastError") {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
  }

  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
