# Spec: Admin Dashboard (Overview)

**Application:** OpenCan — Customer Feedback
**Version:** 0.1
**Status:** ACCEPTED
**ADR:** ADR-009

---

## Decisions

| #     | Topic                          | Resolution |
|-------|--------------------------------|------------|
| AD-01 | Charting library               | `recharts`, admin-only client components (see ADR-009) |
| AD-02 | Trend window                   | Rolling 30 days; activity chart shows one bucket per calendar day (UTC), zero-filled |
| AD-03 | Delta definition               | Each stat-card delta = (count in last 30 days) − (count in the prior 30 days, i.e. days 30–60 ago) |
| AD-04 | Chart metrics                  | Posts, votes, and comments created per day — three series on one chart |
| AD-05 | Status breakdown               | All posts grouped by `PostStatus`, rendered as a single horizontal stacked bar using the existing `StatusBadge` colors |
| AD-06 | Leaderboard sizes              | Top 5 posts (by `voteCount`), top 5 boards (by post count), 5 most recent signups |
| AD-07 | Top posts exclusions           | Exclude `PENDING` and `CLOSED` posts from the top-voted leaderboard |
| AD-08 | Needs-attention trigger        | Show the panel only when there is ≥1 `PENDING` post; CTA links to `/admin/posts?status=PENDING` |
| AD-09 | Data path                      | All data loaded server-side in the RSC page via repository functions; passed to widgets as props (no client fetch) |
| AD-10 | Data model                     | No schema change — every figure is derived by aggregation over existing models |
| AD-11 | Flag                           | ~~Gated behind `ADMIN_DASHBOARD_V2` in `lib/flags.ts`; when off, the legacy stat-card layout renders.~~ flag removed after ship (ADR-005); the legacy layout was deleted with it |
| AD-12 | Accessibility                  | The activity chart carries a visually-hidden data table; the SVG is `aria-hidden` (ADR-009 Decision 3) |
| AD-13 | Empty state                    | Zero-data workspace renders a zero-filled chart and "—" leaderboards without error |

---

## Glossary

| Term                 | Definition |
|----------------------|------------|
| **Activity**         | Posts, votes, and comments created within the window |
| **Delta**            | Signed difference between the current 30-day period and the prior 30-day period |
| **Needs attention**  | Items requiring an admin action; v1 = posts awaiting moderation (`PENDING`) |
| **Leaderboard**      | A ranked top-N list (top posts, top boards) |
| **Status breakdown** | The distribution of all posts across the `PostStatus` enum |

---

## Data Model

**No schema change.** All dashboard figures are derived via aggregation over the
existing `Post`, `Vote`, `Comment`, `User`, and `Board` models (their `createdAt`,
`status`, and `voteCount` fields). The activity time-series uses
`date_trunc('day', "createdAt")` grouping via a parameterized `$queryRaw` inside the
admin repository (ADR-003: Prisma only in repositories).

---

## Acceptance Criteria

1. When an admin opens `/admin`, the
   stat cards (Users, Boards, Posts, Votes, Comments) each show a 30-day delta with
   an up/down/flat indicator.
2. ~~Given the flag is off, `/admin` renders the legacy stat-card layout unchanged.~~ Retired: flag removed after ship (ADR-005).
3. The activity chart shows posts, votes, and comments per day for the last 30 days,
   with every day present (missing days rendered as zero).
4. The chart is accompanied by a visually-hidden table containing the same daily
   figures, and the SVG is `aria-hidden`.
5. A posts-by-status stacked bar reflects the count of all posts in each
   `PostStatus`, using the established status colors.
6. The top-posts leaderboard lists the 5 highest-`voteCount` posts, excluding
   `PENDING` and `CLOSED`, each linking to the post.
7. The top-boards leaderboard lists the 5 boards with the most posts.
8. The recent-signups list shows the 5 newest users.
9. Given ≥1 `PENDING` post, a needs-attention panel appears with a count and a CTA
   to `/admin/posts?status=PENDING`; given 0 pending posts, the panel is hidden.
10. Given an empty workspace, the page renders without error: a zero-filled chart
    and empty-state leaderboards.
11. All dashboard data is loaded in the Server Component and passed to widgets as
    props; no widget performs a client-side data fetch.
