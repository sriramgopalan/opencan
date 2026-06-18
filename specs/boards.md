# Spec: Boards

**Application:** Etash — Customer Feedback  
**Version:** 0.2  
**Status:** ACCEPTED

---

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| 01 | Admin scope | Global admins only; no per-board roles in v1. Board creator is recorded as `ownerId`; global admins manage all boards. |
| 02 | Visibility flags | Two flags: `isPublic` (viewable without login) + `isListed` (appears on public index). Combination `isPublic=false, isListed=true` is invalid and rejected at validation time. |
| 03 | Board deletion | Hard delete in v1. Single synchronous DB transaction. Soft delete deferred to v1.1 consideration. |
| 04 | `whoCanPost` | Enum of three tiers: `ANYONE` / `AUTHENTICATED` / `ADMINS_ONLY`. Default: `AUTHENTICATED`. |
| 05 | `BoardSettings` storage | JSON columns directly on the `Board` table — no separate relation. Settings are always read with the board and never queried independently. A typed Zod schema validates the JSON shape on every read and write. |
| 06 | Slug uniqueness scope | Globally unique across all workspaces. URL pattern: `/boards/{slug}`. |
| 07 | Deleted board slug reuse | Slug freed immediately on hard delete and available for reuse by the next board to claim it. |
| 08 | Reserved slugs | `api`, `auth`, `dashboard`, `settings`, `admin`, `roadmap`, `changelog`, `feedback`, `public`, `health`, `robots`, `sitemap`, `static`, `assets`. |
| 09 | Board name max length | 100 characters. |
| 10 | Board count cap | No cap in v1. |
| 11 | Slug format | Lowercase alphanumeric and hyphens only; must start with a letter; minimum 3 characters, maximum 50 characters. |
| 12 | Slug auto-generation | Derive from `name` (lowercase, spaces→hyphens, strip special characters). On collision, append a random 4-character alphanumeric suffix. No `BoardSlugHistory` table in v1. |
| 13 | Delete confirmation | UI must require the user to type the board name before the delete API is called. API enforces `confirm: z.literal(true)`. |
| 14 | Deletion execution | Synchronous in a single DB transaction. Code comment required: "migrate to async background job if post count regularly exceeds 1000." |
| 15 | Board ordering | Manual drag-and-drop `position` field for admin. `createdAt DESC` is the default order until a board has been manually positioned. |
| 16 | Guest posting default | Off by default (`whoCanPost = AUTHENTICATED`); admin can enable per board. |
| 17 | Guest voting default | `guestVotingEnabled = false` by default; admin can enable per board. |
| 18 | Post moderation default | `postModerationEnabled = false` by default (posts appear immediately); admin can enable per board (posts held for approval). |
| 19 | Cascade on delete | Hard-delete posts, votes, and comments in the same transaction. No other attached entities in v1 scope. |

| A | `getBySlug` field visibility | Single `boards.getBySlug` procedure; returns full admin view if caller holds global admin role, restricted public view otherwise. No separate `boards.getAdmin` procedure. |
| B | `boards.list` pagination | Offset/page-number pagination. Boards are a small bounded list; cursor-based pagination is not justified. |
| C | Invite-link mechanism | Out of scope for v1. The `isPublic` + `isListed` two-flag model is sufficient. No invite token. |

---

## 0. Glossary

| Term | Definition |
|------|-----------|
| **Board** | Top-level container for feedback posts belonging to a product or team |
| **Admin** | A user with the global `ADMIN` role; has full access to all boards across the workspace. No per-board roles exist in v1. |
| **Board Owner** | The user who created the board, recorded in `ownerId`. Ownership is informational in v1 — all global admins have equal management rights. |
| **Guest** | An unauthenticated visitor |
| **Slug** | URL-safe identifier for a board, e.g. `feature-requests`. Globally unique. Used in the URL pattern `/boards/{slug}`. |
| **Unlisted** | Board is `isPublic=true` but `isListed=false` — accessible via direct link, not shown on the public index. |

---

## 1. Data Model

### 1.1 Board

```
Board {
  id            String      @id @default(cuid())
  slug          String      @unique
  name          String      // max 100 characters
  description   String?
  isPublic      Boolean     @default(false)
  isListed      Boolean     @default(false)
  position      Int         @default(0)   // manual ordering; ties broken by createdAt
  ownerId       String                    // FK → User; set to creator at creation time
  settingsJson  Json                      // validated against BoardSettingsSchema on read/write
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```

**Validation invariant:** `isPublic=false` with `isListed=true` is rejected at the application layer before any DB write. This combination has no valid semantics (a private board cannot appear on the public index).

### 1.2 BoardSettings (JSON schema)

Settings are stored in the `settingsJson` column on the `Board` table and validated on every read and write using the following Zod schema:

```ts
const BoardSettingsSchema = z.object({
  whoCanPost:            z.enum(['ANYONE', 'AUTHENTICATED', 'ADMINS_ONLY']).default('AUTHENTICATED'),
  guestVotingEnabled:    z.boolean().default(false),
  postModerationEnabled: z.boolean().default(false),
});

type BoardSettings = z.infer<typeof BoardSettingsSchema>;
```

`PostPermission` values:

| Value | Who may post |
|-------|-------------|
| `ANYONE` | Authenticated users and guests |
| `AUTHENTICATED` | Logged-in users only (default) |
| `ADMINS_ONLY` | Global admins only |

There is no separate `BoardSettings` table. All settings are always loaded with the board record and are never queried independently.

---

## 2. Slug Rules

### 2.1 Format

- Lowercase ASCII letters, digits, and hyphens only: `/^[a-z][a-z0-9-]*$/`
- Must start with a letter (not a digit or hyphen)
- Minimum 3 characters, maximum 50 characters
- May not end with a hyphen
- May not contain consecutive hyphens (`--`)

### 2.2 Uniqueness

- Slugs are **globally unique** across all workspaces. URL pattern: `/boards/{slug}`.
- A slug freed by a hard-deleted board is immediately available for reuse.
- Uniqueness is enforced by the DB `@unique` constraint, not solely by application-layer checks.

### 2.3 Auto-generation

- If the caller does not supply a `slug`, one is derived from `name` by:
  1. Lowercasing
  2. Replacing spaces and illegal characters with hyphens
  3. Collapsing consecutive hyphens
  4. Trimming to 50 characters
  5. Stripping leading/trailing hyphens
- If the derived slug is already taken or is reserved, a random 4-character alphanumeric suffix is appended (e.g. `feature-requests-a4zk`).
- The suffix retry loop attempts up to 5 times before returning a `SLUG_COLLISION` error.
- No `BoardSlugHistory` table is maintained in v1. Old slugs are not redirected after a slug change.

### 2.4 Reserved Slugs

The following slugs may never be used for a board:

```
api, auth, dashboard, settings, admin, roadmap, changelog,
feedback, public, health, robots, sitemap, static, assets
```

Any attempt to create or update a board with a reserved slug is rejected with error code `SLUG_RESERVED`.

---

## 3. Operations

---

### 3.1 Create a Board

#### User Story
> As a workspace admin, I want to create a new board so that my users have a dedicated place to submit and vote on feedback for a product area.

#### Acceptance Criteria

1. A board is created when a valid `name` (and optional `description`, `isPublic`, `isListed`, `slug`) is submitted by an authenticated admin.
2. If `slug` is omitted, it is auto-generated from `name` per §2.3.
3. If a provided `slug` violates format rules (§2.1), the request is rejected before any DB write with a specific validation message identifying the rule broken.
4. If a provided `slug` is already in use, the request is rejected with error code `SLUG_TAKEN`.
5. If a provided `slug` is reserved (§2.4), the request is rejected with error code `SLUG_RESERVED`.
6. `BoardSettings` is created in the same transaction with defaults: `whoCanPost = AUTHENTICATED`, `guestVotingEnabled = false`, `postModerationEnabled = false`.
7. The creating user is recorded as `ownerId`.
8. The response includes the full `Board` object including its resolved `slug` and `settings`.
9. A board with `isPublic = false` is not accessible to non-admins, regardless of `isListed`.
10. A board with `isPublic = true, isListed = false` is accessible via direct URL but does not appear in the public boards index.

#### Edge Cases

- `name` is only whitespace → rejected; treat as missing.
- `name` after trimming exceeds the max length → rejected with validation error.
- **Implementation note (v1):** `.trim()` is not actually applied to `name` or
  `description` in the live Zod schemas (`CreateBoardInput`/`UpdateBoardInput`)
  — validation relies on `min(1)` against the raw string. A whitespace-only
  `name` (e.g. a single space) currently passes validation rather than being
  rejected as "missing"; the edge case above is not yet enforced as described.
- `isPublic=false` with `isListed=true` supplied together → rejected with `INVALID_VISIBILITY_COMBINATION` before any DB write.
- Concurrent requests with the same slug → exactly one succeeds; the other receives `SLUG_TAKEN` (enforced by DB unique constraint, not application-layer check).
- Auto-generated slug collides → retry with random 4-character suffix up to 5 attempts, then return `SLUG_COLLISION`.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Not authenticated | "You must be signed in to create a board." | `logger.warn` — no sensitive data |
| Not an admin | "You don't have permission to create boards." | `logger.warn { userId, action }` |
| Invalid slug format | "Slug may only contain lowercase letters, numbers, and hyphens, and must start with a letter." | `logger.info { slugAttempt }` |
| Slug taken | "That URL is already in use. Please choose another." | `logger.info { slug }` |
| Slug reserved | "That URL is reserved and cannot be used." | `logger.info { slug }` |
| Invalid visibility combination | "A private board cannot be listed on the public index." | `logger.info { boardId }` |
| Name missing | "A board name is required." | not logged (client validation) |
| DB error | "Something went wrong. Please try again." | `logger.error { err }` |

#### Security Requirements

- Caller must be authenticated.
- Caller must hold the global `ADMIN` role.
- `ownerId` is set server-side from the session; callers cannot supply it.

#### API Contract

**Procedure:** `boards.create`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  name:        z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  isPublic:    z.boolean().default(false),
  isListed:    z.boolean().default(false),
  slug:        z.string().regex(/^[a-z0-9-]+$/).min(3).max(50).optional(),
  settings: z.object({
    whoCanPost:             z.enum(['ANYONE', 'AUTHENTICATED', 'ADMINS_ONLY']).default('AUTHENTICATED'),
    guestVotingEnabled:    z.boolean().default(false),
    postModerationEnabled: z.boolean().default(false),
  }).optional(),
})
```

**Output:**
```ts
{
  id:          string,
  slug:        string,
  name:        string,
  description: string | null,
  isPublic:    boolean,
  isListed:    boolean,
  ownerId:     string,
  settings: {
    whoCanPost:             'ANYONE' | 'AUTHENTICATED' | 'ADMINS_ONLY',
    guestVotingEnabled:    boolean,
    postModerationEnabled: boolean,
  },
  createdAt:   string, // ISO-8601
  updatedAt:   string,
}
```

---

### 3.2 Read a Board

#### User Story (Public)
> As a visitor, I want to view a public board so that I can see what feedback has been submitted and what the team is working on.

#### User Story (Admin)
> As an admin, I want to view any board (public or private) so that I can manage feedback and moderate posts.

#### Acceptance Criteria

1. A public board (`isPublic = true`) is readable by anyone (authenticated or not) using the board's `slug`.
2. A private board (`isPublic = false`) is readable only by authenticated admins.
3. The public view returns: `id`, `slug`, `name`, `description`, `isPublic`, `isListed`, `createdAt`, and the settings fields that affect the visitor experience (`whoCanPost`, `guestVotingEnabled`).
4. The admin view additionally returns: `ownerId`, `updatedAt`, `postModerationEnabled`, and aggregate counts (`postCount`, `totalVotes`).
5. Fetching a board by a slug that does not exist returns error code `BOARD_NOT_FOUND`.
6. Fetching a private board as a non-admin returns error code `BOARD_NOT_FOUND` (not `FORBIDDEN`), to avoid information leakage.

#### Edge Cases

- Slug lookup is case-insensitive (slugs are stored lowercase; normalise input before lookup).

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "This board doesn't exist." | `logger.info { slug }` |
| Private board, non-admin | "This board doesn't exist." | `logger.info { slug, userId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- No authentication required for public boards.
- Private boards require admin role.
- Response never leaks the existence of a private board to non-admins.

#### API Contract

**Procedure:** `boards.getBySlug`  
**Type:** `query`

**Input:**
```ts
z.object({ slug: z.string() })
```

**Output (public view):**
```ts
{
  id:          string,
  slug:        string,
  name:        string,
  description: string | null,
  isPublic:    boolean,
  isListed:    boolean,
  settings: {
    whoCanPost:          'ANYONE' | 'AUTHENTICATED' | 'ADMINS_ONLY',
    guestVotingEnabled: boolean,
  },
  createdAt:   string,
}
```

**Output (admin view — additional fields):**
```ts
{
  // …all public fields, plus:
  ownerId:    string,
  updatedAt:  string,
  settings: {
    // …all public settings, plus:
    postModerationEnabled: boolean,
  },
  _count: {
    posts: number,
    votes: number,  // currently hardcoded to 0 (see implementation note below)
  },
}
```

**Implementation note (v1):** `_count.votes` is always `0` in the current
`toAdminBoard()` implementation — it is not computed as a sum across the
board's posts. Real computation is deferred until the Vote model is fully
wired into board-level aggregates (tracked alongside the Posts/Voting
feature).

`boards.getBySlug` is a single procedure. The response shape is determined server-side by the caller's role — no separate `boards.getAdmin` procedure exists.

---

### 3.3 Update a Board

#### User Story
> As an admin, I want to update a board's name, description, visibility, or slug so that I can keep board information accurate as the product evolves.

#### Acceptance Criteria

1. Any subset of `name`, `description`, `isPublic`, `isListed`, `slug`, and `settings.*` fields may be updated in a single call.
2. If `slug` is being changed, all format and uniqueness rules (§2) apply to the new value.
3. Changing `slug` does not break existing links if the application implements redirect logic.
4. Changing `isPublic` from `true` to `false` immediately prevents public access; in-flight requests may still complete.
5. Changing `whoCanPost` to a more restrictive value does not retroactively remove existing posts.
6. `updatedAt` is refreshed on every successful update.
7. A no-op update (same values supplied) succeeds and returns the current board state without modifying `updatedAt`.
8. `ownerId` and `createdAt` cannot be changed via this procedure.
9. Partial updates are supported (PATCH semantics); omitted fields are left unchanged.

#### Edge Cases

- Slug change to the board's own current slug → treated as no-op for slug (no uniqueness conflict).
- Concurrent slug update to the same target slug → one succeeds, one returns `SLUG_TAKEN`.
- `isPublic=false` with `isListed=true` supplied together → rejected with `INVALID_VISIBILITY_COMBINATION`.
- No `BoardSlugHistory` table is maintained. Old slugs are immediately freed; there are no server-side redirects for slug changes in v1.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "Board not found." | `logger.info { boardId }` |
| Not admin | "You don't have permission to update this board." | `logger.warn { userId, boardId }` |
| Invalid slug | "Slug may only contain lowercase letters, numbers, and hyphens, and must start with a letter." | `logger.info` |
| Slug taken | "That URL is already in use." | `logger.info { slug }` |
| Invalid visibility combination | "A private board cannot be listed on the public index." | `logger.info { boardId }` |
| No fields changed | (success — return current state) | not logged |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Caller must be authenticated with global admin role.
- Board `id` is used as the stable identifier for updates (not `slug`, which may change).

#### API Contract

**Procedure:** `boards.update`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:          z.string().cuid(),
  name:        z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullish(),
  isPublic:    z.boolean().optional(),
  isListed:    z.boolean().optional(),
  slug:        z.string().regex(/^[a-z0-9-]+$/).min(3).max(50).optional(),
  settings: z.object({
    whoCanPost:             z.enum(['ANYONE', 'AUTHENTICATED', 'ADMINS_ONLY']).optional(),
    guestVotingEnabled:    z.boolean().optional(),
    postModerationEnabled: z.boolean().optional(),
  }).optional(),
})
```

**Output:** Same shape as `boards.create` output.

---

### 3.4 Delete a Board

#### User Story
> As an admin, I want to delete a board and all of its contents so that I can remove outdated or mistaken feedback channels.

#### Acceptance Criteria

1. Deleting a board removes the board, all of its posts, all votes on those posts, and all comments on those posts, in a single atomic transaction.
2. The delete operation is confirmed before execution — the API accepts an explicit `confirm: true` flag; absence of the flag returns a `CONFIRMATION_REQUIRED` error without touching data.
3. After deletion, the board's slug is no longer returned in any list view.
4. After deletion, direct URL access to the board returns `BOARD_NOT_FOUND`.
5. Any in-progress vote or comment submissions at deletion time either complete against the existing data or fail gracefully; they do not create orphaned records.
6. The number of deleted posts, votes, and comments is returned in the response for audit purposes.

#### Edge Cases

- Board has no posts → deletes cleanly; counts return zero.
- Very large board (many posts) → deletion is still synchronous and atomic in v1. Code comment required at the implementation site: "migrate to async background job if post count regularly exceeds 1000."
- **Implementation note (v1):** Comment cascade is deferred until the
  Comments feature is built (see §4 below and posts.md §8 for the cascade
  hook point). Board deletion in v1 cascades only `Vote` and `Post` records;
  `deletedCounts.comments` always returns `0`.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "Board not found." | `logger.info { boardId }` |
| Not admin | "You don't have permission to delete this board." | `logger.warn { userId, boardId }` |
| Confirmation mismatch | "Confirmation does not match the board URL. Please try again." | `logger.info { boardId }` |
| DB / transaction error | "Something went wrong. The board was not deleted." | `logger.error { err, boardId }` |

#### Security Requirements

- Caller must be authenticated with global admin role.
- `confirmSlug` is mandatory and must exactly match the board's current slug.
- UI must require the user to type the board's slug (not its name) in a confirmation dialog before the API is called.

**Implementation note (v1):** The originally specified `confirm: z.literal(true)`
boolean flag was replaced during implementation with `confirmSlug: z.string()`,
compared server-side against the board's current `slug`. This is a stronger
confirmation mechanism (it requires the admin to know/type the exact slug,
not just acknowledge a checkbox) but is a different field and check than
decision 13 describes.

#### API Contract

**Procedure:** `boards.delete`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:          z.string().cuid(),
  confirmSlug: z.string(),
})
```

**Output:**
```ts
{
  id:              string,
  slug:            string,
  deletedAt:       string, // ISO-8601
  deletedCounts: {
    posts:    number,
    votes:    number,
    comments: number,
  },
}
```

---

### 3.5 List Boards

#### User Story (Public)
> As a visitor, I want to see a list of public boards so that I can find the feedback channel relevant to me.

#### User Story (Admin)
> As an admin, I want to see all boards (public and private) so that I can manage the full workspace.

#### Acceptance Criteria

1. **Public view:** returns only boards where `isPublic = true AND isListed = true`. Private boards and unlisted boards are excluded.
2. **Admin view:** returns all boards regardless of `isPublic` or `isListed`. Each item includes a `_count` of posts.
3. Both views support pagination.
4. Default sort order is defined (see §5 — Board Ordering).
5. A board with zero posts is included in list results (empty state is a display-layer concern, §8).

#### Edge Cases

- Workspace has no boards → returns empty array (not an error).
- A board transitions from public to private mid-session → client may briefly show the board until the next list refresh; no server-side fix needed.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Not admin (admin list) | "You don't have permission to view all boards." | `logger.warn { userId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Public list requires no authentication.
- Admin list requires global admin role.

#### API Contract

**Procedure:** `boards.list`  
**Type:** `query`

Offset/page-number pagination is used. Boards are a small, bounded list; cursor-based pagination is not justified.

**Input:**
```ts
z.object({
  page:    z.number().int().min(1).default(1),
  limit:   z.number().int().min(1).max(100).default(20),
  orderBy: z.enum(['name', 'createdAt', 'postCount']).default('createdAt'),
  order:   z.enum(['asc', 'desc']).default('desc'),
  search:  z.string().max(200).optional(),  // case-insensitive substring match on name
})
```

**Output:**
```ts
{
  boards: Array<{
    id:          string,
    slug:        string,
    name:        string,
    description: string | null,
    isPublic:    boolean,
    isListed:    boolean,
    position:    number,
    createdAt:   string,
    // Admin only:
    _count?: { posts: number },
  }>,
  total:      number,  // total matching records (for page count calculation)
  page:       number,
  totalPages: number,
}
```

**Implementation note (v1):** The output key is `boards`, not `items` as
originally specified. Additionally, the `listBoards()` query does not
currently select `_count` for any row — admin list items do not yet carry a
post count; only single-board lookups (`boards.getBySlug` admin view,
`getBoardById`) include `_count`.

---

### 3.6 Board Settings

#### User Story
> As an admin, I want to configure who can post, whether guests can vote, and whether posts require moderation, so that I can control the quality and openness of feedback on each board.

#### Acceptance Criteria

1. Settings can be updated independently of other board fields.
2. Enabling `postModerationEnabled` means newly submitted posts are set to `status = PENDING` until an admin approves them; existing approved posts are unaffected.
3. Disabling `postModerationEnabled` does not auto-approve `PENDING` posts — they remain pending until manually reviewed.
4. Enabling `guestVotingEnabled` allows unauthenticated users to vote on posts on this board.
5. Disabling `guestVotingEnabled` does not remove existing guest votes — it only prevents new guest votes.
6. Changing `whoCanPost` to `ADMINS_ONLY` immediately prevents new post submission by non-admins; existing posts are unaffected.
7. All three settings are independent and can be toggled without affecting the others.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "Board not found." | `logger.info { boardId }` |
| Not admin | "You don't have permission to change board settings." | `logger.warn { userId, boardId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Caller must be authenticated with global admin role.

#### API Contract

Settings updates can be made either via `boards.update` (§3.3) using the
`settings` sub-object, or via the dedicated `boards.updateSettings`
procedure (§3.8) — both exist in the implementation.

---

### 3.8 Update Board Settings

#### User Story
> As an admin, I want to update a board's settings independently of its other fields so that I can adjust posting and moderation behaviour without resubmitting the whole board.

#### Implementation Note

Implemented as a dedicated procedure, separate from `boards.update`. It
performs a partial (shallow-merge) update of the `settings` JSON — fields
omitted from the input are left unchanged.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Board not found | "Board not found." | `logger.info { boardId }` |
| Not admin | "You don't have permission to change board settings." | `logger.warn { userId, boardId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Caller must be authenticated with global admin role.

#### API Contract

**Procedure:** `boards.updateSettings`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  id:       z.string().cuid(),
  settings: z.object({
    whoCanPost:             z.enum(['ANYONE', 'AUTHENTICATED', 'ADMINS_ONLY']).optional(),
    guestVotingEnabled:    z.boolean().optional(),
    postModerationEnabled: z.boolean().optional(),
  }),
})
```

**Output:** Same shape as `boards.create` output (full updated board, admin view).

---

### 3.9 Reorder Boards

#### User Story
> As an admin, I want to drag-and-drop boards into a custom order so that the most important boards appear first in the index.

#### Implementation Note

Implements the manual ordering mechanism referenced in decision 15 and §5
(Board Ordering). Accepts a batch of `{ id, position }` pairs and applies
them all in a single transaction.

#### Error States

| Condition | User-facing message | Logged |
|-----------|--------------------|-----------------------|
| Not admin | "You don't have permission to reorder boards." | `logger.warn { userId }` |
| DB error | "Something went wrong." | `logger.error { err }` |

#### Security Requirements

- Caller must be authenticated with global admin role.
- Does not currently verify that all supplied IDs exist or belong to the
  workspace before writing — tracked as a v1.1 follow-up tied to decision 01.

#### API Contract

**Procedure:** `boards.reorder`  
**Type:** `mutation`

**Input:**
```ts
z.object({
  updates: z.array(z.object({
    id:       z.string().cuid(),
    position: z.number().int().min(0),
  })).min(1).max(100),
})
```

**Output:**
```ts
{
  updated: number,  // count of boards updated
}
```

---

## 4. Cascade Behaviour on Deletion

Board deletion is a **hard delete** executed in a **single synchronous DB transaction**. If any step fails, the entire transaction is rolled back.

```
Board
 └─ Post[]
     ├─ Vote[]        (on each post)
     └─ Comment[]     (on each post, including nested replies — not yet implemented, see note below)
```

Deletion order within the transaction:

1. Delete all `Vote` records on all posts of the board.
2. Delete all `Comment` records (including nested replies) on all posts of the board.
3. Delete all `Post` records on the board.
4. Delete the `Board` itself.

**Implementation note (v1):** The `Comment` model does not exist yet, so step
2 above is not implemented. Board deletion in v1 cascades only `Vote` and
`Post` records, in that order, before deleting the `Board`; `deletedCounts.comments`
always returns `0` until the Comments feature is built.

**Implementation note (required code comment):** "migrate to async background job if post count regularly exceeds 1000."

No other entities (tags, attachments, integrations) are in scope for v1. If new entity types that attach to `Post` or `Board` are added, cascade rules must be extended here before the migration is written.

---

## 5. Board Ordering

### Default order

Both public and admin list views default to `createdAt DESC` (newest board first) until a board has been manually positioned.

### Manual ordering

Admins can drag-and-drop boards into a custom order. This sets the `position` integer field on each `Board` record. Once any board has a non-default `position`, the list is sorted by `position ASC`, with `createdAt DESC` as a tiebreaker for boards sharing the same position value.

### Supported sort fields (list API)

| Field | Notes |
|-------|-------|
| `createdAt` | Default |
| `name` | Alphabetical, locale-insensitive ASCII sort |
| `postCount` | Requires an aggregate; may be a computed/cached column |

Manual position is surfaced in the admin UI, not as a sort option in the `boards.list` API input.

---

## 6. Public Board Discoverability

| `isPublic` | `isListed` | Public index | Direct URL | Valid combination |
|------------|-----------|-------------|------------|-------------------|
| `true`     | `true`    | ✅ Appears  | ✅ Accessible | ✅ |
| `true`     | `false`   | ❌ Hidden   | ✅ Accessible | ✅ (unlisted) |
| `false`    | `false`   | ❌ Hidden   | ❌ 404 (non-admin) | ✅ |
| `false`    | `true`    | ❌ Rejected | ❌ Rejected | ❌ **Invalid — rejected at validation** |

- Admins can access all boards via direct URL or the admin list, regardless of these flags.
- Sharing a direct link to an unlisted-but-public board is the intended mechanism for "invite-only" public boards.
- The `isPublic=false, isListed=true` combination is rejected by the API on both create and update, before any DB write.

An invite-link token concept (e.g. `/boards/{slug}?invite={token}`) is out of scope for v1. The two-flag `isPublic` + `isListed` model is sufficient.

---

## 7. Empty State

An empty board (zero posts) is a valid, normal state. The following must hold:

1. `boards.getBySlug` succeeds and returns the board with `_count.posts = 0` (admin view) or without a count (public view).
2. `boards.list` includes the board in results.
3. Empty state messaging ("No feedback yet. Be the first to post!") is a UI concern — not specified here.
4. `postCount` sort in list views places empty boards consistently (e.g. last when sorting desc).
