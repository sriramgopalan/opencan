import type { NextConfig } from "next";

// nodeMiddleware is a Next.js 15.2+ feature not yet in the type definitions
const nextConfig = {
  output: "standalone",
  experimental: {
    nodeMiddleware: true,
  },
} satisfies NextConfig & { experimental: { nodeMiddleware?: boolean } };

export default nextConfig;
