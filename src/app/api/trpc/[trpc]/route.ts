import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { auth } from "@/auth";
import { appRouter } from "@/server/routers/_app";
import type { Context } from "@/server/trpc";

// DEPLOYMENT REQUIREMENT: reverse proxy must overwrite x-forwarded-for with the
// real client IP. Without this, guest vote deduplication can be bypassed by
// spoofing the XFF header. See docs/deployment-requirements.md
function getIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "127.0.0.1"
  );
}

async function handler(req: Request): Promise<Response> {
  const session = await auth();
  const ip = getIp(req);

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (): Context => ({ session, ip }),
  });
}

export { handler as GET, handler as POST };
