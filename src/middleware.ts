export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionFromJWT } from "@/auth-edge";
import { isBlocklisted } from "@/lib/session-blocklist";

const COOKIE_NAME =
  process.env["NODE_ENV"] === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  const isPublicPath =
    nextUrl.pathname === "/" ||
    nextUrl.pathname.startsWith("/auth/") ||
    nextUrl.pathname.startsWith("/boards") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/api/trpc") ||
    nextUrl.pathname === "/robots.txt" ||
    nextUrl.pathname === "/sitemap.xml" ||
    nextUrl.pathname === "/opencan-logo.png";

  if (isPublicPath) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
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
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
