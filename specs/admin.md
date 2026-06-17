# Spec: Admin Dashboard

**Application:** Etash — Customer Feedback  
**Version:** 0.1  
**Status:** DRAFT

---

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| A-01 | Admin area replaces `/dashboard` | `/admin` is the new home for all admin-only features. `/dashboard` is removed entirely. `admin` is already a reserved board slug (boards.md decision 08) so no slug conflict exists. |
| A-02 | Session blocklist scope | Blocklist by `userId` (not JTI), key `session:blocklist:user:{userId}`, TTL = 30 days (the JWT `maxAge` from auth.md decision 8). This invalidates all active sessions for a user simultaneously. Per-JTI revocation requires enumerating a user's active JWTs — impossible in v1 because JWTs are cookie-only and never stored server-side. Supersedes the per-JTI approach in `specs/role-invalidation.md`. |
| A-03 | Blocklist check placement | Middleware only, after JWT decryption via `getSessionFromJWT`. If `isBlocklisted(payload.sub)` returns true: delete the session cookie and redirect to `/auth/signin`. No additional check inside procedure bodies. |
| A-04 | Suspension field | Add `suspendedAt DateTime?` to the `User` model. Null = active; non-null = suspended at that timestamp. All auth paths check this field before issuing a session. |
| A-05 | Admin stats: live vs cached | Live DB queries in v1 — no Redis or in-memory caching. Revisit if `admin.getStats` regularly exceeds 500 ms. |
| A-06 | Pending posts pagination | No pagination in v1. All PENDING posts are returned in one response. Add pagination in v2 if the queue regularly exceeds 200 items. |
| A-07 | Admin-initiated user deletion | Delegates to the same anonymisation logic as `auth.deleteAccount` (privacy.md). The admin confirms by typing the target user's email address (not `"delete my account"`). Triggers blocklist invalidation before the transaction. |
| A-08 | Board management procedures | Reuses existing `boards.*` tRPC procedures unchanged. New UI routes only: `/admin/boards`, `/admin/boards/new`, `/admin/boards/[slug]/settings`. |
| A-09 | `adminProcedure` type | A custom tRPC procedure that extends `protectedProcedure` with an additional `role === 'ADMIN'` assertion. All `admin.*` procedures use it. |
| A-10 | Admin cannot self-modify via admin panel | An admin cannot suspend, delete, or change the role of their own account via `admin.*` procedures — use the user-facing settings pages for that. |
| A-11 | Pending posts sort order | Oldest first (`createdAt ASC`) — first submitted, first reviewed. |

| A-12 | Suspension blocks all auth methods | Suspension prevents sign-in via credentials, Google OAuth, GitHub OAuth, and magic link. The `signIn` NextAuth callback and the `CredentialsProvider.authorize` callback both check `suspendedAt`. No auth path is exempt. |
| A-13 | Moderation queue actions | The moderation queue exposes **Approve** and **Reject** only. No Delete action. Post deletion is available from the individual post detail page. |
| A-14 | Admin self-role change | Confirmed: an admin cannot change their own role via `admin.updateUserRole`. The UI disables the role toggle for the currently signed-in admin. The procedure rejects self-targeting with `FORBIDDEN`. |
| A-15 | Blocklist on role promotion | Both promotion (`MEMBER → ADMIN`) and demotion (`ADMIN → MEMBER`) trigger blocklist invalidation. On promotion, the user needs a fresh JWT with the elevated role to access admin features. On demotion, immediate removal of admin access is required. |
| A-16 | `totalVotes` implementation | Sum of `Post.voteCount` across all posts (`prisma.post.aggregate({ _sum: { voteCount: true } })`). Avoids a full `Vote` table scan. The `voteCount` field is already denormalised and kept in sync on every vote toggle (posts.md §9). |

---

## 0. Glossary

| Term | Definition |
|------|-----------|
| **Admin** | A user with `role = 'ADMIN'`; has full access to `/admin/*` routes and `admin.*` tRPC procedures |
| **Suspended user** | A user with `suspendedAt` set to a non-null timestamp; cannot sign in or receive a new session via any auth method |
| **Blocklist** | A Redis key per `userId` (`session:blocklist:user:{userId}`) that causes all active sessions for that user to be rejected at the middleware layer on the next request |
| **PENDING post** | A post awaiting admin approval (`status = 'PENDING'`); only created when a board has `postModerationEnabled = true` |

---

## 1. Admin Overview — GET /admin

### User Story
> As an admin, I want a dashboard that shows key workspace metrics at a glance so that I can understand activity and health without querying the database directly.

### Route
`/admin` — accessible only to users with `role === 'ADMIN'`. Non-admin authenticated users are redirected to `/`. Unauthenticated users are redirected to `/auth/signin`.

### Acceptance Criteria

1. The page is accessible only to authenticated users with `role === 'ADMIN'`.
2. The page displays the following stats, fetched live on each page load:
   - Total boards (public + private)
   - Total posts (all statuses, including PENDING)
   - Total votes (sum of `Post.voteCount` across all posts)
   - Total comments (count of all `Comment` rows)
   - Total registered users
   - New posts created in the last 30 days
   - New users registered in the last 30 days
3. Stats are never cached in v1. Each page load issues fresh parallel queries.
4. If any count query fails, the page renders with an error indicator for that stat and continues showing the rest (graceful partial degradation).

### API Contract

**Procedure:** `admin.getStats`  
**Type:** `query`  
**Access:** `adminProcedure`

**Input:** none

**Output:**
```ts
{
  totalBoards:        number,
  totalPosts:         number,
  totalVotes:         number,
  totalComments:      number,
  totalUsers:         number,
  newPostsLast30Days: number,
  newUsersLast30Days: number,
}
```

### Implementation Notes

- All counts are fetched in parallel: `await Promise.all([prisma.board.count(), prisma.post.count(), …])`.
- `totalVotes` uses `prisma.post.aggregate({ _sum: { voteCount: true } })` — avoids a full `Vote` table scan (decision A-16). `_sum.voteCount ?? 0` handles the null case when no posts exist.
- "Last 30 days" window: `createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`.
- Repository function: `src/server/repositories/admin.ts → getWorkspaceStats()`.

---

## 2. User Management — /admin/users

### User Story
> As an admin, I want to view, search, and manage all registered users so that I can control access, enforce platform rules, and respond to abuse.

### Route
`/admin/users`

### Acceptance Criteria

1. Displays a paginated list of all users, 20 per page, ordered by `createdAt DESC` (newest first).
2. Supports search by email or display name (case-insensitive substring match; applied via `prisma.user.findMany` `contains` filter).
3. Each user row displays: `name`, `email`, `role`, `createdAt`, `suspendedAt` (if set), and action buttons.
4. **Toggle role:** Admin may switch a user between `MEMBER` and `ADMIN`. Triggers blocklist invalidation immediately after the DB update (decision A-02).
5. **Suspend:** Admin may suspend an active user. Sets `suspendedAt = now()`. Triggers blocklist invalidation. The suspended user cannot sign in via any auth method.
6. **Unsuspend:** Admin may unsuspend a suspended user. Clears `suspendedAt = null`. No blocklist change needed (the existing blocklist key will expire naturally; user may sign in again immediately).
7. **Delete:** Admin may delete a user account. The deletion anonymises PII per privacy.md (same transaction as `auth.deleteAccount`). Admin supplies the target user's email as confirmation. Triggers blocklist invalidation before the transaction.
8. An admin cannot suspend, delete, or change the role of their own account via these procedures (decision A-10).
9. Attempting to suspend or delete another admin is rejected with `FORBIDDEN`.
10. Pagination uses offset/page-number (same pattern as `boards.list`). Searching resets to page 1.

### Schema Change

```prisma
model User {
  // … all existing fields from auth.md …
  suspendedAt DateTime?  // PII: set by admin on suspension; null = active account
}
```

### Suspension Enforcement

All auth paths must check `suspendedAt` before issuing a session. If `suspendedAt` is non-null, reject with: *"Your account has been suspended. Please contact support."*

| Auth path | Where to check |
|-----------|---------------|
| Email + password | `CredentialsProvider.authorize` callback, after password verification |
| Google OAuth | `signIn` callback in `src/auth.ts`, after account lookup |
| GitHub OAuth | `signIn` callback in `src/auth.ts`, after account lookup |
| Magic link confirmation | POST handler before session creation |

Active JWTs for suspended users are caught by the middleware blocklist check (§6) without requiring the user to make a new sign-in attempt.

### tRPC API

All procedures are `adminProcedure`. All live in `src/server/routers/admin.ts`.

---

#### `admin.listUsers`

**Type:** `query`

**Input:**
```ts
z.object({
  page:   z.number().int().min(1).default(1),
  limit:  z.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
}).strict()
```

**Output:**
```ts
{
  users: Array<{
    id:          string,
    name:        string | null,
    email:       string,
    role:        string,
    createdAt:   string,   // ISO-8601
    suspendedAt: string | null,
  }>,
  total:      number,
  page:       number,
  totalPages: number,
}
```

**Security:** `email` is returned only because the caller is a confirmed admin. `passwordHash` is never selected.

---

#### `admin.updateUserRole`

**Type:** `mutation`

**Input:**
```ts
z.object({
  userId: z.string().cuid(),
  role:   z.enum(['MEMBER', 'ADMIN']),
}).strict()
```

**Output:**
```ts
{ id: string, role: string }
```

**Side effects:** Calls `addToBlocklist(userId, TTL_30_DAYS)` after a successful DB update for **both promotion and demotion** (decision A-15). If the role is unchanged (no-op), no DB write and no blocklist call are made.

**Error states:**

| Condition | Code | Message |
|-----------|------|---------|
| User not found | `NOT_FOUND` | "User not found." |
| Caller is target | `FORBIDDEN` | "You cannot change your own role." |
| No-op (same role supplied) | — | Return current state; no DB write; no blocklist call |

**Logging:** `{ adminId, targetUserId, oldRole, newRole }`

---

#### `admin.suspendUser`

**Type:** `mutation`

**Input:**
```ts
z.object({ userId: z.string().cuid() }).strict()
```

**Output:**
```ts
{ id: string, suspendedAt: string }   // ISO-8601
```

**Side effects:** Calls `addToBlocklist(userId, TTL_30_DAYS)` after DB update.

**Error states:**

| Condition | Code | Message |
|-----------|------|---------|
| User not found | `NOT_FOUND` | "User not found." |
| Target is an admin | `FORBIDDEN` | "Cannot suspend an admin account." |
| Caller is target | `FORBIDDEN` | "You cannot suspend your own account." |
| Already suspended | — | No-op; return current state |

**Logging:** `{ adminId, targetUserId }`

---

#### `admin.unsuspendUser`

**Type:** `mutation`

**Input:**
```ts
z.object({ userId: z.string().cuid() }).strict()
```

**Output:**
```ts
{ id: string, suspendedAt: null }
```

**Error states:**

| Condition | Code | Message |
|-----------|------|---------|
| User not found | `NOT_FOUND` | "User not found." |
| Not suspended | — | No-op; return current state |

**Logging:** `{ adminId, targetUserId }`

---

#### `admin.deleteUser`

**Type:** `mutation`

**Input:**
```ts
z.object({
  userId:       z.string().cuid(),
  confirmEmail: z.string().email(),   // must exactly match the target user's current email
}).strict()
```

**Output:**
```ts
{ id: string }
```

**Side effects (in order):**
1. `addToBlocklist(userId, TTL_30_DAYS)` — before the transaction so the user is blocked even if the transaction is slow.
2. Inside a single `$transaction`:
   - Tombstone all comments by this user: `comment.updateMany({ where: { authorId: userId }, data: { authorId: null, body: '[deleted]' } })`.
   - Anonymise user email: `user.update({ data: { email: 'deleted-{cuid}@deleted.etash.com', name: null, image: null, passwordHash: null } })`.
   - Delete `Session` rows, `Account` rows, `Vote` rows.
   - Hard-delete the `User` row.

**Error states:**

| Condition | Code | Message |
|-----------|------|---------|
| User not found | `NOT_FOUND` | "User not found." |
| `confirmEmail` mismatch | `BAD_REQUEST` | "Email does not match. Please type the user's email exactly." |
| Target is an admin | `FORBIDDEN` | "Cannot delete an admin account via the admin panel." |
| Caller is target | `FORBIDDEN` | "Use your account settings to delete your own account." |

**Logging:** `{ adminId, targetUserId }` — never log the email being confirmed.

---

## 3. Board Management — /admin/boards

### User Story
> As an admin, I want a central place to create, configure, reorder, and delete boards so that I don't need to navigate away from the admin area.

### Routes

| Route | Purpose |
|-------|---------|
| `/admin/boards` | List all boards (public and private) |
| `/admin/boards/new` | Create a new board |
| `/admin/boards/[slug]/settings` | Edit an existing board's name, visibility, settings |

### Acceptance Criteria

1. `/admin/boards` is the single authoritative location for board management, replacing any equivalent `/dashboard` views.
2. The board list shows all boards regardless of `isPublic` or `isListed`, including: `name`, `slug`, `isPublic`, `isListed`, `postCount`, `createdAt`, `position`.
3. Board creation, update, settings update, reorder, and delete all reuse the existing `boards.*` tRPC procedures — no new board procedures are added.
4. Board deletion requires the admin to type the board's `slug` in a confirmation dialog (matching `boards.delete` input `confirmSlug`).
5. The navigation sidebar (§5) is present on all `/admin/*` pages.

### tRPC Procedures Used (no changes)

- `boards.list` (admin view — all boards)
- `boards.create`
- `boards.update`
- `boards.updateSettings`
- `boards.reorder`
- `boards.delete`
- `boards.getBySlug`

---

## 4. Post Moderation — /admin/posts

### User Story
> As an admin, I want to see all posts awaiting approval across every board so that I can quickly approve or reject them from a single queue.

### Route
`/admin/posts`

### Acceptance Criteria

1. Displays all posts with `status = 'PENDING'` across all boards, ordered by `createdAt ASC` (oldest submission first — decision A-11).
2. Each row shows: board name (linkable to `/boards/[slug]`), post title, author name or `guestName`, `createdAt`, **Approve** button, **Reject** button.
3. **Approve** calls `posts.setStatus({ id, status: 'OPEN' })`. The post becomes publicly visible immediately.
4. **Reject** calls `posts.setStatus({ id, status: 'CLOSED' })`. The post is no longer pending; it is not publicly visible.
5. No pagination in v1 — all PENDING posts are returned at once (decision A-06).
6. Empty state: "No posts pending approval." when the queue is empty.
7. After a successful approve or reject, the row is removed from the list (optimistic update or re-fetch).

### API Contract

#### `admin.listPendingPosts`

**Procedure:** `admin.listPendingPosts`  
**Type:** `query`  
**Access:** `adminProcedure`

**Input:** none

**Output:**
```ts
{
  posts: Array<{
    id:        string,
    title:     string,
    boardId:   string,
    boardName: string,
    boardSlug: string,
    authorId:  string | null,
    author:    { id: string, name: string | null } | null,
    guestName: string | null,
    createdAt: string,   // ISO-8601
  }>,
}
```

**Implementation notes:**
```ts
prisma.post.findMany({
  where:   { status: 'PENDING' },
  orderBy: { createdAt: 'asc' },
  select: {
    id: true, title: true, authorId: true, guestName: true, createdAt: true,
    board:  { select: { id: true, name: true, slug: true } },
    author: { select: { id: true, name: true } },
  },
})
```

#### `posts.setStatus` (existing — used for approve / reject)

- Approve: `posts.setStatus({ id, status: 'OPEN' })`
- Reject: `posts.setStatus({ id, status: 'CLOSED' })`

No changes to `posts.setStatus` are required.

---

## 5. Navigation Sidebar

### User Story
> As an admin, I want consistent navigation across all admin pages so that I can move between sections without losing context.

### Acceptance Criteria

1. A left-hand sidebar is rendered on every `/admin/*` page, containing the following items in order:
   - **Overview** → `/admin`
   - **Users** → `/admin/users`
   - **Boards** → `/admin/boards`
   - **Post moderation** → `/admin/posts`; displays a badge with the count of pending posts when non-zero.
2. The currently active section is visually highlighted (matched by pathname prefix).
3. The sidebar is implemented as a single shared layout component at `src/app/(protected)/admin/layout.tsx` — not duplicated per page.
4. The layout performs a server-side `role === 'ADMIN'` check on every render and redirects non-admins to `/` (defense-in-depth; middleware is the primary enforcement).
5. The pending post badge count is fetched alongside the sidebar render using `admin.listPendingPosts` (or a lightweight `prisma.post.count({ where: { status: 'PENDING' } })` if that is more efficient).
6. The `<nav>` element carries `aria-label="Admin navigation"`; each link has a descriptive visible label.

### Implementation

```
src/app/(protected)/admin/
  layout.tsx              ← sidebar + role guard
  page.tsx                ← /admin (overview)
  users/
    page.tsx              ← /admin/users
  boards/
    page.tsx              ← /admin/boards
    new/
      page.tsx            ← /admin/boards/new
    [slug]/
      settings/
        page.tsx          ← /admin/boards/[slug]/settings
  posts/
    page.tsx              ← /admin/posts
```

---

## 6. Session Blocklist (userId-based)

### Overview

When an admin changes a user's role, suspends them, or deletes their account, all active JWT sessions for that user must be invalidated immediately. Because the server cannot enumerate or read another user's JWT cookies, the blocklist is keyed by `userId` rather than by individual JTI (decision A-02).

### Redis Key Design

```
Key:   session:blocklist:user:{userId}
Value: "1"
TTL:   2592000 seconds (30 days = JWT maxAge)
```

Presence of the key means: reject all requests carrying a JWT whose `sub` (= `userId`) matches this key.

### Middleware Integration

`src/middleware.ts` — after the existing `getSessionFromJWT` call:

```ts
const payload = await getSessionFromJWT(token);
if (!payload) {
  // existing redirect to /auth/signin
}
if (payload.sub && await isBlocklisted(payload.sub)) {
  const response = NextResponse.redirect(new URL('/auth/signin', req.url));
  response.cookies.delete(COOKIE_NAME);   // COOKIE_NAME branches on NODE_ENV (auth.md §Session)
  return response;
}
// existing protected-route logic continues
```

**Performance:** `isBlocklisted` is a Redis `EXISTS` call — O(1), typically < 1 ms. It is only called when a valid JWT is present; unauthenticated requests skip it entirely.

### `src/lib/session-blocklist.ts`

```ts
import { redis } from '@/lib/redis';

const KEY_PREFIX = 'session:blocklist:user:';
export const TTL_30_DAYS = 60 * 60 * 24 * 30; // seconds

export async function addToBlocklist(
  userId: string,
  ttlSeconds: number = TTL_30_DAYS,
): Promise<void> {
  await redis.set(`${KEY_PREFIX}${userId}`, '1', 'EX', ttlSeconds);
}

export async function isBlocklisted(userId: string): Promise<boolean> {
  return (await redis.exists(`${KEY_PREFIX}${userId}`)) === 1;
}
```

### Files Changed

| File | Change |
|------|--------|
| `src/lib/session-blocklist.ts` | **New** — `addToBlocklist`, `isBlocklisted` |
| `src/middleware.ts` | Add `isBlocklisted(payload.sub)` check after JWT decryption |
| `src/server/routers/admin.ts` | **New** — all `admin.*` procedures; calls `addToBlocklist` in `updateUserRole`, `suspendUser`, `deleteUser` |
| `src/server/repositories/admin.ts` | **New** — `getWorkspaceStats`, `listUsers`, `listPendingPosts`, user mutation helpers |
| `prisma/schema.prisma` | Add `suspendedAt DateTime?` to `User` model |
| `src/auth.ts` | Add `suspendedAt` check in `signIn` callback |

### Difference from `specs/role-invalidation.md`

The original spec proposed per-JTI blocklist keys (`session:blocklist:{jti}`) with a `getUserActiveSessions(userId)` helper to enumerate active sessions before blocklisting them. This design is not feasible in v1 because JWT sessions are cookie-only — there is no server-side store of active JTIs.

This spec supersedes that approach with a per-userId key. Trade-off: all sessions for the user (across all devices) are invalidated simultaneously, rather than surgically. This is the correct behaviour for role changes and suspensions.

---

## 7. Data Model Changes

### `User` model (addendum to auth.md)

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique        // PII
  emailVerified    DateTime?
  name             String?                  // PII
  image            String?                  // PII
  passwordHash     String?
  role             String    @default("MEMBER")
  failedLoginCount Int       @default(0)
  lockedUntil      DateTime?
  suspendedAt      DateTime?               // PII: set by admin on suspension; null = active
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  accounts    Account[]
  sessions    Session[]
  // … other relations
}
```

No other model changes are required for the admin dashboard.

---

## 8. Route Map

| URL | Auth |
|-----|------|
| `/admin` | ADMIN only |
| `/admin/users` | ADMIN only |
| `/admin/boards` | ADMIN only |
| `/admin/boards/new` | ADMIN only |
| `/admin/boards/[slug]/settings` | ADMIN only |
| `/admin/posts` | ADMIN only |

All routes live under `src/app/(protected)/admin/`. The `layout.tsx` at this level enforces `role === 'ADMIN'` server-side and renders the sidebar.

---

## 9. Security Requirements

1. All `admin.*` tRPC procedures use `adminProcedure`, which extends `protectedProcedure` with `if (ctx.session.user.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'Admin only')`.
2. The `/admin` layout performs a server-side role check on every render — middleware is the primary enforcement; the layout check is defense-in-depth.
3. `email` is returned by `admin.listUsers` because the caller is a confirmed admin. It must never be returned by any `publicProcedure` or `protectedProcedure`.
4. `passwordHash` is never selected in any admin query.
5. `suspendedAt` is always set server-side (`new Date()`). Callers cannot supply a custom timestamp.
6. Blocklist keys (`session:blocklist:user:{userId}`) are never returned to clients. The `userId` is not PII in isolation, but the key namespace must not be exposed via any API response.
7. Zod `.strict()` on all input schemas — unknown fields are rejected, not silently dropped.

---

## 10. Out of Scope — v1

| Feature | Notes |
|---------|-------|
| Per-board admin roles | Global admin only (boards.md decision 01) |
| Audit log | Track who changed what — deferred to v2 |
| Admin notifications on new PENDING posts | Email / in-app alert — deferred to v2 |
| Bulk actions (multi-select) | Deferred |
| Admin-initiated password reset | User uses the forgot-password flow |
| Granular per-device session revocation | Per-JTI revocation deferred (see §6) |
| Post deletion from the moderation queue | Available on the individual post detail page only; not surfaced in the queue (decision A-13) |
| Analytics charts / time-series | Counts only in v1; chart visualisations deferred |
