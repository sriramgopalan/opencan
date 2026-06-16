# Spec: Posts

**Application:** Etash — Customer Feedback  
**Version:** 0.2  
**Status:** ACCEPTED

---

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| P-01 | Post URL identifier | Board-scoped integer counter. URL: `/boards/[boardSlug]/posts/[postNumber]`. `postNumber` is a per-board auto-incrementing integer. Internal DB primary key remains CUID. |
| P-02 | Title character limit | 150 characters maximum |
| P-03 | Description character limit | 2 000 characters maximum |
| P-04 | Description format | Markdown. Stored as raw string; rendered on display. XSS prevention via sanitisation on render. |
| P-05 | Guest post attribution | Guest posts require a `guestName` (display name). No email collected. No account created. `guestName` stored on the `Post` row. |
| P-06 | Duplicate detection | Client-side warning only. UI fetches similar posts before showing the compose form. User may proceed regardless. No server-side block. |
| P-07 | Duplicate detection method | PostgreSQL trigram similarity via `pg_trgm` extension. No external service. |
| P-08 | Similarity threshold | 0.4 — scores at or above this value surface a warning. |
| P-09 | Votes | Upvote only. No downvotes. |
| P-10 | Vote retraction | Toggle — users can retract their vote. |
| P-11 | Guest vote deduplication | IP-based deduplication via Redis (hashed IP, TTL 30 days). Not stored in database — privacy.md override applied. Known limitation: shared NAT can conflate voters; documented as accepted risk. |
| P-12 | Initial post status | Always `OPEN` (when moderation disabled) or `PENDING` (when moderation enabled). Not configurable by the caller. |
| P-13 | Pinned post ordering | Multiple pinned posts ordered by `pinnedAt DESC` — most recently pinned appears first. |
| P-14 | Delete strategy | Hard delete in v1. Soft delete (`deletedAt` field) deferred to v1.1. |
| P-15 | Post edit history | No history in v1. Last write wins. Deferred to v1.1. |
| P-16 | `PENDING` visibility | Visible to the submitting author and admins only. All other callers receive `POST_NOT_FOUND`. |
| P-17 | Author edit lock by status | Authors cannot edit posts with status `SHIPPED` or `CLOSED`. Only admins may edit those posts. |
| R-01 | Admin scope | Global admins only; no per-board moderators in v1 | Inherited from boards.md decision 01 |
| R-02 | Board relationship | A post belongs to exactly one board; no cross-board posts |
| R-03 | Cascade on board delete | Posts, votes, and comments are hard-deleted in the same transaction as the board — boards.md decision 19 |
| R-04 | `whoCanPost` semantics | Post permission inherited from board settings: `ANYONE` / `AUTHENTICATED` / `ADMINS_ONLY` — boards.md decision 04 |
| R-05 | Post statuses | Seven values: `PENDING`, `OPEN`, `UNDER_REVIEW`, `PLANNED`, `IN_PROGRESS`, `SHIPPED`, `CLOSED` |
| R-06 | Status changes | Admin only. Authors cannot change status. |
| R-07 | Pin scope | A post is pinned to its board; pin has no meaning outside its board |
| R-08 | Author edit window | Author may edit `title` and `description` only. All other fields are admin-only. |
| R-09 | Post URL pattern | `/boards/[boardSlug]/posts/[postNumber]` — resolved by P-01 |

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
  id            String      @id @default(cuid())      // internal DB key; not used in URLs
  postNumber    Int                                    // board-scoped counter; used in URL (/posts/[postNumber])
  boardId       String                                 // FK → Board
  authorId      String?                                // FK → User; null for guest posts
  guestName     String?                                // display name for guest posts (P-05); null for authenticated posts
  title         String                                 // max 150 characters (P-02)
  description   String?                                // max 2 000 characters, Markdown (P-03, P-04)
  status        PostStatus  @default(OPEN)             // PENDING only when postModerationEnabled = true
  isPinned      Boolean     @default(false)
  pinnedAt      DateTime?                              // set when isPinned flips to true; cleared on unpin
  voteCount     Int         @default(0)               // denormalised; kept in sync on every vote change
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  board         Board       @relation(...)
  author        User?       @relation(...)
  votes         Vote[]

  @@unique([boardId, postNumber])
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
  // Guest deduplication via Redis (not stored in DB)
  // privacy.md override — see implementation notes
  createdAt DateTime  @default(now())

  post      Post      @relation(...)
  user      User?     @relation(...)

  @@unique([postId, userId])                  // one vote per authenticated user per post
  @@index([postId])
  @@index([userId])
}
```

**`userId` and `guestIp` are mutually exclusive:** a vote has exactly one of them set (enforced at the application layer). Guest deduplication by IP is a best-effort mechanism; shared NAT environments may falsely prevent multiple legitimate voters. This is an accepted risk in v1 (P-11).

---

## 2. Post Character Limits and Format

| Field | Min | Max | Format |
|-------|-----|-----|--------|
| `title` | 5 characters | 150 characters | Plain text |
| `description` | 0 (optional) | 2 000 characters | Markdown |
| `guestName` | 2 characters | 50 characters | Plain text |

**Description Markdown:** Stored as a raw Markdown string. Rendered to HTML on display. The rendering layer must sanitise output (strip `<script>`, `javascript:` hrefs, and other XSS vectors) before inserting into the DOM.

Limits are enforced at the Zod input schema layer (tRPC procedure input). Both fields use Postgres `TEXT` columns — the application layer is the sole length enforcer.

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
11. Duplicate detection is client-side only. The `posts.getSimilar` query (§5) is called by the UI before showing the compose form. `posts.create` itself does not block on duplicates and does not return `similarPosts`.

#### Edge Cases

- `title` is only whitespace → rejected; treat as missing after `.trim()`.
- Board `whoCanPost` changes to a more restrictive value mid-session → the next post attempt is rejected under the new rules; in-flight requests may still complete.
- Guest submits when `whoCanPost = ANYONE` → `guestName` is required in the input; `authorId` is `null`. Post is subject to the same moderation rules as authenticated posts.
- Concurrent posts with identical title → both created; duplicate detection is client-side advisory only and provides no uniqueness guarantee.

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
  title:       z.string().trim().min(5).max(150),
  description: z.string().trim().max(2000).optional(),
  guestName:   z.string().trim().min(2).max(50).optional(), // required when caller is unauthenticated
})
```

**Output:**
```ts
{
  id:          string,
  postNumber:  number,
  boardId:     string,
  authorId:    string | null,
  guestName:   string | null,
  title:       string,
  description: string | null,
  status:      "PENDING" | "OPEN",
  isPinned:    false,
  voteCount:   0,
  createdAt:   string, // ISO-8601
  updatedAt:   string,
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
5. Authors cannot edit posts with status `SHIPPED` or `CLOSED` — only admins may edit those posts (P-17).
6. `updatedAt` is refreshed on every successful update.
7. A no-op update (same values) succeeds and returns the current post without modifying `updatedAt`.
8. Partial updates are supported (PATCH semantics); omitting a field leaves it unchanged.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found | "Post not found." | `logger.info { postId }` |
| Not author or admin | "You don't have permission to edit this post." | `logger.warn { userId, postId }` |
| Author editing `SHIPPED`/`CLOSED` post | "This post can no longer be edited." | `logger.info { userId, postId, status }` |
| Title blank after trim | "A title is required." | not logged |
| Title too long | "Title must be 150 characters or fewer." | not logged |
| Description too long | "Description must be 2 000 characters or fewer." | not logged |
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
  title:       z.string().trim().min(5).max(150).optional(),
  description: z.string().trim().max(2000).nullish(),
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
4. Supported sort fields: `voteCount DESC` (default), `createdAt DESC`, `createdAt ASC`, `status` (sorts ascending, with `createdAt DESC` then `postNumber ASC` as tiebreakers — same tiebreaker chain as the other sort fields).
5. Status filter: caller may request one or more statuses. Default (no filter): all non-`PENDING` statuses.
6. Pagination: cursor-based (using `createdAt` + `id` as cursor) — posts can accumulate rapidly; offset pagination degrades under load.
7. A board with no posts returns an empty `items` array (not an error).
8. Private board: non-admin callers receive `BOARD_NOT_FOUND`.

#### Edge Cases

- Two posts have identical `voteCount` and `createdAt` — tie broken by `postNumber ASC` for stable cursor pagination.
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
  orderBy:  z.enum(["votes", "newest", "oldest", "status"]).default("votes"),
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
6. Multiple pinned posts are ordered by `pinnedAt DESC` — the most recently pinned post appears first (P-13).
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

### 3.8 Vote on a Post

#### User Story
> As a user, I want to upvote a post I support so that the most popular feedback rises to the top.

#### Acceptance Criteria

1. Authenticated users can toggle their vote on any post visible to them on a public board (`PENDING` posts are visible only to their author and admins — see §3.2).
2. Voting on a post increments `voteCount` by 1 atomically.
3. Voting again on the same post retracts the vote and decrements `voteCount` by 1 atomically.
4. The output's `userHasVoted` reflects the caller's vote state immediately after the toggle.
5. Guest votes are accepted only when `board.settings.guestVotingEnabled` is `true`.
6. Guest deduplication uses Redis with a hashed-IP key and a 30-day TTL (`vote:guest:{boardId}:{postId}:{hashedIp}`).
7. A `PENDING` post is invisible to non-author, non-admin callers (per §3.2), so they receive `NOT_FOUND` when attempting to vote on one. Admins and the post's own author may vote on a `PENDING` post with no restriction — there is no dedicated status guard inside `toggleVote` itself.
8. Voting on a post on a private board, as a non-admin, returns `NOT_FOUND`.
9. Rate limited: 60 requests per IP per minute.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Post not found / not visible to caller | "Post not found." | not logged |
| Private board, non-admin | "This board doesn't exist." | `logger.info { boardId }` |
| Guest voting disabled | "Guest voting is not enabled for this board." | not logged |
| Rate limit exceeded | "Too many requests. Please try again later." | not logged |
| DB / Redis error | "Something went wrong." | `logger.error { err, postId }` |

#### Security Requirements

- Guests are identified by a hashed IP (`hashIp()`), never the raw IP, for vote deduplication.
- Authenticated users are deduplicated by the `@@unique([postId, userId])` constraint on `Vote`; guests are deduplicated by a Redis key with a 30-day TTL, not stored in Postgres (P-11).

#### API Contract

**Procedure:** `posts.toggleVote`  
**Type:** `mutation`

**Input:**
```ts
z.object({ postId: z.string().cuid() })
```

**Output:**
```ts
{
  voteCount:    number,
  userHasVoted: boolean,
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
- When a guest posts, `authorId` is `null` and `guestName` is required. No email is collected. No account is created (P-05).
- `guestName` is a plain-text display name, 2–50 characters.
- Guest posts are subject to the same moderation rules as authenticated posts.

---

## 5. Duplicate Detection

Detection is **client-side warning only** (P-06). The server does not block post creation on similarity. The UI calls `posts.getSimilar` before showing the compose form; the user may proceed regardless of results.

### 5.1 Query

**Procedure:** `posts.getSimilar`  
**Type:** `query`

**Input:**
```ts
z.object({
  boardId: z.string().cuid(),
  title:   z.string().trim().min(1).max(150),
})
```

**Output:**
```ts
{
  items: Array<{
    postNumber: number,
    title:      string,
    voteCount:  number,
    status:     PostStatus,
  }>,
}
```

### 5.2 Implementation

- Uses the PostgreSQL `pg_trgm` extension (`similarity()` function) (P-07).
- Searches titles of non-`PENDING` posts on the **same board only**.
- Returns posts where `similarity(post.title, $input) >= 0.4` (P-08), ordered by similarity score descending.
- Maximum 5 results returned.
- The `pg_trgm` extension must be enabled in the migration that creates the `Post` table: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- A trigram GIN index on `Post.title` is required for performance: `@@index([title], type: Gin, ops: { title: "gin_trgm_ops" })`
- Exact title match (similarity = 1.0) is always included if present.

---

## 6. Post URL Pattern

```
/boards/[boardSlug]/posts/[postNumber]
```

- `boardSlug` is the board's globally unique slug (boards.md §2).
- `postNumber` is a per-board auto-incrementing integer (e.g. `1`, `42`, `137`). It is unique within a board but not globally unique across all boards.
- The server looks up the post by `(boardId, postNumber)` — the `@@unique([boardId, postNumber])` constraint makes this a single-row lookup.
- The `boardSlug` segment is validated: if the post's board slug does not match the URL segment, the server returns `POST_NOT_FOUND` to prevent cross-board ID guessing.
- The internal CUID (`id`) is never exposed in URLs.

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
- **On vote retract (toggle, P-10):** `UPDATE Post SET voteCount = voteCount - 1` in the same transaction as `DELETE FROM Vote`.
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
| `Vote` | Redis key per (boardId, postId, hashedIp) | Guest vote deduplication — TTL 30 days, not in DB |
| `Vote` | `(userId)` | User's vote history |
| `Post` | GIN trigram on `title` | `posts.getSimilar` similarity search via pg_trgm |

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
| Post edit history | No history in v1 — last write wins. Deferred to v1.1 (P-15). |
| Admin post approval queue view | UI concern; backed by `status = PENDING` filter on `posts.list` |
