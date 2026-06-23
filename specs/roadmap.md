# Spec: Public Roadmap Page

**Application:** OpenCan — Customer Feedback
**Version:** 0.1
**Status:** ACCEPTED

---

## Decisions

| #     | Topic                     | Resolution |
|-------|---------------------------|------------|
| RM-01 | URL                       | `/roadmap` — reserved slug per boards.md; not a board URL |
| RM-02 | Column set                | Four columns, left to right: UNDER_REVIEW → PLANNED → IN_PROGRESS → SHIPPED |
| RM-03 | Excluded statuses         | OPEN (raw unprocessed feedback), PENDING (private until approved), CLOSED (inactive) |
| RM-04 | Board scope               | Cross-board: all public boards (`isPublic = true`). Private boards excluded entirely. |
| RM-05 | Sort within each column   | `voteCount DESC`, then `createdAt DESC` for ties |
| RM-06 | Per-column cap            | 20 posts maximum per status column; total query cap 200 rows |
| RM-07 | Auth requirement          | Public — no authentication required; `/roadmap` added to middleware public paths |
| RM-08 | Empty column behaviour    | Column is shown with an empty-state placeholder ("Nothing here yet") |
| RM-09 | Post linking              | Each post links to `/boards/[boardSlug]/posts/[postNumber]` |
| RM-10 | Board attribution         | Each post card shows the board name beneath the title |
| RM-11 | Voting on roadmap         | No VoteButton on roadmap — read-only page; users navigate to the post to vote |
| RM-12 | Data freshness            | Dynamic (no ISR in v1); same as board pages |
| RM-13 | Feature flag              | Gated behind `ROADMAP_PAGE` flag in `lib/flags.ts`; flag removed after first stable release |

---

## Glossary

| Term              | Definition |
|-------------------|------------|
| **Roadmap column** | A vertical list of posts sharing one lifecycle status |
| **Roadmap status** | One of the four statuses shown on the roadmap: UNDER_REVIEW, PLANNED, IN_PROGRESS, SHIPPED |
| **Public board**  | A board with `isPublic = true`; the only boards whose posts appear on the roadmap |

---

## Data Model

No new schema. The roadmap is a read-only view over the existing `Post` and `Board` tables.

Required fields per roadmap post card:
- `Post.id`, `Post.postNumber` — for generating the post URL
- `Post.title` — primary text
- `Post.description` — truncated preview (optional)
- `Post.status` — determines which column the post appears in
- `Post.voteCount` — sort key within column
- `Post.createdAt` — tiebreaker sort
- `Board.slug` — for post link construction
- `Board.name` — for board attribution display

---

## Acceptance Criteria

| #    | Criterion |
|------|-----------|
| AC-1 | Given any visitor (authenticated or not), `/roadmap` returns HTTP 200 |
| AC-2 | The page displays exactly four columns in order: Under Review, Planned, In Progress, Shipped |
| AC-3 | Posts in OPEN, PENDING, or CLOSED status never appear on the roadmap |
| AC-4 | Posts from private boards (`isPublic = false`) never appear on the roadmap |
| AC-5 | Within each column, posts are ordered by voteCount descending; ties broken by createdAt descending |
| AC-6 | Each column shows at most 20 posts |
| AC-7 | Each post card links to `/boards/[boardSlug]/posts/[postNumber]` |
| AC-8 | Each post card displays the originating board's name |
| AC-9 | A column with no posts shows a placeholder ("Nothing here yet") rather than being hidden |
| AC-10 | The page is reachable from the global nav ("Roadmap" link) |
