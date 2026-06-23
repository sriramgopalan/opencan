# Spec: My Posts

Status: ACCEPTED

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| MP-01 | URL | `/my-posts` — top-level, parallel to `/roadmap` |
| MP-02 | Ordering | Newest first (`createdAt DESC`) — users care about recent activity on their own posts |
| MP-03 | Statuses shown | All statuses including PENDING and CLOSED — users should see full history of their own posts |
| MP-04 | Pagination | Cursor-based, `?cursor=` URL param, 20 per page, consistent with boards |
| MP-05 | Guest posts | Not shown — guest posts have no `authorId`; cannot be attributed to an account |
| MP-06 | Vote button | Not shown — My Posts is a status-tracking view, not a voting view |
| MP-07 | Board context | `boardSlug` and `boardName` on each card — posts are cross-board, context is required for navigation |
| MP-08 | Data access | RSC calls repository directly (ADR-001: RSC may call repos directly) |
| MP-09 | Auth | `(protected)` layout provides the auth guard; `auth()` in the page provides userId |
| MP-10 | Empty state | Illustration with CTA linking to `/boards` |

## Acceptance Criteria

1. `/my-posts` redirects to `/auth/signin` for unauthenticated visitors
2. Authenticated user sees only posts where `authorId` matches their account (not guest posts, not other users' posts)
3. Posts are ordered newest first
4. Each post card shows title, status badge, board name, vote count, and created date
5. Clicking a post card navigates to `/boards/[boardSlug]/posts/[postNumber]`
6. When the user has more than 20 posts a "Load more" link appears at the bottom
7. Clicking "Load more" loads the next page via `?cursor=` URL parameter
8. Empty state is shown when the user has no posts, with a "Browse boards" link
9. A "My Posts" navigation link appears in SiteNav for authenticated users only
10. PENDING posts are visible to the author so they can track their own moderated submissions
