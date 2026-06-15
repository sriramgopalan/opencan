import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionFromJWT } from "@/auth-edge";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;

  const isPublicPath =
    nextUrl.pathname === "/" ||
    nextUrl.pathname.startsWith("/auth/") ||
    nextUrl.pathname.startsWith("/boards") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/api/trpc") ||
    nextUrl.pathname === "/robots.txt" ||
    nextUrl.pathname === "/sitemap.xml";

  if (isPublicPath) return NextResponse.next();

  const token = req.cookies.get("authjs.session-token")?.value;
  if (!token) {
    const signInUrl = new URL("/auth/signin", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // TODO: Add JTI blocklist check here before allowing access
  // See /specs/role-invalidation.md for full implementation spec
  // Implement when admin user management feature is built (Phase 1 Week 7)
  const session = await getSessionFromJWT(token);
  if (!session) {
    const signInUrl = new URL("/auth/signin", nextUrl);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
