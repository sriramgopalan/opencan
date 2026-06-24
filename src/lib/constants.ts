export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Must match NextAuth's defaultCookies() salt — consistent across middleware, auth-edge, and route handlers.
export const AUTH_COOKIE_NAME =
  process.env["NODE_ENV"] === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
