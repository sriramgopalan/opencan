# Spec: Email Notifications

**Application:** OpenCan — Customer Feedback
**Version:** 0.1
**Status:** ACCEPTED

---

## Decisions

| #     | Topic                          | Resolution |
|-------|--------------------------------|------------|
| NO-01 | Trigger: which transitions     | All status changes (any transition to a new status); simpler, most transparent |
| NO-02 | Opt-out granularity            | Global per user: single `notifyOnStatusChange Boolean @default(true)` on User |
| NO-03 | Guest posts                    | Skip silently — no `authorId` means no email address; no send |
| NO-04 | No-op transitions              | Skip — `setPostStatus` already skips when old status equals new status |
| NO-05 | Email delivery                 | Best-effort, fire-and-forget; never block the admin mutation on email failure |
| NO-06 | Post URL in email              | `{AUTH_URL}/boards/{boardSlug}/posts/{postNumber}` |
| NO-07 | Settings URL                   | `/settings` (protected route, visible to all authenticated users via nav) |
| NO-08 | Unsubscribe mechanism          | Link to `/settings` in every notification email; user toggles preference there |
| NO-09 | Preference default             | Opted-in by default (`true`); consistent with most feedback-tool expectations |
| NO-10 | Flag                           | Gated behind `STATUS_NOTIFICATIONS` in `lib/flags.ts`; removed after first stable release |

---

## Glossary

| Term                       | Definition |
|----------------------------|------------|
| **Status change**          | Any transition where the new status differs from the current status |
| **Notification preference** | The `notifyOnStatusChange` boolean on User; true = opted in |
| **Settings page**          | `/settings` — protected page where authenticated users manage preferences |

---

## Data Model

### Schema change — User

```prisma
model User {
  ...
  notifyOnStatusChange Boolean @default(true)
  ...
}
```

No new tables. No indexes needed (preference is only read/written per user by ID).

---

## Acceptance Criteria

| #     | Criterion |
|-------|-----------|
| AC-1  | When an admin changes a post's status, the authenticated author receives an email if `notifyOnStatusChange = true` |
| AC-2  | The email includes the post title, old status, new status, and a direct link to the post |
| AC-3  | The email includes a link to `/settings` to manage preferences |
| AC-4  | Guest posts (no `authorId`) are skipped silently — no error, no email |
| AC-5  | No-op status changes (same status set twice) do not send an email |
| AC-6  | A user with `notifyOnStatusChange = false` does not receive status-change emails |
| AC-7  | Email failure does not cause the `setStatus` mutation to fail or return an error |
| AC-8  | Authenticated users can toggle `notifyOnStatusChange` at `/settings` |
| AC-9  | The settings page reflects the current preference on load |
| AC-10 | The "Settings" link is visible in the global nav for authenticated users |
