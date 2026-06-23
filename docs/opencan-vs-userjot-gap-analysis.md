# OpenCan vs UserJot — Feature & UX Gap Analysis

_Generated 2026-06-22_

## How this was researched

UserJot's site blocks automated fetching, so the feature set was pulled via web search, third-party review sites (Capterra, SoftwareSuggest, worknotes.ai), their public pricing breakdown, and their own blog/comparison pages. Cross-referenced against the full OpenCan codebase — routes, schema, routers, email.ts — to get an accurate picture of what's actually built, not just what's in the README.

---

## What OpenCan actually has (baseline)

Before the gaps: OpenCan's foundation is solid. Multi-board feedback with a 6-step post lifecycle, per-board guest posting/voting controls, trigram-based similar-post detection on submission, sort by votes/newest/oldest/status, threaded comments (authenticated + guest), post pinning, a full admin panel (stats, user management, post moderation queue), four auth methods, session blocklisting, Redis rate-limiting, and a clean AGPL self-hosted deployment story.

---

## The Gaps

### 1. Public Roadmap — Critical missing feature

UserJot's roadmap is a first-class public page: posts auto-appear in their status column (Under Review / Planned / In Progress / Completed) the moment you change their status. It's the core "build in public" surface.

OpenCan has post statuses and they display correctly as badges on cards, but there is no `/roadmap` page. Someone visiting your feedback site has no way to see a consolidated view of what's coming. This is arguably the second most important page after the board itself — it's what turns a complaint box into a trust signal.

**Gap severity: Critical.** A read-only roadmap page is straightforward to build: group existing posts by status into columns or a filtered list. No new data model needed.

---

### 2. Changelog — Entirely absent

UserJot has a `/updates` (changelog) page with dated entries, media support (images, GIFs, video), and automatic notifications to users who voted on the shipped features. It's the closing of the feedback loop: "you asked for this, it shipped."

OpenCan has zero changelog infrastructure. No model, no route, no page. Users who submit feedback have no mechanism to learn that anything shipped. Email sends in `email.ts` cover welcome, verification, magic link, password changed, and account deleted — nothing about product updates.

**Gap severity: Critical.** This is a distinct data model (changelog entries, not posts) and a new page. Also requires the notification plumbing (see #3).

---

### 3. Email notifications to submitters — Entirely absent

UserJot sends emails in these situations:
- Post status changes (the submitter hears when their request moves to Planned, In Progress, Shipped)
- New comment replies
- Changelog published (voters on included features get notified)
- Weekly digest (top new ideas across boards)

OpenCan sends emails for: verification, magic link, password changed, account deleted. Nothing product-feedback-related. A user submits a post and never hears back unless they manually check the board.

**Gap severity: High.** This is the core "closing the loop" feature. Without it, the whole point of collecting feedback (showing users you listen) is broken. Implementation needs: a notification send on status change in the post router, and a notification preferences model so users can opt out.

---

### 4. In-app embeddable widget — Absent

UserJot offers a one-script embed that drops a floating button into your SaaS product. Users submit feedback, vote, and see the roadmap without leaving your app. It knows who the user is via JWT auto-login (see #5).

OpenCan has no widget. Users must navigate to a separate URL. For B2B SaaS — UserJot's target market — this is table stakes.

**Gap severity: High.** Non-trivial to build (separate bundle, iframe or shadow DOM, token passing) but a major acquisition surface. Most teams discovering they need feedback tooling want it embedded, not linked.

---

### 5. SSO / JWT auto-login — Absent

UserJot's Starter plan includes "automatic login" — a JWT-based mechanism where the host app signs a token and passes it to the widget/portal, so users don't create a separate account. Professional adds full SAML/SSO.

OpenCan has no equivalent. Users of the host app must separately register on the feedback board. This creates friction and means the feedback board's authenticated user list diverges from the host app's user list.

**Gap severity: Medium.** Without the widget (see #4), this matters less — but it becomes critical once the widget exists.

---

### 6. Integrations — Entirely absent

UserJot: Linear, Slack, Discord (notifications on new submissions, comments, status changes), Jira/Asana. Gated: 1 on Starter, unlimited on Professional.

OpenCan: zero integrations. No webhook system, no Linear sync, no Slack alerts. Admins find out about new posts by manually checking the dashboard.

**Gap severity: Medium.** For a v1 self-hosted tool, acceptable. But for anyone using it seriously, Slack notifications for new posts and Linear sync for planned work are expected. Webhooks (a generic outbound hook on post events) would cover the most ground with the least product-specific work.

---

### 7. Post search on boards — Missing on the user-facing side

OpenCan has `getSimilarPosts()` using pg_trgm (trigram similarity ≥ 0.4), but it's only invoked during post creation — as a "similar posts" hint to prevent duplicates. There is no search bar on the public board view itself.

UserJot's Professional plan includes "advanced semantic search." Their free/starter tier presumably has basic search.

Users on OpenCan boards cannot search for an existing request to upvote before creating a new one. This directly drives duplicate posts.

**Gap severity: Medium.** The trigram infrastructure already exists. Adding a search input to the board page and wiring it to a new `searchPosts` endpoint is bounded work.

---

### 8. Rich text and image attachments in posts — Plain text only

UserJot's changelog entries support screenshots, GIFs, and video. Post descriptions presumably support more than plain text.

OpenCan strips HTML from post titles and descriptions (`stripHtml` in the post router). MinIO is configured in the stack but not wired to any upload UI — there's no way to attach an image to a post or comment. Post descriptions are plain text only.

**Gap severity: Medium.** Markdown support would be a meaningful improvement. Images on posts are lower priority. Changelog entries (if built) would need rich media to be competitive.

---

### 9. Tagging / categorization — None

UserJot auto-tags posts by area. There is no tags model in OpenCan's schema. Posts have a status and a pinned flag — that's it.

Without tags, there's no way to filter "show me all posts about the API" or "show me all billing complaints." On a large board, status + vote sort isn't enough to navigate.

**Gap severity: Medium.** Schema addition (Tag model, PostTag join) plus filter UI. Unlocks meaningful admin workflows and better user navigation.

---

### 10. "My posts" / user profile page — None

UserJot (and Canny) let authenticated users see all their submitted posts and their statuses in one place. This is a key engagement surface: users come back to check if their request moved.

OpenCan has no `/profile` or `/my-posts` route. Once you submit a post, you can only find it by browsing the board.

**Gap severity: Low-medium.** A simple server component querying posts by `authorId` would cover this. High return on low effort.

---

### 11. Multiple admin role levels — Binary only

UserJot has 3 admin roles on Free, unlimited on Professional, suggesting a Viewer / Editor / Admin permission ladder.

OpenCan's `role` field is ADMIN or not. There's no concept of a moderator (can approve/reject posts but not manage users) or viewer (read-only dashboard access).

**Gap severity: Low.** Matters when you want to give customer success team members access to the moderation queue without full admin privileges.

---

### 12. Board listing UX — Functional but flat

There is no consolidated "all feedback" view across boards. Users must navigate into each board separately. No featured boards, no cross-board trending posts.

**Gap severity: Low.** The data is there; this is a presentation improvement.

---

## Summary table

| Area | UserJot | OpenCan | Gap severity |
|---|---|---|---|
| Public roadmap page | Yes, auto-syncs with statuses | No | **Critical** |
| Changelog | Yes, with media + notifications | None | **Critical** |
| Status-change email notifications | Yes | None | **High** |
| In-app embed widget | Yes | None | **High** |
| SSO / JWT auto-login | Yes (Starter+) | None | **Medium** |
| Integrations (Slack, Linear, etc.) | Yes (gated) | None | **Medium** |
| Post search on boards | Yes | Similar-post hint only | **Medium** |
| Rich text / image attachments | Yes (changelog at minimum) | Plain text only | **Medium** |
| Tags / categorization | AI auto-tags | None | **Medium** |
| "My posts" view | Yes | None | **Medium** |
| Multiple admin roles | Yes | Binary ADMIN/not | **Low** |
| Weekly digest email | Yes | None | **Low** |
| Anonymous/masked submissions | Yes (Professional) | None | **Low** |

---

## Where OpenCan already matches or exceeds

- **Auth depth**: Four methods (magic link, Google, GitHub, email/password) + email verification + session blocklisting is more robust than most competitors at this stage
- **Guest feedback controls**: Per-board allowGuestPost / allowGuestVote is already built and flexible
- **Privacy model**: Hashed IP for guest vote dedup (no IP stored in DB), GDPR-aware schema comments, sanitized HTML — better than Fider and on par with Canny
- **Post lifecycle statuses**: 6 statuses (Open → Under Review → Planned → In Progress → Shipped → Closed) matches or exceeds UserJot's 5
- **Duplicate detection**: The trigram similarity hint on submission is a good UX touch — UserJot's is AI-powered, but OpenCan already has the right infrastructure
- **Self-hosted story**: This is OpenCan's core differentiator. UserJot is SaaS-only; OpenCan owns the "your data, your infra" position entirely

---

## Recommended build order

| Priority | Feature | Effort | Rationale |
|---|---|---|---|
| 1 | Public roadmap page | Low | No new data; massive trust signal |
| 2 | Status-change email notification | Low | Email infra already exists; closes the feedback loop |
| 3 | "My posts" page | Low | Simple query; high retention signal |
| 4 | Post search on boards | Low-medium | pg_trgm index already exists; just needs UI |
| 5 | Changelog | Medium-high | New model + page + notifications; major differentiator |
| 6 | Webhooks | Medium | Generic outbound hook unblocks Slack/Linear without first-party integrations |
| 7 | In-app widget | High | Significant but unlocks the embedded-SaaS use case |

---

## Sources

- [UserJot Pricing 2026: Is Free Really Free?](https://www.worknotes.ai/blog/userjot-pricing)
- [UserJot Pricing, Features, and Details in 2026](https://www.softwaresuggest.com/userjot)
- [UserJot Software Pricing, Alternatives & More 2026 — Capterra](https://www.capterra.com/p/10029108/UserJot/)
- [The Canny Alternative — UserJot](https://userjot.com/compare/canny-alternative)
- [UserJot — Feedback, Roadmaps & Changelogs for SaaS](https://userjot.com/)
- [UserJot — Product Roadmap](https://userjot.com/product-roadmap)
- [UserJot — Changelog Software](https://userjot.com/product-changelog)
- [UserJot — In-app Feedback Widget](https://userjot.com/in-app-feedback-widget)
- [UserJot — Feature Request Software](https://userjot.com/feature-request-software)
