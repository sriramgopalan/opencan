# OpenCan — Architecture & System Design

## Runtime stack

```
Browser → Next.js (App Router) → tRPC → Repositories → PostgreSQL
                                       ↓
                                    Redis (rate limiting, session blocklist)
                                    Resend (transactional email)
                                    Webhooks (outbound HTTP)
```

**Next.js App Router** is the entire application — no separate backend service. React Server Components handle data fetching for read paths; Client Components handle interactivity. Deployed as a single Docker container.

---

## Data layer

> ADR-001 (tRPC only), ADR-003 (Prisma in repositories only)

**tRPC** is the only way client code talks to the server. There are no REST endpoints for application data — everything goes through typed tRPC procedures. This gives end-to-end type safety from the database query to the React component with no manual API contracts to maintain.

**Prisma** is the ORM and is strictly confined to `src/server/repositories/`. No component or router touches Prisma directly. Repositories are plain async functions that accept typed inputs and return typed outputs — they are the only place SQL (or `$queryRaw`) runs.

**PostgreSQL** is the primary store. The schema owns: Users, Boards, Posts (with `PostStatus` enum), Votes, Comments, ChangelogEntries, Webhooks, Sessions, Accounts, VerificationTokens.

---

## Auth

> ADR-004

Auth.js (NextAuth v5) handles sessions. The session is stored as a signed JWT in an HttpOnly cookie — no server-side session store. The middleware validates the JWT on every request at the edge before the request reaches any route.

tRPC procedures are structurally typed by auth level:

| Procedure type | Who can call it |
|---|---|
| `publicProcedure` | Anyone |
| `protectedProcedure` | Any signed-in user |
| `adminProcedure` | Users with `role = ADMIN` |

There is no ad-hoc role checking inside procedure bodies. If the wrong procedure type is used, CI fails (dependency-cruiser enforces this).

**Redis** handles two things auth-adjacent: rate limiting on mutations (via `ioredis`) and a session blocklist so revoked sessions — on suspension, role change, or deletion — are invalidated immediately without waiting for JWT expiry.

---

## Request flow (typical mutation)

```
1. User clicks "Upvote" in browser
2. tRPC client calls post.vote (protectedProcedure)
3. tRPC middleware confirms valid session
4. Rate limiter checks Redis
5. post.ts router calls repositories/post.ts
6. Repository runs prisma.vote.create + updates voteCount denorm
7. If webhooks configured: outbound HTTP POST (synchronous, best-effort)
8. If status change: Resend email to post author
9. Response returns to client; Next.js cache tag invalidated
```

---

## Feature flags

> ADR-005

New features ship behind a flag in `src/lib/flags.ts` (env-var controlled, default off). The flag guard lives at the page or procedure level. Once a feature is considered stable the flag and all guards are deleted in a follow-up PR — no long-lived flags accumulate.

---

## Frontend structure

```
src/app/
  (admin)/admin/     — admin-only routes (layout enforces ADMIN role)
  (protected)/       — auth-required routes
  (embed)/           — iframe widget (separate CSP, no auth required)
  boards/            — public feedback boards
  changelog/         — public changelog
  roadmap/           — public roadmap
  auth/              — sign-in / sign-up
  privacy/, terms/   — static legal pages
```

**Server Components** fetch data directly from repositories (no tRPC round-trip needed for reads on the server). **Client Components** — forms, interactive widgets, the recharts admin dashboard chart — are explicitly marked `"use client"` and receive data as props from their RSC parents. This keeps the bundle small and preserves the single data-path rule.

---

## Observability

> ADR-006

**Pino** is the only logger — `console.*` is banned by ESLint. All log output is structured JSON, making it queryable in any log aggregation tool.

**AppError** (ADR-002) is the only throwable in application code — `new Error()` is banned in `src/`. Every error has a typed code and a predictable shape at the tRPC error boundary, so clients always receive a structured error, never a raw stack trace.

---

## Deployment

Single `docker compose` stack:

| Service | Image | Role |
|---|---|---|
| `app` | Custom Next.js build | Application server (port 3000) |
| `postgres` | `postgres:16-alpine` | Primary database |
| `redis` | `redis:7-alpine` | Rate limiting + session blocklist |
| `minio` | `minio/minio` | Object storage (reserved for future use) |

The `app` container runs `prisma migrate deploy` at startup before `next start`. All configuration is via environment variables — no config files are baked into the image.

---

## CI gates

All 10 gates must pass before any PR can merge to main.

### 1. `tsc`
TypeScript compiler with `noEmit`. Catches type errors across the entire codebase before any code runs. Configured in `tsconfig.json` with strict mode.

### 2. ESLint (0 warnings)
Linting with zero tolerance — warnings are treated as errors. Enforces: import order, no `console.*`, no `new Error()` in `src/`, no unused variables, React rules, and accessibility lint rules. Config in `.eslintrc`.

### 3. Vitest ≥90% branch coverage
Unit and integration tests with a 90% branch coverage floor. Repository tests run against a mocked Prisma client (`vitest-mock-extended`). Router tests use a tRPC caller factory. Redis-dependent mutation tests require the `redis:7-alpine` CI service. Config in `vitest.config.ts`.

### 4. Playwright
End-to-end browser tests against the running Next.js app. Currently a smoke suite (unauthenticated access to protected routes redirects to sign-in). Config in `playwright.config.ts`.

### 5. Semgrep
Static security analysis. Catches SQL injection patterns (unsafe `$queryRaw` string concatenation), hardcoded secrets, SSRF vectors, and other OWASP Top 10 issues at the source level before code is deployed.

### 6. npm audit
Checks all dependencies against the npm vulnerability advisory database. Fails on any high or critical severity CVE. Run with `--audit-level=high`.

### 7. jscpd
Copy-paste detection at `--threshold 0` (zero tolerance) for blocks of 10+ lines. Prevents duplication across the codebase and keeps shared logic in shared modules.

### 8. dependency-cruiser
Enforces architectural rules as code:
- Prisma client only imported inside `src/server/repositories/`
- tRPC routers only import from repositories and lib
- Client components (`"use client"`) do not import server-only modules
- No circular dependencies

Violations fail the build. Rules defined in `.dependency-cruiser.cjs`.

### 9. Lighthouse CI
Runs against the public homepage (`/`) using a local production build. Enforces minimum scores for:
- **Performance** — including max potential FID
- **Accessibility** ≥95 — catches contrast failures, missing alt text, ARIA issues
- **Best practices** and **SEO**

Config in `lighthouserc.js`. No Lighthouse budget applies to authenticated admin routes (the recharts chart is code-split and only loads on `/admin`).

### 10. Gitleaks
Scans the full git history for accidentally committed secrets — API keys, tokens, passwords, connection strings. Fails the build if any pattern matches. Runs on every PR to catch secrets before they reach main.
