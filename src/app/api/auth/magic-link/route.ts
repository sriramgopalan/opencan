import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSuspendedAt } from "@/server/repositories/user";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  if (!token || !email) {
    return NextResponse.redirect(new URL("/auth/error?error=InvalidToken", req.url));
  }

  const suspendedAt = await getSuspendedAt(email);
  if (suspendedAt) {
    return NextResponse.redirect(new URL("/auth/error?error=AccessDenied", req.url));
  }

  // Suspension check passed — forward to NextAuth email callback for token validation + sign-in
  const params = new URLSearchParams({ token, email, callbackUrl });
  return NextResponse.redirect(new URL(`/api/auth/callback/email?${params.toString()}`, req.url));
}
