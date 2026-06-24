import { encode } from "@auth/core/jwt";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyWidgetToken } from "@/lib/widget-auth";
import { upsertWidgetUser } from "@/server/repositories/user";

function isValidNextPath(value: string | null): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/embed/")) return false;
  // Resolve the path to block traversal (e.g. /embed/../admin → /admin).
  const resolved = new URL(value, "https://x").pathname;
  return resolved.startsWith("/embed/");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const next = url.searchParams.get("next");

  if (!isValidNextPath(next)) {
    return new NextResponse(null, { status: 400 });
  }

  const redirectUrl = new URL(next, url.origin);

  // If the caller already has a valid session, skip auto-login.
  const existingSession = await auth();
  if (existingSession) {
    return NextResponse.redirect(redirectUrl);
  }

  // No JWT secret configured: load embed as guest.
  if (!env.WIDGET_JWT_SECRET || !token) {
    return NextResponse.redirect(redirectUrl);
  }

  const claims = await verifyWidgetToken(token, env.WIDGET_JWT_SECRET);
  if (!claims) {
    // Invalid or expired token: silent degradation to guest mode.
    logger.warn({ tokenHeader: token.split(".")[0] }, "embed-auth: invalid widget token");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const user = await upsertWidgetUser(claims.email, claims.name);

    // Widget auto-login always grants MEMBER role regardless of the existing DB role.
    // This prevents a host operator from using a known admin email to escalate privileges.
    const sessionToken = await encode({
      token: {
        sub: user.id,
        id: user.id,
        role: "MEMBER",
        email: user.email,
        name: user.name ?? null,
      },
      secret: env.AUTH_SECRET,
      maxAge: SESSION_MAX_AGE_SECONDS,
      salt: AUTH_COOKIE_NAME,
    });

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  } catch (err) {
    logger.error({ err, email: claims.email }, "embed-auth: user upsert failed");
    return NextResponse.redirect(redirectUrl);
  }
}
