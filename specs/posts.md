# Spec: Posts

**Application:** Etash — Customer Feedback  
**Version:** 0.1  
**Status:** DRAFT — decisions below must be resolved before implementation begins

---

## Open Decisions

> **All items in this table block implementation.** Resolve each one and update the
> relevant sections of this spec before writing any code.

| # | Topic | Options | Impact |
|---|-------|---------|--------|
| P-01 | Post URL identifier | (a) CUID: `/boards/[slug]/posts/[cuid]` — opaque, stable; (b) Board-scoped integer counter: `/boards/[slug]/posts/42` — human-readable, matches GitHub/Linear conventions | URL structure, Post model, index |
| P-02 | Title character limit | 100 / 150 / 200 characters | Schema validation, UI |
| P-03 | Description character limit | 1 000 / 2 000 / 5 000 characters | Schema validation, UI |
| P-04 | Description format | Plain text / Markdown / Rich text (Tiptap) | Rendering, storage, XSS surface |
| P-05 | Guest post attribution | Guests who post when `whoCanPost = ANYONE`: (a) store nothing — post appears as "Anonymous"; (b) store email at submission time (PII concern); (c) require a display name (no account) | Post model, PII implications |
| P-06 | Duplicate detection | (a) None; (b) Client-side warning only (similarity search before submit); (c) Server-side soft-block (return similar posts, require user to confirm before creating) | Complexity, UX |
| P-07 | Duplicate detection method | If P-06 ≠ (a): (a) trigram similarity (pg_trgm); (b) full-text search (tsvector); (c) title exact-match only | DB extension requirements |
| P-08 | Similarity threshold | If P-06 ≠ (a): what score triggers a warning? | UX, false-positive rate |
| P-09 | Votes: up-only vs up/down | (a) Upvote only (simpler, less toxic); (b) Up + down votes | Vote model, UI |
| P-10 | Vote retraction | Can a user un-vote after voting? (a) Yes — toggle; (b) No — permanent | Vote model, UX |
| P-11 | Guest vote attribution | If board has `guestVotingEnabled`: how to prevent duplicate guest votes? (a) IP address (circumventable, privacy concern); (b) Browser fingerprint; (c) No enforcement — accept duplicate guest votes | Security, PII |
| P-12 | Initial post status | When `postModerationEnabled = false`: (a) `OPEN` immediately; (b) `OPEN` and require `status` in the create input | Default status value |
| P-13 | Pinned post ordering | Multiple pinned posts on one board: (a) order by `pinnedAt DESC` (most recently pinned first); (b) admin-controlled `pinPosition` integer; (c) `pinnedAt ASC` (oldest pin first) | Pin model, UI complexity |
| P-14 | Hard vs soft delete | (a) Hard delete immediately — post gone; (b) Soft delete — `deletedAt` field, hidden from public but visible to admins for audit | Compliance, data recovery |
| P-15 | Post edit history | (a) No history — last write wins; (b) Audit log of title/description changes (who changed what, when) | Model complexity |
| P-16 | `PENDING` visibility | When `postModerationEnabled = true`, `PENDING` posts: (a) visible only to the submitting user and admins; (b) visible only to admins | UX, filtering complexity |

---

## Resolved Decisions

| # | Topic | Resolution | Source |
|---|-------|------------|--------|
| R-01 | Admin scope | Global admins only; no per-board moderators in v1 | Inherited from boards.md decision 01 |
| R-02 | Board relationship | A post belongs to exactly one board; no cross-board posts | This spec |
| R-03 | Cascade on board delete | Post, votes, and comments are hard-deleted in the same transaction as the board | boards.md decision 19 |
| R-04 | `whoCanPost` semantics | Post permission is inherited from board settings: `ANYONE` / `AUTHENTICATED` / `ADMINS_ONLY` | boards.md decision 04 |
| R-05 | Post statuses | Six statuses: `OPEN`, `UNDER_REVIEW`, `PLANNED`, `IN_PROGRESS`, `SHIPPED`, `CLOSED` | This spec |
| R-06 | Status changes | Admin only. Authors cannot change status. | This spec |
| R-07 | Pin scope | A post is pinned to its board; it has no meaning outside its board | This spec |
| R-08 | Author edit window | Author (authenticated, non-admin) may edit title and description only. All other fields are admin-only. | This spec |
| R-09 | Post URL pattern | `/boards/[boardSlug]/posts/[postId]` — see P-01 for postId format | This spec (P-01 unresolved) |

---

## 0. Glossary

| Term | Definition |
|------|------------|
| **Post** | A single piece of feedback submitted to a board |
| **Author** | The authenticated user who created the post, or `null` for guest posts |
| **Status** | Lifecycle state of a post: `OPEN`, `UNDER_REVIEW`, `PLANNED`, `IN_PROGRESS`, `SHIPPED`, `CLOSED` |
| **Pinned** | A post flagged by an admin to appear above all non-pinned posts on a board |
| **Vote** | An upvote cast by a user (or guest, if enabled) on a post |
| **Guest** | An unauthenticated visitor |
| **Moderation** | When `postModerationEnabled = true` on a board, new posts require admin approval before becoming visible (`PENDING` status) |
| **voteCount** | Denormalised count of votes on a post, kept in sync with the `Vote` table |

---

## 1. Data Model

### 1.1 Post

```
Post {
  id            String      @id                       // format: see P-01
  boardId       String                                // FK → Board
  authorId      String?                               // FK → User; null for guest posts
  title         String                                // max: see P-02
  description   String?                               // max: see P-03; format: see P-04
  status        PostStatus  @default(OPEN)            // see R-05; PENDING added when postModerationEnabled
  isPinned      Boolean     @default(false)
  pinnedAt      DateTime?                             // set when isPinned flips to true
  voteCount     Int         @default(0)               // denormalised; kept in sync on every vote change
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  board         Board       @relation(...)
  author        User?       @relation(...)
  votes         Vote[]

  @@index([boardId, status])
  @@index([boardId, voteCount])
  @@index([boardId, createdAt])
  @@index([boardId, isPinned])
  @@index([authorId])
}

enum PostStatus {
  PENDING       // awaiting admin approval (only when postModerationEnabled = true)
  OPEN
  UNDER_REVIEW
  PLANNED
  IN_PROGRESS
  SHIPPED
  CLOSED
}
```

**`PENDING` is only reachable when `board.settings.postModerationEnabled = true`.** When moderation is disabled, posts are created with `status = OPEN` directly.

**`voteCount` is denormalised.** It is incremented/decremented atomically in the same transaction as the `Vote` create/delete. It is never computed at query time.

### 1.2 Vote

```
Vote {
  id        String    @id @default(cuid())
  postId    String                            // FK → Post
  userId    String?                           // FK → User; null for guest votes
  guestKey  String?                           // guest vote de-duplication key (see P-11)
  createdAt DateTime  @default(now())

  post      Post      @relation(...)
  user      User?     @relation(...)

  @@unique([postId, userId])                  // one vote per authenticated user per post
  @@index([postId])
  @@index([userId])
}
```

**`userId` and `guestKey` are mutually exclusive:** a vote has exactly one of them set (enforced at the application layer).

---

## 2. Post Character Limits

> **Blocked on P-02 and P-03.** The values below are placeholders and must be
> replaced with resolved decisions before the Zod schema is written.

| Field | Min | Max (TBD) |
|-------|-----|-----------|
| `title` | 5 characters | P-02 |
| `description` | 0 (optional) | P-03 |

Limits are enforced:
1. At the Zod input schema layer (tRPC procedure input)
2. At the DB column level (if using `VARCHAR`; Postgres `TEXT` has no length limit — application layer is the sole enforcer if using `TEXT`)

---

## 3. Operations

---

### 3.1 Create a Post

#### User Story
> As a user, I want to submit feedback to a board so that the team knows what I need.

#### Acceptance Criteria

1. A post is created when a valid `title` (and optional `description`) is submitted to an existing, accessible board.
2. The caller's permission to post is checked against `board.settings.whoCanPost`:
   - `ADMINS_ONLY`: only callers with global `ADMIN` role may post.
   - `AUTHENTICATED`: only authenticated callers may post.
   - `ANYONE`: authenticated and guest callers may post.
3. When `board.settings.postModerationEnabled = true`, the post is created with `status = PENDING` and is not visible to other non-admin users until approved.
4. When `board.settings.postModerationEnabled = false`, the post is created with `status = OPEN` and is immediately visible.
5. `authorId` is set server-side from the session. Guest posts have `authorId = null`.
6. `voteCount` is initialised to `0`.
7. The creating user's own vote is NOT automatically cast — submitting a post does not vote for it.
8. The response includes the full post object.
9. Submitting to a private board (`isPublic = false`) as a non-admin returns `POST_NOT_FOUND` (not `FORBIDDEN`), to avoid leaking board existence.
10. Submitting to a non-existent board returns `BOARD_NOT_FOUND`.
11. If duplicate detection is enabled (P-06), a warning is returned alongside the created post or before creation — per the resolved behaviour of P-06.

#### Edge Cases

- `title` is only whitespace → rejected; treat as missing after `.trim()`.
- Board `whoCanPost` changes to a more restrictive value mid-session → the next post attempt is rejected under the new rules; in-flight requests may still complete.
- Guest submits when `whoCanPost = ANYONE` and board `postModerationEnabled = true` → post created as `PENDING`; guest attribution follows P-05.
- Concurrent posts with identical title → both created; duplicate detection (P-06) is advisory only and does not provide uniqueness.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "This board doesn't exist." | `logger.info { boardId }` |
| Not permitted to post (`AUTHENTICATED` required) | "You must be signed in to submit feedback." | `logger.info { boardId }` |
| Not permitted to post (`ADMINS_ONLY`) | "Only admins can submit feedback to this board." | `logger.info { boardId, userId }` |
| Title missing or blank | "A title is required." | not logged |
| Title too long | "Title must be [max] characters or fewer." | not logged |
| Description too long | "Description must be [max] characters or fewer." | not logged |
| DB error | "Something went wrong. Please try again." | `logger.error { err, boardId }` |

#### Security Requirements

- `authorId` is always set server-side from the session; callers cannot supply it.
- `status` cannot be set by the caller on creation — it is always `PENDING` or `OPEN` per board settings.
- `isPinned` cannot be set by the caller on creation.
- Board existence must be checked before checking `whoCanPost`; both return the same error to avoid leaking existence of private boards.

#### API Contract

**Procedure:** `posts.create`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  boardId:     z.string().cuid(),
  title:       z.string().trim().min(5).max(/* P-02 */),
  description: z.string().trim().max(/* P-03 */).optional(),
})
```

**Output:**
```ts
{
  id:          string,
  boardId:     string,
  authorId:    string | null,
  title:       string,
  description: string | null,
  status:      "PENDING" | "OPEN",
  isPinned:    false,
  voteCount:   0,
  createdAt:   string, // ISO-8601
  updatedAt:   string,
  // If duplicate detection enabled (P-06):
  similarPosts?: Array<{ id: string, title: string, voteCount: number }>,
}
```

---

### 3.2 Read a Post

#### User Story (Public)
> As a visitor, I want to read a post to understand the feedback and see its current status.

#### User Story (Admin)
> As an admin, I want to see the full post detail including internal status and author info for triage.

#### Acceptance Criteria

1. A post on a public board is readable by anyone (authenticated or not).
2. A `PENDING` post is readable only by the author (if authenticated) and admins; all other callers receive `POST_NOT_FOUND`.
3. A post on a private board is readable only by authenticated admins; non-admins receive `POST_NOT_FOUND`.
4. The public view includes: `id`, `boardId`, `title`, `description`, `status`, `isPinned`, `voteCount`, `createdAt`, and a `hasVoted` boolean for the current user.
5. The admin view additionally includes: `authorId`, `author.email`, `author.name`, `pinnedAt`, `updatedAt`.
6. `hasVoted` is `false` for unauthenticated callers.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "This post doesn't exist." | `logger.info { postId }` |
| Post on private board, non-admin | "This post doesn't exist." | `logger.info { postId, userId }` |
| `PENDING` post, non-author non-admin | "This post doesn't exist." | `logger.info { postId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Response never leaks the existence of a `PENDING` post to non-authors.
- Response never leaks the existence of a post on a private board to non-admins.
- Author PII (`email`) is returned only in the admin view.

#### API Contract

**Procedure:** `posts.getById`  
**Type:** `query`

**Input:**
```ts
z.object({ id: z.string() })
```

**Output (public view):**
```ts
{
  id:          string,
  boardId:     string,
  title:       string,
  description: string | null,
  status:      PostStatus,
  isPinned:    boolean,
  voteCount:   number,
  hasVoted:    boolean,
  createdAt:   string,
}
```

**Output (admin view — additional fields):**
```ts
{
  // …all public fields, plus:
  authorId:   string | null,
  author:     { id: string, name: string | null, email: string } | null,
  pinnedAt:   string | null,
  updatedAt:  string,
}
```

---

### 3.3 Update a Post

#### User Story (Author)
> As the author of a post, I want to correct my feedback's title and description after submitting it.

#### User Story (Admin)
> As an admin, I want to edit any post's title and description to fix clarity issues without deleting the post.

#### Acceptance Criteria

1. The `title` and `description` fields may be updated by the post's author or a global admin.
2. All other fields (`status`, `isPinned`, `voteCount`, `boardId`) are not editable via this procedure; use the dedicated procedures for those.
3. Authors may only edit their own posts; admins may edit any post.
4. A `PENDING` post may be edited by its author while awaiting approval.
5. An author editing a `SHIPPED` or `CLOSED` post: **decision required** — should editing be locked by status? Flagged as P-17 below.
6. `updatedAt` is refreshed on every successful update.
7. A no-op update (same values) succeeds and returns the current post without modifying `updatedAt`.
8. Partial updates are supported (PATCH semantics); omitting a field leaves it unchanged.

> **P-17 (new):** Should authors be locked out of editing when post status is `SHIPPED` or `CLOSED`? Options: (a) no lock — author can always edit their own post; (b) locked at `SHIPPED`/`CLOSED` — admin only can edit.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "Post not found." | `logger.info { postId }` |
| Not author or admin | "You don't have permission to edit this post." | `logger.warn { userId, postId }` |
| Title blank after trim | "A title is required." | not logged |
| Title too long | "Title must be [max] characters or fewer." | not logged |
| Description too long | "Description must be [max] characters or fewer." | not logged |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Post `id` is used as the stable identifier; `boardId` is not required in input.
- `authorId`, `boardId`, `status`, `isPinned`, and `voteCount` cannot be changed via this procedure.
- Caller identity is verified server-side; `authorId` is never trusted from the request.

#### API Contract

**Procedure:** `posts.update`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:          z.string(),
  title:       z.string().trim().min(5).max(/* P-02 */).optional(),
  description: z.string().trim().max(/* P-03 */).nullish(),
})
```

**Output:** Same shape as `posts.getById` admin view.

---

### 3.4 Delete a Post

#### User Story
> As an admin, I want to delete a post that violates guidelines or is a duplicate so that the board stays clean.

#### Acceptance Criteria

1. Only global admins may delete a post.
2. Deleting a post removes the post and all of its votes in a single atomic transaction. (Comments are also included if the Comments feature is built — see boards.md §4.)
3. `voteCount` denormalisation does not need to be maintained after deletion — the row is gone.
4. The response confirms the post id and the count of deleted votes.
5. Deleting a non-existent post returns `POST_NOT_FOUND`.

#### Edge Cases

- Admin deletes a post that the author is currently editing → the author's in-flight edit returns `POST_NOT_FOUND` on submit; data is lost (no draft recovery in v1).

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "Post not found." | `logger.info { postId }` |
| Not admin | "You don't have permission to delete this post." | `logger.warn { userId, postId }` |
| DB error | "Something went wrong. The post was not deleted." | `logger.error { err, postId }` |

#### Security Requirements

- Admin role required.
- No confirmation flag required at the API level (deletion is recoverable within the same transaction if it fails; non-recoverable once committed). UI should prompt a confirm dialog as a UX safeguard.

#### API Contract

**Procedure:** `posts.delete`  
**Type:** `mutation`

**Input:**
```ts
z.object({ id: z.string() })
```

**Output:**
```ts
{
  id:            string,
  deletedCounts: { votes: number },
}
```

---

### 3.5 List Posts on a Board

#### User Story
> As a visitor, I want to browse all feedback on a board, filtered and sorted, so that I can find what I care about and vote.

#### User Story (Admin)
> As an admin, I want to see all posts including `PENDING` ones so that I can triage new submissions.

#### Acceptance Criteria

1. **Public view:** returns all posts with `status != PENDING` on a public board. `PENDING` posts are excluded unless the caller is an admin or the post's author.
2. **Admin view:** returns all posts including `PENDING` ones.
3. Pinned posts always appear first within any sort order, regardless of sort field or direction. Among non-pinned posts, the selected sort applies.
4. Supported sort fields: `voteCount DESC` (default), `createdAt DESC`, `createdAt ASC`, `status`.
5. Status filter: caller may request one or more statuses. Default (no filter): all non-`PENDING` statuses.
6. Pagination: cursor-based (using `createdAt` + `id` as cursor) — posts can accumulate rapidly; offset pagination degrades under load.
7. A board with no posts returns an empty `items` array (not an error).
8. Private board: non-admin callers receive `BOARD_NOT_FOUND`.

#### Edge Cases

- Two posts have identical `voteCount` and `createdAt` — tie broken by `id` (alphabetical CUID order) for stable cursor pagination.
- Board visibility changes mid-request — each request is evaluated at the time it arrives.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "This board doesn't exist." | `logger.info { boardId }` |
| Private board, non-admin | "This board doesn't exist." | `logger.info { boardId, userId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- `PENDING` posts are never included in a public response.
- Private board existence is not revealed to non-admins.

#### API Contract

**Procedure:** `posts.list`  
**Type:** `query`

**Input:**
```ts
z.object({
  boardId:  z.string().cuid(),
  status:   z.array(z.enum(["OPEN","UNDER_REVIEW","PLANNED","IN_PROGRESS","SHIPPED","CLOSED"])).optional(),
  orderBy:  z.enum(["votes", "newest", "oldest"]).default("votes"),
  cursor:   z.string().optional(),  // opaque cursor from previous page
  limit:    z.number().int().min(1).max(50).default(20),
})
```

**Output:**
```ts
{
  items: Array<{
    id:          string,
    title:       string,
    description: string | null,
    status:      PostStatus,
    isPinned:    boolean,
    voteCount:   number,
    hasVoted:    boolean,
    createdAt:   string,
    // Admin only:
    authorId?:   string | null,
    author?:     { name: string | null } | null,
  }>,
  nextCursor: string | null,  // null when no more pages
}
```

---

### 3.6 Change Post Status

#### User Story
> As an admin, I want to change a post's status so that submitters know where their feedback stands in the roadmap.

#### Acceptance Criteria

1. Only global admins may change post status.
2. Any transition between statuses is permitted (no enforced state machine in v1).
3. Transitioning a `PENDING` post to any non-`PENDING` status constitutes approval — the post becomes publicly visible.
4. The `PENDING` status may only be set programmatically (on post creation with moderation enabled); it cannot be manually assigned via this procedure.
5. `updatedAt` is refreshed on every status change.

#### Edge Cases

- Setting the same status that is already set → succeeds without error; `updatedAt` is not updated (no-op).
- Admin sets status to `PENDING` via the API → rejected with `INVALID_STATUS_TRANSITION`.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "Post not found." | `logger.info { postId }` |
| Not admin | "You don't have permission to change post status." | `logger.warn { userId, postId }` |
| Attempt to set `PENDING` | "Status cannot be set to Pending manually." | `logger.warn { userId, postId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Admin role required.
- `PENDING` status is write-protected via this procedure.

#### API Contract

**Procedure:** `posts.setStatus`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:     z.string(),
  status: z.enum(["OPEN","UNDER_REVIEW","PLANNED","IN_PROGRESS","SHIPPED","CLOSED"]),
})
```

**Output:**
```ts
{
  id:        string,
  status:    PostStatus,
  updatedAt: string,
}
```

---

### 3.7 Pin a Post

#### User Story
> As an admin, I want to pin important announcements or high-priority posts to the top of a board so that visitors see them first.

#### Acceptance Criteria

1. Only global admins may pin or unpin a post.
2. Pinning sets `isPinned = true` and records `pinnedAt = now()`.
3. Unpinning sets `isPinned = false` and clears `pinnedAt = null`.
4. There is no maximum number of pinned posts per board in v1.
5. Pinned posts appear above all non-pinned posts in every sort order on `posts.list`.
6. The ordering of multiple pinned posts relative to each other is governed by the resolved value of P-13.
7. Pinning a post that is already pinned is a no-op (returns success, no DB write).
8. Unpinning a post that is not pinned is a no-op.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "Post not found." | `logger.info { postId }` |
| Not admin | "You don't have permission to pin posts." | `logger.warn { userId, postId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Admin role required.

#### API Contract

**Procedure:** `posts.setPin`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:      z.string(),
  pinned:  z.boolean(),
})
```

**Output:**
```ts
{
  id:       string,
  isPinned: boolean,
  pinnedAt: string | null,
}
```

---

## 4. Guest Posting

Guest posting is controlled by `board.settings.whoCanPost`:

| `whoCanPost` value | Authenticated user | Guest |
|--------------------|--------------------|-------|
| `ANYONE`           | ✅ May post         | ✅ May post |
| `AUTHENTICATED`    | ✅ May post         | ❌ Blocked |
| `ADMINS_ONLY`      | ❌ Blocked (unless admin) | ❌ Blocked |

- Default is `AUTHENTICATED` (boards.md decision 04).
- When a guest posts, `authorId` is `null`.
- Guest attribution (display name, email) is governed by **P-05** above.
- Guest posts are subject to the same moderation rules as authenticated posts.

---

## 5. Duplicate Detection

Governed by **P-06**, **P-07**, and **P-08** above. Until those decisions are resolved, no duplicate detection is implemented.

If detection is enabled, it fires in `posts.create` and:
- Searches for similar posts on the **same board only** (not cross-board).
- Returns `similarPosts` in the response alongside the draft (advisory) or before creation (soft-block) per P-06.
- A similarity threshold below P-08 suppresses the warning.
- Exact title match is always surfaced regardless of threshold.

---

## 6. Post URL Pattern

```
/boards/[boardSlug]/posts/[postId]
```

- `boardSlug` is the board's globally unique slug (boards.md §2).
- `postId` format is resolved by **P-01**.
- The `boardSlug` segment is included in the URL for human readability and for scoping the post within its board context. It is not used for the database lookup — the server fetches by `postId` and verifies it belongs to the board matching `boardSlug`, returning `POST_NOT_FOUND` if they don't match (prevents ID enumeration across boards).

---

## 7. Relationship to Board

- A post belongs to exactly one board (`boardId` is immutable after creation).
- Moving a post to a different board is out of scope for v1.
- When a board is **hard-deleted**, all posts (and their votes and comments) are deleted in the same transaction. See boards.md §4 for cascade order and the "1 000 post" comment requirement.

---

## 8. Cascade on Post Delete

```
Post
 ├─ Vote[]
 └─ Comment[]   (if Comments feature is built; cascade rule must be extended here)
```

Post deletion order within the transaction:
1. Delete all `Vote` records on the post.
2. Delete all `Comment` records on the post (including nested replies, if applicable).
3. Delete the `Post` itself.

---

## 9. `voteCount` Consistency

`voteCount` on `Post` is a denormalised integer. Rules:

- **On vote create:** `UPDATE Post SET voteCount = voteCount + 1 WHERE id = $postId` in the same transaction as `INSERT INTO Vote`.
- **On vote delete (if retraction is enabled — P-10):** `UPDATE Post SET voteCount = voteCount - 1` in the same transaction as `DELETE FROM Vote`.
- **On post delete:** no update needed — the row is gone.
- **On board delete:** no update needed — all rows are gone.

If `voteCount` drifts (e.g. after a failed transaction), it can be recomputed as `SELECT COUNT(*) FROM Vote WHERE postId = $id`. A repair script or admin endpoint should be provided if drift is detected.

---

## 10. Indexes

Required indexes (beyond those on the Post model above):

| Table | Index | Rationale |
|-------|-------|-----------|
| `Post` | `(boardId, status, voteCount DESC)` | Primary list query with status filter + vote sort |
| `Post` | `(boardId, isPinned, voteCount DESC)` | Pin-first sort |
| `Post` | `(boardId, createdAt DESC)` | Recency sort |
| `Vote` | `(postId, userId)` | Unique constraint + `hasVoted` lookup |
| `Vote` | `(userId)` | User's vote history |

---

## 11. Out of Scope for v1

| Feature | Notes |
|---------|-------|
| Post comments / replies | Cascade hook point exists in §8 but the feature itself is not specced here |
| Post tags / labels | Design for v1.1 consideration |
| Post attachments (images, files) | Not in scope |
| Moving a post between boards | Not in scope |
| Post merge (consolidate duplicates) | Not in scope; related to P-06 |
| Subscriber notifications ("notify me on status change") | Not in scope |
| Post edit history | Flagged as P-15 |
| Admin post approval queue view | UI concern; backed by `status = PENDING` filter on `posts.list` |
