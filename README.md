![OpenCan](./docs/readme-banner.png)

# OpenCan

**Open-source customer feedback management. Collect feedback, prioritize features, close the loop.**



[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/sriramgopalan/opencan/actions/workflows/ci.yml/badge.svg)](https://github.com/sriramgopalan/opencan/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**[Live Demo →](https://demo.opencan.dev)**

---

## What is OpenCan?

OpenCan is a self-hosted feedback management platform — think Canny, but open-source and under your control. Teams use it to collect feature requests and bug reports from customers, vote on what matters most, and communicate status back to the people who asked. Because it's self-hosted, your customer data stays on your infrastructure, and you can extend or modify the product without waiting for a vendor.

## Features

- **Public feedback boards** — create multiple boards (e.g. Feature Requests, Bug Reports) and share them with customers
- **Voting** — members and guests can upvote posts; duplicate ideas surface naturally
- **Post status lifecycle** — move posts through Open → Under Review → Planned → In Progress → Shipped → Closed and keep customers informed
- **Comments** — threaded discussion on each post; HTML sanitized server-side
- **Guest access** — configurable per board: allow guests to post and/or vote without creating an account
- **Admin dashboard** — manage users, work through a moderation queue for pending posts, and view workspace analytics
- **Authentication** — magic link (passwordless), Google OAuth, GitHub OAuth, and email/password; email verification flow included
- **Session blocklist** — immediately revoke access for any user without waiting for their token to expire
- **Self-hosted via Docker Compose** — single command to bring up the full stack including Postgres, Redis, and MinIO

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| API | tRPC v11 |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Cache / session blocklist | Redis 7 |
| Object storage | MinIO (S3-compatible) |
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
- An SMTP provider or [Resend](https://resend.com) account (required for magic links and email verification)
- Google and/or GitHub OAuth app credentials (optional — only needed if you want those login methods)

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
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL, e.g. `https://feedback.example.com` |

#### Database

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/opencan` |

#### Redis

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | Yes | Redis connection string, e.g. `redis://localhost:6379` |

#### Security

| Variable | Required | Description |
|---|---|---|
| `IP_HASH_SECRET` | Yes | 32-byte hex string used to HMAC IP addresses for guest vote deduplication. Generate with: `openssl rand -hex 32` |

#### Auth

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | Yes | NextAuth signing secret. Generate with: `openssl rand -base64 32` |
| `AUTH_URL` | Yes | Full URL to your deployment, e.g. `https://feedback.example.com` |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth app client secret |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app client secret |

#### Email

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | API key from your [Resend](https://resend.com) account |
| `RESEND_FROM` | Yes | Sender address, e.g. `OpenCan <noreply@opencan.dev>` |

#### Object Storage (MinIO / S3-compatible)

| Variable | Required | Description |
|---|---|---|
| `MINIO_ENDPOINT` | Yes | MinIO host, e.g. `minio` (Docker) or `s3.example.com` |
| `MINIO_PORT` | Yes | MinIO port, e.g. `9000` |
| `MINIO_ACCESS_KEY` | Yes | MinIO access key / S3 access key ID |
| `MINIO_SECRET_KEY` | Yes | MinIO secret key / S3 secret access key |
| `MINIO_BUCKET_NAME` | Yes | Bucket to store uploads in |
| `MINIO_USE_SSL` | Yes | `true` in production, `false` for local MinIO |

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

# Coverage report
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
- **All PRs must pass CI** — the pipeline runs type checking, linting, unit tests, and E2E tests. PRs that break CI will not be merged.
- Keep commits focused; one logical change per commit makes review faster and history easier to bisect.

---

## License

[AGPL-3.0](LICENSE) — you are free to self-host, use, and modify OpenCan. If you distribute a modified version or offer it as a service, your changes must also be open-sourced under AGPL-3.0.

A commercial managed hosting licence (for teams that want hosted OpenCan without the AGPL obligations) is coming soon.

---

## Roadmap

| Version | Focus |
|---|---|
| **v1.1** | Soft delete, post edit history, comment voting |
| **v1.2** | Webhooks, Slack integration, Linear integration |
| **v1.3** | Public roadmap pages, public changelog |
