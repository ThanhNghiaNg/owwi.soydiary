import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { createGoogleDriveAuthorizationUrl } from "@/modules/integrations/google-drive/google-drive.service";

const OAUTH_COOKIE = "soyplay_google_drive_oauth";

export async function GET() {
  try {
    const actor = await requireActor();
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const authorizationUrl = createGoogleDriveAuthorizationUrl(state, codeChallenge);
    const cookieValue = Buffer.from(
      JSON.stringify({ state, userId: actor.id, codeVerifier }),
      "utf8",
    ).toString("base64url");

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/google-drive",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
