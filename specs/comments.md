# Comments — Feature Spec

**Status:** ACCEPTED

## 1. Overview

Comments allow users (authenticated or guest, subject to board settings) to reply to Posts with short text messages. They are flat (no threading), scoped to Posts, always ordered oldest-first, and subject to the same `whoCanPost` gate as the parent Post's board. The author of a comment may edit or delete their own comment (authenticated authors only — guests cannot edit/delete); admins may edit or delete any comment. Comments are always immediately visible (no moderation queue in v1).

---

## 2. Codebase questions — resolved

| Question | Finding |
|---|---|
| **Body char limits** | Mirror post `description`: `max 2000 / min 1`. Guest name mirrors post `guestName`: `min 2 / max 50`. |
| **Pagination** | Cursor-based (base64 `createdAt\|id`), default 20, max 50 — exact mirror of posts. `encodeCursor`/`decodeCursor` must be extracted to `src/lib/pagination.ts` (DRY §4 prerequisite) rather than duplicated. |
| **Ordering** | Fixed oldest-first (`createdAt asc, id asc`) — intentional deviation from posts' "votes" default; comments are a conversation. No `orderBy` parameter. |
| **Author fields (public)** | Public post list/detail returns no author fields. Comments deviate intentionally: public returns `author: { id, name }` — attribution is expected in conversation. Admin returns `author: { id, name, email }` + `authorId`, mirroring `ADMIN_SELECT` in `post.ts`. |
| **Parent existence check** | Post router calls `requireBoardVisible` explicitly before writing — does not rely on FK constraints. Comments mirror this: `getPostById` + `requireBoardVisible` are called explicitly in `comments.create` before any write. |
| **Board visibility gate** | `getPostById` returns `null` for posts on private boards for non-admin callers, acting as the first gate. `requireBoardVisible` is then called to retrieve `BoardSettings` for the `whoCanPost` check — both calls are required. |
| **AppError codes** | No new codes needed. Existing `NOT_FOUND / FORBIDDEN / UNAUTHORIZED / VALIDATION_ERROR / CONFLICT / RATE_LIMITED / INTERNAL_ERROR` suffice, consistent with the post router. |

---

## 3. Resolved design decisions

| # | Decision |
|---|---|
| **3.1 Guest comments** | Option A — reuse `whoCanPost`. If `whoCanPost === "ANYONE"`, unauthenticated callers may comment and must supply `guestName` (same rules as guest posts). `whoCanPost === "AUTHENTICATED"` requires auth. `whoCanPost === "ADMINS_ONLY"` restricts to admins. |
| **3.2 whoCanPost gates comments** | Yes — `whoCanPost` gates comment creation. The same board setting controls all participation (posting and commenting). |
| **3.3 Body wipe on user deletion** | Overwrite `body` with tombstone `"[deleted]"` and null `authorId` in the user deletion transaction. Comment row is retained for conversation context; content is wiped. |
| **3.4 commentCount** | Add denormalised `commentCount Int @default(0)` to `Post`. `createComment` increments it; `deleteComment` decrements it. Both operations use a transaction. Mirrors `voteCount`. |
| **3.5 Comment moderation** | Comments are always immediately visible. `postModerationEnabled` applies to posts only. No `PENDING` state for comments in v1. |

---

## 4. Data model

### New model — `Comment`

```prisma
model Comment {
  id        String   @id @default(cuid())
  postId    String
  authorId  String?  // PII: references User.id; nulled (SetNull) when author account is deleted
  guestName String?  // PII: display name supplied by unauthenticated commenters
  body      String   @db.Text // PII: free-text; overwritten with "[deleted]" on author account deletion
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  post   Post  @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User? @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([postId, createdAt])
  @@index([authorId])
}
```

### Changes to existing models

**`Post`** — add one field and the inverse relation:
```prisma
commentCount Int     @default(0)
comments     Comment[]
```

**`User`** — add the inverse relation:
```prisma
comments Comment[]
```

### Cascade and deletion behaviour

| Event | Effect on `Comment` |
|---|---|
| Parent `Post` deleted | All its `Comment` rows are hard-deleted (Cascade). |
| Author `User` deleted | `authorId` set to null (SetNull FK); `body` overwritten with `"[deleted]"` via tombstone transaction step (§3.3). `guestName` is not a user record and requires no deletion action. |

### User deletion transaction (addendum)

The existing user deletion transaction must gain this step:

```ts
prisma.comment.updateMany({
  where: { authorId: userId },
  data: { authorId: null, body: "[deleted]" },
}),
```

This must run inside the same `$transaction` as the other deletion steps so the wipe is atomic with the `User` delete.

---

## 5. Repository layer

**File**: `src/server/repositories/comment.ts`
**Test file**: `src/server/repositories/comment.test.ts`

### DRY preamble (dry.md)

- **Extracting (prerequisite)**: `encodeCursor` / `decodeCursor` from `server/repositories/post.ts` → `src/lib/pagination.ts`. Both `post.ts` and `comment.ts` import from there. This refactor ships in the same PR.
- **Extracting (prerequisite)**: `requireBoardVisible` helper from `server/routers/post.ts` → `src/server/routers/_helpers.ts`. Both `postRouter` and `commentRouter` import from there.
- **Reusing**: `stripHtml` from `lib/sanitize.ts` (called at the router layer before passing to the repository, consistent with posts).
- **New**: all functions below — no existing equivalent.

### Select shapes

```ts
// Public: name visible, email withheld
const PUBLIC_COMMENT_SELECT = {
  id:        true,
  postId:    true,
  guestName: true,
  body:      true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

// Admin: full author identity, mirrors ADMIN_SELECT in post.ts
const ADMIN_COMMENT_SELECT = {
  id:        true,
  postId:    true,
  guestName: true,
  body:      true,
  createdAt: true,
  updatedAt: true,
  authorId:  true,
  author: { select: { id: true, name: true, email: true } },
} as const;
```

### Input contracts

```ts
interface CreateCommentInput {
  postId:    string;
  authorId:  string | null;
  guestName: string | null;
  body:      string;
}

interface UpdateCommentInput {
  body: string;
}

interface ListCommentsOptions {
  postId:   string;
  cursor?:  string;
  limit?:   number;   // default 20, max 50
  isAdmin?: boolean;
}

interface CommentViewer {
  isAdmin:   boolean;
  callerId?: string;
}
```

### Function signatures

```ts
// ── Queries ──────────────────────────────────────────────────────────────────

export async function getCommentById(
  id: string,
  viewer: CommentViewer,
): Promise<PublicCommentView | AdminCommentView | null>
// Returns AdminCommentView when viewer.isAdmin; PublicCommentView otherwise.
// Returns null when the row does not exist.

export async function listComments(
  opts: ListCommentsOptions,
): Promise<CommentListResult>
// Always orders [{ createdAt: "asc" }, { id: "asc" }].
// Cursor encoding delegates to the shared encodeCursor / decodeCursor from lib/pagination.ts.
// Throws VALIDATION_ERROR on malformed cursor.
// isAdmin controls which select shape is used (public vs. admin).

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createComment(
  input: CreateCommentInput,
): Promise<CreatedComment>
// Wraps in a $transaction that also increments Post.commentCount by 1.

export async function updateComment(
  id: string,
  data: UpdateCommentInput,
  viewer: { isAdmin: boolean; callerId: string },
): Promise<AdminCommentView>
// Throws NOT_FOUND when comment absent.
// Throws FORBIDDEN when callerId ≠ authorId AND isAdmin is false.
// No status lock — comments may always be edited (per §3.5: no moderation; per spec decisions: SHIPPED/CLOSED posts still accept edits).
// Returns AdminCommentView so the router can strip fields for non-admin callers.

export async function deleteComment(
  id: string,
  viewer: { isAdmin: boolean; callerId: string },
): Promise<{ id: string }>
// Throws NOT_FOUND when comment absent.
// Throws FORBIDDEN when callerId ≠ authorId AND isAdmin is false.
// Wraps in a $transaction that also decrements Post.commentCount by 1 (floor 0 via Math.max).
```

---

## 6. Router layer

**File**: `src/server/routers/comment.ts`
**Test file**: `src/server/routers/comment.test.ts`

Register in `src/server/routers/_app.ts`:

```ts
import { commentRouter } from "@/server/routers/comment";

export const appRouter = createTRPCRouter({
  auth:     authRouter,
  boards:   boardRouter,
  posts:    postRouter,
  comments: commentRouter,   // ← add
});
```

---

### `comments.list`

| | |
|---|---|
| **Procedure** | `publicProcedure` |
| **Auth level** | Public |
| **Rate limit** | None (read-only; board visibility gate provides natural throttle) |

**Input schema**
```ts
z.object({
  postId: z.string().cuid(),
  cursor: z.string().optional(),
  limit:  z.number().int().min(1).max(50).default(20),
}).strict()
```

**Logic**
1. `viewer = getViewer(ctx)` (reuse existing helper from post router, or extract to `_helpers.ts`).
2. `getPostById(postId, viewer)` — if null → `NOT_FOUND` ("Post not found.").
3. `listComments({ postId, cursor, limit, isAdmin: viewer.isAdmin })`.
4. Return `CommentListResult`.

**Output**: `CommentListResult`

---

### `comments.create`

| | |
|---|---|
| **Procedure** | `publicProcedure` |
| **Auth level** | Public — access controlled at runtime by `whoCanPost` board setting |
| **Rate limit** | `comments:create:{hashedIp}` — 20 per 3600 s |

**Input schema**
```ts
z.object({
  postId:    z.string().cuid(),
  body:      z.string().trim()
               .min(1,    "Comment cannot be empty.")
               .max(2000, "Comment must be 2 000 characters or fewer."),
  guestName: z.string().trim()
               .min(2,  "Guest name must be at least 2 characters.")
               .max(50, "Guest name must be 50 characters or fewer.")
               .optional(),
}).strict()
```

**Logic**
1. Apply rate limit on `comments:create:{hashedIp}`.
2. `viewer = getViewer(ctx)`.
3. `getPostById(postId, viewer)` — if null → `NOT_FOUND` ("Post not found."). Captures `boardId`.
4. `requireBoardVisible(post.boardId, viewer.isAdmin, "comments.create")` — returns `{ settings }`.
5. Apply `whoCanPost` gate (identical pattern to `posts.create`):
   - `ADMINS_ONLY` and not admin → `NOT_FOUND` ("This board doesn't exist." — masks existence, same as posts).
   - `AUTHENTICATED` and no `callerId` → `UNAUTHORIZED` ("You must be signed in to comment.").
   - No `callerId` and no `guestName` → `BAD_REQUEST` ("A guest name is required.").
6. `createComment({ postId, authorId: viewer.callerId ?? null, guestName: input.guestName ? stripHtml(input.guestName) : null, body: stripHtml(input.body) })`.
7. Return `CreatedComment`.

**Notes**
- Guests cannot edit or delete their own comments (no persistent identity). Admins can always edit/delete.
- `body` and `guestName` are sanitised with `stripHtml` before persistence.

---

### `comments.update`

| | |
|---|---|
| **Procedure** | `protectedProcedure` |
| **Auth level** | Authenticated; owner or admin |
| **Rate limit** | `comments:update:{hashedIp}` — 30 per 3600 s |

**Input schema**
```ts
z.object({
  id:   z.string().cuid(),
  body: z.string().trim()
          .min(1,    "Comment cannot be empty.")
          .max(2000, "Comment must be 2 000 characters or fewer."),
}).strict()
```

**Ownership rule**: `callerId === comment.authorId`, or `role === "ADMIN"`. Enforced inside `updateComment` in the repository layer — the router does not duplicate the check.

**Logic**
1. Apply rate limit.
2. `viewer = getViewer(ctx)`.
3. `updateComment(id, { body: stripHtml(input.body) }, { isAdmin: viewer.isAdmin, callerId: ctx.session.user.id })`.
4. `AppError.NOT_FOUND` → tRPC `NOT_FOUND`.
5. `AppError.FORBIDDEN` → tRPC `NOT_FOUND` (masks existence to non-owners, consistent with `posts.update`).
6. Non-admin callers receive `PublicCommentView` (strip `authorId` and `author.email`); admins receive `AdminCommentView`.

---

### `comments.delete`

| | |
|---|---|
| **Procedure** | `protectedProcedure` |
| **Auth level** | Authenticated; owner or admin |
| **Rate limit** | `comments:delete:{hashedIp}` — 20 per 3600 s |

**Input schema**
```ts
z.object({
  id: z.string().cuid(),
}).strict()
```

**Ownership rule**: same as `comments.update`.

**Logic**
1. Apply rate limit.
2. `viewer = getViewer(ctx)`.
3. `deleteComment(id, { isAdmin: viewer.isAdmin, callerId: ctx.session.user.id })`.
4. `AppError.NOT_FOUND` → tRPC `NOT_FOUND`.
5. `AppError.FORBIDDEN` → tRPC `NOT_FOUND`.
6. Return `{ id }`.

---

## 7. Shared types

**File**: `src/types/comment.ts`

```ts
export interface PublicCommentView {
  id:        string;
  postId:    string;
  guestName: string | null;
  body:      string;
  createdAt: Date;
  updatedAt: Date;
  author:    { id: string; name: string | null } | null;
}

export interface AdminCommentView extends Omit<PublicCommentView, "author"> {
  authorId: string | null;
  author:   { id: string; name: string | null; email: string } | null;
}

export interface CreatedComment {
  id:        string;
  postId:    string;
  authorId:  string | null;
  guestName: string | null;
  body:      string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentListResult {
  items:      PublicCommentView[];   // router widens to AdminCommentView[] for admin callers
  nextCursor: string | null;
}
```

---

## 8. Error codes

No new `AppErrorCode` values required. Mapping:

| Scenario | `AppErrorCode` | tRPC code | Notes |
|---|---|---|---|
| Comment id not found | `NOT_FOUND` | `NOT_FOUND` | |
| Post id not found / not visible | `NOT_FOUND` | `NOT_FOUND` | |
| Caller not owner or admin on update/delete | `FORBIDDEN` | `NOT_FOUND` | Masks existence to non-owners (mirrors `posts.update`) |
| `protectedProcedure` rejects unauthenticated | — | `UNAUTHORIZED` | Thrown by tRPC middleware before procedure body |
| `whoCanPost === "AUTHENTICATED"` + no session | `UNAUTHORIZED` | `UNAUTHORIZED` | |
| `whoCanPost === "ADMINS_ONLY"` + non-admin | `NOT_FOUND` | `NOT_FOUND` | Masks board existence, same as `posts.create` |
| No `callerId` and no `guestName` supplied | `VALIDATION_ERROR` | `BAD_REQUEST` | |
| Body / guestName fails Zod | `VALIDATION_ERROR` | `BAD_REQUEST` | |
| Rate limit exceeded | `RATE_LIMITED` | `TOO_MANY_REQUESTS` | Via `applyRateLimit` |
| Malformed pagination cursor | `VALIDATION_ERROR` | `BAD_REQUEST` | |
| DB error | `INTERNAL_ERROR` | `INTERNAL_SERVER_ERROR` | |

---

## 9. Test matrix

### Repository unit tests — `src/server/repositories/comment.test.ts`

All tests use `prismaMock` (mocked Prisma client). No real database.

| Function | Cases |
|---|---|
| `getCommentById` | returns `PublicCommentView` for non-admin viewer; returns `AdminCommentView` for admin viewer (includes `authorId`, `author.email`); returns `null` when row absent |
| `listComments` | returns items in `createdAt asc` order; respects `limit`; returns `nextCursor` when more rows exist; returns `nextCursor: null` on last page; cursor skip applied correctly on second page call; throws `VALIDATION_ERROR` on malformed cursor; returns empty list when post has no comments; `isAdmin: true` uses admin select shape |
| `createComment` | persists and returns `CreatedComment` with correct fields; calls `post.update` with `{ commentCount: { increment: 1 } }` inside the same transaction; sets `authorId` from input; sets `guestName` when `authorId` is null; `guestName` is null when `authorId` is set |
| `updateComment` | returns updated `AdminCommentView` on success; throws `NOT_FOUND` when id absent; throws `FORBIDDEN` when `callerId !== authorId` and `isAdmin` is false; succeeds when `isAdmin` is true regardless of `authorId`; no-op update does not touch `updatedAt` when body is unchanged (if optimisation is added — otherwise assert update is called) |
| `deleteComment` | returns `{ id }` on success; calls `post.update` with `{ commentCount: { decrement: 1 } }` inside the same transaction; throws `NOT_FOUND` when id absent; throws `FORBIDDEN` when `callerId !== authorId` and `isAdmin` is false; succeeds when `isAdmin` is true |

### Router integration tests — `src/server/routers/comment.test.ts`

All tests use a real Postgres test database. Each test resets state in `beforeEach`.

| Procedure | Caller | Cases |
|---|---|---|
| `comments.list` | unauthenticated | returns paginated `PublicCommentView` items for a public post; `author.email` is absent from each item; returns `NOT_FOUND` when `postId` does not exist; returns `NOT_FOUND` when post is on a private board |
| `comments.list` | admin | returns `AdminCommentView` items — `authorId` and `author.email` present |
| `comments.list` | unauthenticated | cursor pagination: second page starts after first page's last item; malformed cursor → `BAD_REQUEST` |
| `comments.list` | unauthenticated | `commentCount` on the parent Post is incremented after a comment is created (cross-check, not a list test per se — can be a separate `createComment` integration test) |
| `comments.create` | unauthenticated, board `ANYONE` | persists comment; `body` is HTML-stripped before storage; `authorId` is null; `guestName` is set |
| `comments.create` | unauthenticated, board `ANYONE` | returns `BAD_REQUEST` when `guestName` absent |
| `comments.create` | authenticated, board `ANYONE` | persists comment with `authorId` set; `guestName` ignored |
| `comments.create` | unauthenticated, board `AUTHENTICATED` | returns `UNAUTHORIZED` |
| `comments.create` | authenticated non-admin, board `ADMINS_ONLY` | returns `NOT_FOUND` |
| `comments.create` | admin, board `ADMINS_ONLY` | persists comment |
| `comments.create` | authenticated | returns `NOT_FOUND` when `postId` does not exist |
| `comments.create` | authenticated | returns `NOT_FOUND` when post is on a private board and caller is not admin |
| `comments.create` | authenticated | returns `BAD_REQUEST` when `body` is empty string |
| `comments.create` | authenticated | returns `BAD_REQUEST` when `body` exceeds 2000 chars |
| `comments.create` | authenticated | returns `TOO_MANY_REQUESTS` when rate limit exceeded |
| `comments.update` | unauthenticated | returns `UNAUTHORIZED` |
| `comments.update` | authenticated author | updates `body`; response does not include `author.email` |
| `comments.update` | authenticated non-author | returns `NOT_FOUND` (existence masked) |
| `comments.update` | admin non-author | succeeds; response includes `author.email` |
| `comments.update` | authenticated | returns `BAD_REQUEST` when `body` is empty |
| `comments.update` | authenticated | returns `NOT_FOUND` when id absent |
| `comments.delete` | unauthenticated | returns `UNAUTHORIZED` |
| `comments.delete` | authenticated author | deletes; returns `{ id }`; `Post.commentCount` decremented by 1 |
| `comments.delete` | authenticated non-author | returns `NOT_FOUND` |
| `comments.delete` | admin non-author | deletes; returns `{ id }` |
| `comments.delete` | authenticated | returns `NOT_FOUND` when id absent |

---

## 10. Prerequisites / migration notes

The following must ship in the same PR as the Comments implementation:

1. **Schema migration** — `prisma migrate dev` for: new `Comment` model; `Post.commentCount Int @default(0)`; `Post.comments Comment[]`; `User.comments Comment[]`.

2. **`src/lib/pagination.ts`** — extract `encodeCursor` / `decodeCursor` from `post.ts`. Update `post.ts` to import from the new location. This is a refactor with no behaviour change; covered by the existing post repository tests.

3. **`src/server/routers/_helpers.ts`** — extract `requireBoardVisible` and `getViewer` from `post.ts`. Update `post.ts` to import from the new location. Covered by the existing post router tests.

4. **User deletion transaction** — add the `comment.updateMany` tombstone step to wherever user deletion is implemented. The implementation PR must include a test asserting that comment bodies are overwritten and `authorId` is nulled after user deletion.
