import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/current-user";
import { apiError } from "@/lib/utils/http";
import { createCloudinaryAuthorizationAttempt } from "@/modules/integrations/cloudinary/cloudinary.service";
import { requestOrigin } from "@/lib/utils/request-origin";

const OAUTH_COOKIE = "soydiary_cloudinary_oauth";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor();
    const state = randomBytes(24).toString("base64url");
    const origin = requestOrigin(request);
    const redirectUri = new URL("/api/integrations/cloudinary/callback", origin).toString();
    const attempt = await createCloudinaryAuthorizationAttempt(actor.id, state, redirectUri);
    const cookieValue = Buffer.from(
      JSON.stringify({
        state,
        userId: actor.id,
        clientId: attempt.clientId,
        codeVerifier: attempt.codeVerifier,
        redirectUri,
      }),
      "utf8",
    ).toString("base64url");

    const response = NextResponse.redirect(attempt.authorizationUrl);
    response.cookies.set(OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/integrations/cloudinary",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
