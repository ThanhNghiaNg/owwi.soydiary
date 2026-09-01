import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { requestOrigin } from "@/lib/utils/request-origin";
import { exchangeGoogleDriveCode } from "@/modules/integrations/google-drive/google-drive.service";
import {
  activateStorageConnection,
  storageConnectionId,
} from "@/modules/integrations/storage/storage.service";

const OAUTH_COOKIE = "soydiary_google_drive_oauth";

type StoredState = { state?: string; userId?: string; codeVerifier?: string; redirectUri?: string };
type PopupStatus = "connected" | "error";

function popupResponse(origin: string, status: PopupStatus, message?: string) {
  const payload = JSON.stringify({
    type: "soydiary:google-drive-oauth",
    status,
    message,
  }).replace(/</g, "\\u003c");
  const copy =
    status === "connected"
      ? "Google Drive connected. You can close this window."
      : "Google Drive connection failed. Please return to Soy Diary and try again.";
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center">
<p>${copy}</p>
<script>
try { if (window.opener) window.opener.postMessage(${payload}, ${JSON.stringify(origin)}); } catch {}
window.setTimeout(() => window.close(), 250);
</script></body></html>`;
  const response = new NextResponse(html, {
    status: status === "error" ? 400 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integrations/google-drive",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const expectedRedirectUri = new URL(
    "/api/integrations/google-drive/callback",
    origin,
  ).toString();
  try {
    const actor = await requireActor();
    const oauthError = request.nextUrl.searchParams.get("error");
    if (oauthError) return popupResponse(origin, "error", oauthError);

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const rawCookie = request.cookies.get(OAUTH_COOKIE)?.value;
    if (!code || !state || !rawCookie) return popupResponse(origin, "error", "invalid_state");

    let stored: StoredState = {};
    try {
      stored = JSON.parse(Buffer.from(rawCookie, "base64url").toString("utf8")) as StoredState;
    } catch {
      return popupResponse(origin, "error", "invalid_state");
    }
    if (
      stored.state !== state ||
      stored.userId !== actor.id ||
      !stored.codeVerifier ||
      stored.redirectUri !== expectedRedirectUri
    ) {
      return popupResponse(origin, "error", "invalid_state");
    }

    const connection = await exchangeGoogleDriveCode(
      actor.id,
      code,
      stored.codeVerifier,
      stored.redirectUri,
    );
    await activateStorageConnection(
      actor.id,
      storageConnectionId("google-drive", connection.connectionId),
    );
    return popupResponse(origin, "connected");
  } catch (error) {
    console.error("Google Drive OAuth callback failed", error);
    return popupResponse(origin, "error", error instanceof Error ? error.message : "connection_failed");
  }
}
