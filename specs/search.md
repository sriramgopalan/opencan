# Spec: Post Search on Boards

Status: ACCEPTED

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| S-01 | URL param | `?q=` — avoids collision with `?search=` used by the boards-list page |
| S-02 | Search scope | Title only — title captures the core intent; description search adds complexity without proportional benefit |
| S-03 | Min query length | 2 chars — enforced in the page (skip search call if shorter); `minLength="2"` on input for UX |
| S-04 | Search vs. filter coexistence | Mutually exclusive — when `?q=` is present, sort and status filter controls are hidden; search has its own relevance ordering |
| S-05 | URL persistence | `?q=query` — bookmarkable, shareable, no JS required |
| S-06 | Search result ordering | Vote count DESC then createdAt DESC — highest-signal results first |
| S-07 | Pagination | None — show up to 20 results; users searching expect a relevance list, not pages |
| S-08 | hasVoted on results | `false` (not resolved server-side) — same RSC pattern as the board list; VoteButton updates client-side |
| S-09 | PENDING visibility | Same rules as board list — non-admins see own PENDING posts only |
| S-10 | Data access | RSC calls repository directly (ADR-001) |
| S-11 | Index | Existing GIN trigram index on `Post.title` (via SQL migration) — Prisma `contains` + `mode: insensitive` maps to `ILIKE '%q%'` which the index accelerates for queries ≥ 3 chars |

## Acceptance Criteria

1. A search input is visible on every public board page
2. Submitting the form navigates to `/boards/[slug]?q=query` (GET, no JS required)
3. Queries shorter than 2 characters are ignored — the normal post list is shown
4. Search results are scoped to the current board (no cross-board results)
5. Results are ordered by vote count descending, then created date descending
6. PENDING posts are excluded from search results for non-admin visitors
7. Admins see PENDING posts in search results on their own boards
8. When a query is active, sort and status filter controls are hidden
9. A "Clear" link resets to the normal board view (removes `?q=`)
10. Empty-state message shown when no posts match the query
