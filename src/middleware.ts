export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionFromJWT } from "@/auth-edge";
import { AUTH_COOKIE_NAME } from "@/lib/constants";
import { isBlocklisted } from "@/lib/session-blocklist";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  // Embed routes: set frame-ancestors CSP, strip X-Frame-Options, allow without auth.
  const isEmbedPath =
    nextUrl.pathname.startsWith("/embed/") ||
    nextUrl.pathname === "/api/embed-auth";
  if (isEmbedPath) {
    const allowedOrigins = process.env["WIDGET_ALLOWED_ORIGINS"] ?? "'none'";
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", `frame-ancestors ${allowedOrigins}`);
    response.headers.delete("X-Frame-Options");
    return response;
  }

  const isPublicPath =
    nextUrl.pathname === "/" ||
    nextUrl.pathname.startsWith("/auth/") ||
    nextUrl.pathname.startsWith("/boards") ||
    nextUrl.pathname === "/roadmap" ||
    nextUrl.pathname === "/changelog" ||
    nextUrl.pathname.startsWith("/changelog/") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/api/trpc") ||
    nextUrl.pathname === "/robots.txt" ||
    nextUrl.pathname === "/sitemap.xml" ||
    nextUrl.pathname === "/opencan-logo.png" ||
    nextUrl.pathname === "/widget.js";

  if (isPublicPath) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const signInUrl = new URL("/auth/signin", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  const session = await getSessionFromJWT(token);
  if (!session) {
    const signInUrl = new URL("/auth/signin", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (await isBlocklisted(session.id)) {
    const response = NextResponse.redirect(new URL("/auth/signin", nextUrl));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
