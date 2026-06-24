![OpenCan](./docs/readme-banner.png)

# OpenCan

**Open-source customer feedback management. Collect feedback, prioritize features, close the loop.**



[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/sriramgopalan/opencan/actions/workflows/ci.yml/badge.svg)](https://github.com/sriramgopalan/opencan/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**[Live Demo →](https://demo.opencan.dev)**

---

## What is OpenCan?

OpenCan is a self-hosted feedback management platform — think Canny or UserJot, but open-source and under your control. Teams use it to collect feature requests and bug reports from customers, vote on what matters most, track progress on a public roadmap, publish a changelog, and close the loop with the people who asked. Because it's self-hosted, your customer data stays on your infrastructure, and you can extend or modify the product without waiting for a vendor.

## Features

### Feedback collection
- **Public feedback boards** — create multiple boards (e.g. Feature Requests, Bug Reports) and share them with customers
- **Voting** — members and guests can upvote posts; duplicate ideas surface naturally via trigram similarity hints on submission
- **Post status lifecycle** — six statuses: Open → Under Review → Planned → In Progress → Shipped → Closed
- **Post search** — full-text search within any board powered by the existing pg_trgm index
- **Threaded comments** — discussion on each post; HTML sanitised server-side; guest comments supported
- **Guest access** — configurable per board: allow guests to post and/or vote without creating an account
- **"My posts" page** — authenticated users see all their submitted posts and current statuses in one place

### Closing the loop
- **Public roadmap** — `/roadmap` groups posts by status into a live, public board; no separate data entry required
- **Changelog** — admin-authored dated entries at `/changelog`; each entry can link to shipped posts, triggering email notifications to everyone who voted on them
- **Status-change email notifications** — post authors are emailed whenever an admin moves their request to a new status; users can opt out per-notification type

### Integrations & embedding
- **Outbound webhooks** — register HTTP endpoints to receive signed payloads on `post.created`, `post.status_changed`, and `comment.created` events; HMAC-SHA256 signed with a per-webhook secret; covers Slack, Linear, Discord, and custom integrations
- **Embeddable widget** — a single `<script>` tag injects a floating feedback button into any host app; renders the board in an iframe panel; no separate page navigation required
- **JWT auto-login** — host apps can sign a short-lived HMAC HS256 token so users land in the widget already authenticated; no separate account needed

### Administration
- **Admin dashboard** — workspace analytics, user management (role assignment, suspension, deletion), post moderation queue for boards with pre-moderation enabled
- **Session blocklist** — immediately revoke access for any user without waiting for their token to expire

### Security & authentication
- **Four auth methods** — magic link (passwordless), Google OAuth, GitHub OAuth, and email/password with email verification
- **Privacy-first guest dedup** — guest vote deduplication uses HMAC-hashed IPs; raw IPs are never stored in the database
- **Rate limiting** — Redis-backed rate limiting on all mutation endpoints
- **Webhook SSRF protection** — private/loopback addresses blocked; HTTPS-only endpoints; redirect-following disabled

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| API | tRPC v11 |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Cache / rate limiting / session blocklist | Redis 7 |
| Object storage | MinIO (S3-compatible; provisioned, reserved for future file upload features) |
| Auth | NextAuth v5 |
| License | AGPL-3.0 |

---

## Demo

Try OpenCan without installing anything: **[demo.opencan.dev](https://demo.opencan.dev)**

> Guest browsing is enabled. Register an account to submit feedback and vote on posts.

## Quick Start (Self-hosted)

### Prerequisites

- Docker and Docker Compose
- A domain name (for production TLS)
- A [Resend](https://resend.com) account (required for magic links, email verification, and status-change notifications)
- Google and/or GitHub OAuth app credentials (required — the app will not start without both pairs)

### Setup

**1. Clone the repository**

```bash
git clone https://github.com/sriramgopalan/opencan.git
cd opencan
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

Then open `.env` and fill in the values. See [Environment Variables](#environment-variables) below for a full reference.

**3. Start the stack**

```bash
docker compose up -d
```

This starts the app, Postgres, Redis, and MinIO. On first boot the app container runs `prisma migrate deploy` automatically.

**4. Open the app**

Visit [http://localhost:3000](http://localhost:3000). Register your first account and follow the [First Admin User](#first-admin-user) steps below.

---

### Environment Variables

All variables come from `.env.example`. Copy it to `.env` and populate each one.

#### App

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |

#### Database

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/opencan` |

#### Redis

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | Yes | Redis connection string, e.g. `redis://localhost:6379` |

#### Auth

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | Yes | NextAuth signing secret. Generate with: `openssl rand -base64 32` |
| `AUTH_URL` | No | Full URL to your deployment in production, e.g. `https://feedback.example.com` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth app client secret |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret |

#### Email

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | API key from your [Resend](https://resend.com) account |
| `RESEND_FROM` | Yes | Sender address, e.g. `OpenCan <noreply@opencan.dev>` |

#### Security

| Variable | Required | Description |
|---|---|---|
| `IP_HASH_SECRET` | No | 32-byte hex string for HMAC IP hashing (guest vote dedup). Generate: `openssl rand -hex 32`. Defaults to an insecure placeholder — **set this in production**. |

#### Webhooks

| Variable | Required | Description |
|---|---|---|
| `WEBHOOK_MAX` | No | Maximum number of registered webhook endpoints per instance. Default: `10`. |

#### Embeddable Widget

| Variable | Required | Description |
|---|---|---|
| `WIDGET_JWT_SECRET` | No | HS256 signing secret for widget JWT auto-login. Must be ≥ 32 characters. If not set, the `data-token` attribute on the widget script tag is ignored and all embeds load as guest. |
| `WIDGET_ALLOWED_ORIGINS` | No | Space-separated list of origins allowed to frame embed pages, e.g. `https://app.acme.com https://staging.acme.com`. If not set, framing is blocked (`frame-ancestors 'none'`). |

---

### First Admin User

After the app starts, register an account at `/auth/register`. Then promote that account to admin.

**Via Prisma Studio:**

```bash
docker compose exec app npm run db:studio
```

Open the `User` table, find your record, and set `role` to `ADMIN`.

**Via SQL:**

```bash
docker compose exec postgres psql -U postgres -d opencan -c \
  "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'your@email.com';"
```

---

## Embeddable Widget

Drop one script tag into any web app to add a floating feedback button:

```html
<script
  src="https://your-opencan-instance.com/widget.js"
  data-board="your-board-slug"
></script>
```

**With JWT auto-login** (users land already authenticated):

```html
<script
  src="https://your-opencan-instance.com/widget.js"
  data-board="your-board-slug"
  data-token="<signed-jwt>"
></script>
```

The JWT is signed server-side by your app using `WIDGET_JWT_SECRET` (HMAC HS256). Required claims: `sub` (your user ID), `email`. Optional: `name`. Maximum expiry: 5 minutes.

The host app must add OpenCan to its `frame-src` Content-Security-Policy directive.

---

## Outbound Webhooks

Register webhook endpoints in the admin settings panel. OpenCan sends signed HTTP POST requests on these events:

| Event | Trigger |
|---|---|
| `post.created` | A new non-pending post is submitted |
| `post.status_changed` | An admin moves a post to a new status |
| `comment.created` | A comment is added to a non-pending post |

Payloads are signed with HMAC-SHA256 using a per-webhook secret shown once at creation. The signature is sent in the `X-OpenCan-Signature` header.

---

## Development Setup

**1. Clone and install dependencies**

```bash
git clone https://github.com/sriramgopalan/opencan.git
cd opencan
npm install
```

**2. Configure environment variables**

```bash
cp .env.example .env
# Fill in the values — DATABASE_URL and REDIS_URL can point to the Docker services below
```

**3. Start backing services**

```bash
docker compose up -d postgres redis minio
```

**4. Push the schema and start the dev server**

```bash
npm run dev:setup
```

`dev:setup` runs `prisma db push` then starts Next.js. On subsequent runs where the schema hasn't changed, `npm run dev` is sufficient.

The app is available at [http://localhost:3000](http://localhost:3000).

---

## Running Tests

```bash
# Run all unit/integration tests
npm test

# Watch mode (re-runs on file save)
npm run test:watch

# Coverage report (≥90% branch coverage required)
npm run test:coverage

# End-to-end tests (requires a running app)
npm run test:e2e
```

Type checking and linting:

```bash
npm run type-check
npm run lint
```

---

## Contributing

Contributions are welcome. A few guidelines:

- **Open an issue first** before starting work on a significant feature or refactor — it avoids duplicated effort and lets us align on approach.
- **Spec-first development** — significant features should be accompanied by or preceded by a spec in `/specs/`. See the existing specs for format and conventions.
- **All PRs must pass CI** — the pipeline runs type checking, linting, unit tests (≥90% coverage), E2E tests, security scanning, dependency audit, and Lighthouse. PRs that break CI will not be merged.
- Keep commits focused; one logical change per commit makes review faster and history easier to bisect.

---

## License

[AGPL-3.0](LICENSE) — you are free to self-host, use, and modify OpenCan. If you distribute a modified version or offer it as a service, your changes must also be open-sourced under AGPL-3.0.

A commercial managed hosting licence (for teams that want hosted OpenCan without the AGPL obligations) is coming soon.

---

## What's next

The core feature set is complete. Remaining work on the backlog:

| Item | Notes |
|---|---|
| Rich text in posts and comments | Markdown rendering pipeline already exists in the changelog; extend to posts and comments |
| Tags / categorization | New `Tag` + `PostTag` schema; filter UI on boards; improves navigation at scale |
| Weekly digest email | Notification plumbing from status-change emails makes this incremental work |
| Multiple admin role levels | Viewer / Editor / Admin ladder; useful once team size grows |
| Anonymous/masked submissions | Professional-tier feature; no demand signal yet |
