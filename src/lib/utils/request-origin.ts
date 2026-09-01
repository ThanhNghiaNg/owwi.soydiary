import type { NextRequest } from "next/server";

/** Resolve the public origin seen by the browser, including reverse proxies. */
export function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  if (forwardedHost && (forwardedProto === "https" || forwardedProto === "http")) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}
