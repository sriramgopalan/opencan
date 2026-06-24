# Spec: In-App Embeddable Widget (Gap 7)

**Status:** ACCEPTED  
**ADR:** ADR-008

---

## Decisions

| # | Topic | Resolution |
|---|-------|-----------|
| W-01 | Embed mechanism | iframe (see ADR-008 §1) |
| W-02 | JWT signing algorithm | HMAC HS256 with `WIDGET_JWT_SECRET` (see ADR-008 §2) |
| W-03 | Widget script invocation | `data-board` + optional `data-token` on the `<script>` tag |
| W-04 | Token expiry | 5 minutes (`exp - iat ≤ 300`); server rejects anything older |
| W-05 | Token-in-URL handling | `/api/embed-auth?token=<jwt>&next=/embed/[boardId]` validates → creates session → 302 to `next` without token |
| W-06 | User matching | Look up by email; create User if not found; `name` from JWT if provided |
| W-07 | No-secret mode | If `WIDGET_JWT_SECRET` is not set, `?token=` params are ignored; embed loads as guest |
| W-08 | Embed layout | New layout group `(embed)` — no main nav, no footer, no sidebar |
| W-09 | Framing CSP | Embed routes set `Content-Security-Policy: frame-ancestors <WIDGET_ALLOWED_ORIGINS>`; default: `'none'` |
| W-10 | X-Frame-Options | Omitted on embed routes (CSP `frame-ancestors` takes precedence in modern browsers) |
| W-11 | Feature flag | Gated behind `WIDGET` flag; `/public/widget.js` returns an empty no-op script when disabled |
| W-12 | Widget button position | Fixed, bottom-right; `z-index: 2147483647`; 56 × 56 px |
| W-13 | Widget button label | `aria-label="Open feedback"` / `aria-label="Close feedback"` toggled on state |
| W-14 | Panel dimensions | 420 px wide, min 500 px tall / max 90 vh; above the button |
| W-15 | Panel close | Close button inside iframe sends `postMessage({ type: "opencan:close" })` to parent; widget script collapses panel |
| W-16 | Replay attacks | Rely on 5-minute expiry. No `jti` one-time-use check in v1. |
| W-17 | Session precedence | If user already has a valid NextAuth session, JWT auto-login is skipped (existing session wins) |
| W-18 | `widget.js` location | `/public/widget.js` — plain JS, no framework dependency, served as a static file |
| W-19 | Invalid `next` param | If `next` is missing or not a relative `/embed/` path, `/api/embed-auth` returns HTTP 400 (not a redirect) — prevents open-redirect abuse even in the error path |
| W-20 | `widget.js` flag enforcement | When `WIDGET` is disabled, `/widget.js` still serves the full script (static file; no server-side gating possible), but the iframe `src` (`/embed/[boardSlug]`) returns 404, so the panel shows nothing. The spec intent in W-11 ("returns an empty no-op") is met at the embed-route level, not the script-file level. |

---

## Glossary

| Term | Meaning |
|------|---------|
| Widget | The `<script>` tag + JS that the host app embeds |
| Embed panel | The iframe-rendered OpenCan board shown inside the host app |
| Host app | The third-party web app that includes the widget |
| Auto-login | JWT-based pre-authentication of the host app's user |
| Embed session | Standard NextAuth session created by `/api/embed-auth` |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WIDGET_JWT_SECRET` | No | HS256 signing secret. If absent, token params are ignored. |
| `WIDGET_ALLOWED_ORIGINS` | No | Space-separated list of host origins allowed to frame embed pages (e.g. `https://app.acme.com`). If absent, defaults to `'none'` (embedding disabled). |

---

## Data Model

No new Prisma models. Users created via JWT auto-login are stored in the existing
`User` table, matched and upserted by `email`.

Schema change: none.

---

## New Routes

| Route | Type | Auth | Purpose |
|-------|------|------|---------|
| `/embed/[boardSlug]` | RSC page | optional | Renders board in embed layout |
| `/api/embed-auth` | API route (GET) | none | Validates JWT, creates session, redirects |
| `/widget.js` | static file | none | Embeddable script |

### `/embed/[boardSlug]`

- Uses `(embed)` layout group (no header, no footer).
- Reads the board by slug; returns 404 if not found or not public.
- Respects existing board visibility and post moderation settings.
- Renders the post list + "New post" button using existing components.
- When flag `WIDGET` is disabled, returns 404.

### `/api/embed-auth?token=<jwt>&next=<path>`

- `next` must be a relative path starting with `/embed/`; reject anything else.
- If `WIDGET_JWT_SECRET` is unset: 302 redirect to `next` without creating a session.
- If JWT is missing, malformed, expired, or signature invalid: 302 redirect to `next`
  (silent degradation to guest mode; do not expose error detail in the redirect URL).
- If JWT is valid:
  1. If caller already has a valid session (cookie present): 302 to `next`, skip upsert.
  2. Otherwise: upsert User by email (`email` required, `name` optional).
  3. Call NextAuth `signIn("credentials", ...)` server-side to issue a session cookie.
  4. 302 to `next`.

### `/public/widget.js`

Plain JavaScript (no bundler, no TypeScript). Behaviour:

```
1. Locate the script tag via document.currentScript.
2. Read data-board (required) and data-token (optional).
3. If WIDGET flag is disabled (detected via a response header on the embed URL):
   exit silently.
4. Inject a <button> into document.body (fixed, bottom-right).
5. On button click:
   a. If panel not yet created: create <iframe> with sandbox="allow-scripts
      allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
      set src to /embed/<boardId>[?token=<token>].
   b. Toggle panel visibility.
   c. Update aria-label and aria-expanded on button.
6. Listen for window message events; on { type: "opencan:close" }: collapse panel.
```

The iframe `src` is constructed from the `script.src` origin so the widget works
regardless of where OpenCan is hosted.

---

## Acceptance Criteria

**AC-1 — Script tag integration**  
Given a host page with `<script src="…/widget.js" data-board="<id>"></script>`,
when the page loads, a feedback button appears fixed at the bottom-right corner.

**AC-2 — Panel open/close**  
When the button is clicked, an iframe panel appears showing the board. Clicking again
(or clicking the close button inside the iframe) collapses the panel.

**AC-3 — Guest mode (no token)**  
When no `data-token` is set, the embed loads without authentication. The user can
submit posts/comments according to the board's `whoCanPost` setting.

**AC-4 — Auto-login (valid token)**  
When `data-token` contains a valid, non-expired, correctly-signed JWT, the embed
session is created for the matched/created User and the user appears signed in.

**AC-5 — Degradation on invalid token**  
When `data-token` contains an expired or invalid JWT, the embed loads as a guest
(no error message, no broken state).

**AC-6 — Token removed from URL after auth**  
After a successful JWT auth, the iframe URL does not contain the `token` parameter
(the redirect removed it).

**AC-7 — Frame-ancestors CSP**  
Embed pages include `Content-Security-Policy: frame-ancestors <WIDGET_ALLOWED_ORIGINS>`.
When `WIDGET_ALLOWED_ORIGINS` is unset, the value is `'none'`.

**AC-8 — Embedding blocked from unlisted origins**  
A browser loading the embed from an origin not in `WIDGET_ALLOWED_ORIGINS` is blocked
by the CSP (the iframe displays a framing error, not a security bypass).

**AC-9 — Accessibility**  
The widget button has a visible focus ring, `aria-label` that updates with state, and
`aria-expanded` on the panel toggle.

**AC-10 — Embed layout**  
The `/embed/[boardId]` page renders without the main navigation bar and footer.

**AC-11 — Feature flag**  
When `WIDGET` flag is off, `/widget.js` returns an empty no-op script and
`/embed/[boardId]` returns 404.

**AC-12 — No WIDGET_JWT_SECRET, no auto-login**  
When `WIDGET_JWT_SECRET` is unset, `data-token` values are accepted by the script
but the server ignores the token and loads the embed as a guest.

---

## Security Notes

- `next` param in `/api/embed-auth` is validated to start with `/embed/` to prevent
  open redirect.
- `name` and `email` from JWT are sanitised (strip HTML) before storing.
- JWT `exp` is enforced server-side; clocks are considered skewed by up to 60 seconds.
- The HS256 secret must be ≥ 32 bytes; validated at startup by `env.ts`.
- Tokens must not be logged in full; log only the JWT header (first `.`-segment).

---

## File Map

```
src/
  app/
    (embed)/
      layout.tsx                   — minimal embed layout (no nav/footer)
      embed/
        [boardId]/
          page.tsx                 — RSC: renders board in embed context
  app/
    api/
      embed-auth/
        route.ts                   — GET: JWT validation + session + redirect
  lib/
    widget-auth.ts                 — JWT validation logic (importable, testable)
  lib/
    env.ts                         — add WIDGET_JWT_SECRET, WIDGET_ALLOWED_ORIGINS
  lib/
    flags.ts                       — add WIDGET flag
public/
  widget.js                        — static embeddable script
```

Tests:
```
src/lib/widget-auth.test.ts        — JWT validation unit tests
src/app/api/embed-auth/route.test.ts — auth route integration tests
```
