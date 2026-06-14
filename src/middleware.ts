import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

export const config = {
  runtime: "nodejs",
  matcher: [
    "/(protected)(.*)",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/auth).*)",
  ],
};

const PUBLIC_PATHS = new Set([
  "/",
  "/auth/signin",
  "/auth/register",
  "/auth/magic-link",
  "/auth/verify-email",
  "/auth/error",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/boards")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/trpc")) return true;
  return false;
}

function extractSessionToken(req: NextRequest): string | null {
  const cookieName =
    env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
  return req.cookies.get(cookieName)?.value ?? null;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = extractSessionToken(req);
  if (!sessionToken) {
    const signinUrl = new URL("/auth/signin", req.url);
    signinUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signinUrl);
  }

  // Dynamic import keeps ioredis out of the Edge bundle path
  const { getCachedSession, getSessionFromDb, cacheSession } = await import(
    "@/server/repositories/session"
  );

  // 1. Try Redis cache
  try {
    const cached = await getCachedSession(sessionToken);
    if (cached && cached.expires > new Date()) {
      return NextResponse.next();
    }
  } catch {
    // Redis unavailable — fail closed, fall through to DB
  }

  // 2. Fall back to DB
  const session = await getSessionFromDb(sessionToken);
  if (!session || session.expires < new Date()) {
    const signinUrl = new URL("/auth/signin", req.url);
    signinUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signinUrl);
  }

  // Warm the cache
  try {
    await cacheSession(sessionToken, session.userId, session.expires);
  } catch {
    // Non-fatal cache miss is acceptable
  }

  return NextResponse.next();
}
