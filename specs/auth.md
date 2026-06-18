# Auth Spec

## Status
ACCEPTED

## Date
2026-06-13

## Stack
Next.js 16 App Router · NextAuth v5 · Prisma / PostgreSQL · Redis · tRPC · Resend

---

## Scope

This spec covers all authentication and session management for the Etash
application. In scope for v1:

- Email + password authentication
- Magic link (passwordless) authentication
- Google OAuth
- GitHub OAuth
- Session lifecycle (creation, renewal, invalidation)
- Email verification
- Password strength and change
- Rate limiting and account lockout
- Protected route enforcement
- Auth-related email delivery

Out of scope for v1 (documented in the v2 section):

- SAML / enterprise SSO
- TOTP / hardware key MFA
- "Remember me" toggle
- Admin-initiated session revocation UI

---

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| 1 | Auth library | NextAuth v5 |
| 2 | Session storage backend | JWT sessions. Changed from database sessions to JWT after discovering NextAuth v5's Credentials provider cannot create database sessions. The `Session` table remains in the schema for future use but is not populated by sign-in in v1. |
| 3 | Account conflict on OAuth (email already exists via different method) | Error with prompt: "An account with this email exists via [method]. Please sign in with that method." No auto-linking. |
| 4 | Password hashing algorithm | Argon2id |
| 5 | NextAuth session `maxAge` / JWT TTL | 15 minutes (access token; session cookie rolls on activity — see decision 8) |
| 6 | Magic link token reuse | Single-use — token deleted from DB on first use regardless of outcome |
| 7 | Email verification enforcement | Soft-required — user is logged in immediately; persistent banner prompts verification until confirmed |
| 8 | Session rolling window | 30 days rolling |
| 9 | Concurrent sessions | Unlimited concurrent sessions in v1 |
| 10 | Session cache | Redis (existing Docker Compose stack) |
| 11 | SAML integration tests | Skipped in v1 — SAML is a v2 feature |
| 12 | Session invalidation on account deletion | Immediate — all sessions hard-deleted in the same transaction as the account. *No-op in v1 — see note below table.* |
| 13 | Google OAuth scopes | `email` + `profile` only |
| 14 | GitHub OAuth scopes | `user:email` only |
| 15 | "Remember me" toggle | Not implemented in v1 — all sessions use the 30-day rolling window |
| 16 | Email provider | Resend |
| 17 | Plan gating data model | `plan` enum field on `Organization` model |
| 18 | Auth event logging | Log `ip` only — never log email address |
| 19 | Password change session behaviour | Invalidates all sessions including the current one; user must re-authenticate. *No-op in v1 — see note below table.* |
| 20 | Minimum password length | 12 characters |
| 21 | Password strength indicator | Client-side only via `zxcvbn` in v1; no server-side enforcement of strength score |
| 22 | Auth endpoint IP rate limit | 10 requests per IP per hour across all auth endpoints |
| 23 | Account lockout policy | 10 consecutive failures per email triggers 15-minute lockout |
| 24 | Cookie `SameSite` attribute | `Lax` |
| 25 | Magic link token expiry | 1 hour from issuance |
| 26 | OAuth profile data sync | First login only — name and avatar written once; never auto-updated on subsequent logins |
| 27 | GitHub primary email fetching | Covered by `user:email` scope (decision 14) |
| 28 | HTTPS enforcement | Documented as a deployment requirement for managed hosting; not enforced in self-hosted v1 |
| 29 | Magic link account creation | Auto-registration — magic link creates an account if none exists for that email |
| 30 | Magic link cross-browser warning | Yes — email includes: "This link will open in the browser where you click it" |
| 31 | Magic link confirmation flow | Confirmation page required — GET to magic link URL shows a page with a "Sign in" button; session created only on button click (POST) |
| 32 | Magic link send rate limit | 5 requests per email per 10 minutes |
| 33 | MFA / 2FA | Admin opt-in (v2 decision — not implemented in v1) |
| 34 | Protected route convention | Route group `src/app/(protected)/` — all routes inside require a valid session |
| 35 | Middleware session lookup | JWT decryption at the edge via `src/auth-edge.ts` (HKDF-derived key, matching NextAuth v5's internal key derivation) — no Redis cache and no PostgreSQL lookup occur on the request path. Originally specified as a 60-second Redis cache in front of PostgreSQL; superseded by the JWT-strategy change in decision 2. |
| 36 | Welcome email | Yes — sent on first successful login from any auth method |
| 37 | Auth email unsubscribe | All auth emails are purely transactional — exempt from marketing unsubscribe in v1 |

**Note on decisions 12 & 19 (added during implementation sync):** The
`auth.changePassword` and `auth.deleteAccount` procedures still call
`prisma.session.deleteMany` and `invalidateAllUserSessionCaches`, but
because sessions are JWT-based (decision 2) and never written to the
`Session` table or Redis at sign-in, these calls have no effect on the
caller's actual active JWT — it remains valid until the cookie's own
expiry. Real, immediate revocation is deferred to a JTI-blocklist
implementation; see `specs/role-invalidation.md` (intentionally deferred).

---

## Architecture

```
Client
  │
  ├─ Next.js Middleware (edge) — src/middleware.ts
  │     └─ src/auth-edge.ts decrypts the session JWT directly (no Redis, no
  │        DB round-trip) → redirect to /auth/signin if missing or invalid
  │
  ├─ NextAuth v5 route handler  (/api/auth/[...nextauth])
  │     ├─ CredentialsProvider (email + password)
  │     ├─ GoogleProvider
  │     └─ GitHubProvider
  │     (EmailProvider is not registered — see "Magic Link" known-bug note)
  │
  ├─ tRPC procedures (/server/routers/auth.ts)
  │     ├─ auth.changePassword
  │     ├─ auth.requestMagicLink
  │     ├─ auth.deleteAccount
  │     └─ auth.resendVerification
  │
  └─ /server/repositories/
        ├─ session.ts             — Redis session-cache helpers (defined, unused in the request path)
        ├─ user.ts                — user lookup, creation, deletion
        └─ verificationToken.ts   — shared magic-link / email-verification token lifecycle
```

Session reads in middleware decrypt the JWT directly — no Redis or PostgreSQL
round-trip occurs on the request path. `src/auth-edge.ts` derives the same
encryption key NextAuth v5 uses internally (HKDF-SHA256 over `AUTH_SECRET`,
salted with the cookie name) and calls `jwtDecrypt` (via `jose`) to recover
the session payload at the edge. The Redis-backed `cacheSession` /
`getCachedSession` / `invalidateSessionCache` helpers in
`src/server/repositories/session.ts` exist but are not called anywhere in
the live request path as of this writing.

**Note:** `src/middleware.ts` also calls `isBlocklisted(userId)` via
`src/lib/session-blocklist.ts` after JWT decryption — this is an O(1) Redis
`EXISTS` call added by the admin feature to immediately invalidate sessions on
role change, suspension, or account deletion. See admin.md §6 for the full
blocklist design. Additionally, every `protectedProcedure` in the tRPC layer
runs `blocklistMiddleware` as a second enforcement point.

---

## Prisma Models

The following models are required. Fields marked `// PII` must be anonymised on
account deletion (see user deletion spec in ADR-003 and privacy.md).

```prisma
enum Plan {
  FREE
  PRO
  ENTERPRISE
}

model User {
  id               String    @id @default(cuid())
  email            String    @unique        // PII: primary identifier
  emailVerified    DateTime?
  name             String?                  // PII: display name, synced from OAuth on first login only
  image            String?                  // PII: avatar URL, synced from OAuth on first login only
  passwordHash     String?                  // null for OAuth-only accounts
  role             Role      @default(MEMBER)  // enum: MEMBER | ADMIN (see admin.md)
  failedLoginCount Int       @default(0)
  lockedUntil      DateTime?
  suspendedAt      DateTime? // PII: set by admin on suspension; null = active (see admin.md)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  accounts    Account[]
  sessions    Session[]
  memberships OrganizationMember[]
  boards      Board[]
  posts       Post[]
  votes       Vote[]
  comments    Comment[]

  @@index([email])
  @@index([lockedUntil])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String                  // "google" | "github" | "credentials"
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expires])
}

model VerificationToken {
  identifier String                        // email address; PII, used only for lookup
  token      String   @unique              // hashed before storage
  expires    DateTime
  type       String   @default("MAGIC_LINK")  // "MAGIC_LINK" | "EMAIL_VERIFICATION"
  createdAt  DateTime @default(now())

  @@unique([identifier, token])
  @@index([type])
}

model Organization {
  id        String   @id @default(cuid())
  name      String
  plan      Plan     @default(FREE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members   OrganizationMember[]
}

model OrganizationMember {
  id             String       @id @default(cuid())
  userId         String
  organizationId String
  role           String       // "OWNER" | "ADMIN" | "MEMBER"
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@index([organizationId])
}
```

---

## Authentication Methods

### Email + Password

**Registration:**
1. Client submits `{ email, password }`.
2. Server validates with Zod: email format, password minimum 12 characters.
3. Check for existing account with that email — if found, return
   `CONFLICT` with the message: "An account with this email already exists."
4. Hash password with Argon2id.
5. Create `User` and `Account` records in a single transaction.
6. Send verification email via Resend.
7. Create session and return to client.
8. Send welcome email (first login trigger).

**Sign-in:**
1. Client submits `{ email, password }`.
2. Look up user by email. If not found, return generic error:
   "Invalid email or password." (Do not reveal whether the email exists.)
3. Check `lockedUntil` — if in the future, return:
   "Account locked. Try again after [time]."
4. Verify password with Argon2id.
5. On failure: increment `failedLoginCount`. If count reaches 10, set
   `lockedUntil = now + 15 minutes`. Return generic error.
6. On success: reset `failedLoginCount` to 0, clear `lockedUntil`,
   create session.

**Password requirements:**
- Minimum 12 characters. No maximum enforced server-side (bcrypt/Argon2id
  handles long inputs safely).
- No character class requirements (length and zxcvbn score are better signals
  than arbitrary complexity rules).
- Client-side `zxcvbn` score displayed as a strength meter. Score is advisory
  only in v1 — a weak score does not block submission.

**Password change:**
1. Requires authenticated session.
2. Client submits `{ currentPassword, newPassword }` via `auth.changePassword`.
3. Verify `currentPassword` against stored hash.
4. Hash `newPassword` with Argon2id.
5. Update `passwordHash`.
6. Delete all `Session` records for this user (including the current session)
   in the same transaction.
7. Invalidate all Redis session cache entries for this user.
8. Return success.
   **Implementation note (v1):** Steps 6–7 have no effect on the caller's
   already-issued JWT (see decisions 12 & 19 note) — the client does **not**
   receive a 401 on the next call and is **not** redirected to sign-in. The
   JWT remains valid until its own expiry.
9. Send password-changed notification email.

---

### Magic Link

> **Known bug (auth bug #1):** Magic link login UI exists, but `EmailProvider`
> is not registered in `src/auth.ts`'s `providers` array (only Credentials,
> Google, and GitHub are configured). The `/auth/magic-link` confirmation
> page's "Sign in" button links to `/api/auth/callback/email`, which does
> not exist without a registered Email provider. There is also no
> `/auth/magic-link/confirm` route anywhere in the codebase. The flow
> described below is the target design — it is not currently functional.

**Request flow:**
1. Client submits `{ email }` via `auth.requestMagicLink`.
2. Apply rate limits (checked in this order):
   - 10 requests per IP per hour — if exceeded: `RATE_LIMITED`.
   - 5 requests per email per 10 minutes — if exceeded: `RATE_LIMITED`.
3. If no account exists for this email: create a new `User` record
   (auto-registration). Mark `emailVerified = null` — verification is
   completed by the magic link click.
4. Generate a cryptographically random 32-byte token. Store its SHA-256 hash
   in `VerificationToken` (`type = "MAGIC_LINK"`) with `expires = now + 1 hour`.
5. Send email via Resend containing:
   - The magic link URL with the raw (unhashed) token as a query parameter.
   - The line: "This link will open in the browser where you click it."
6. Return success regardless of whether the email exists (prevents email
   enumeration).

**Verification flow:**
1. User clicks link: `GET /auth/magic-link?token=<raw_token>`
2. Server hashes the raw token. Looks up `VerificationToken` by hash.
3. If not found or expired: render error page — "This link has expired or
   has already been used. Request a new one."
4. If valid: render confirmation page — "Click the button below to sign in
   to Etash." with a "Sign in" button. **Do not create a session here.**
5. User clicks "Sign in": `POST /auth/magic-link/confirm` with the token
   (submitted from the confirmation page form).
6. Server re-validates the token (same hash lookup).
7. Delete the `VerificationToken` record immediately on lookup (single-use
   enforcement — deletion happens regardless of whether the token was valid
   or expired; there is no `usedAt` field).
8. If first login: send welcome email.
9. Create session. Redirect to dashboard.

**Why the confirmation page is required:**
Email prefetch bots and security scanners follow links in emails. A GET that
creates a session would sign in the bot, not the user. The POST-on-click
pattern ensures only the human who clicks the button gets a session.

---

### Google OAuth

**Scopes:** `email`, `profile`

**Flow:**
1. NextAuth handles the OAuth redirect and callback.
2. On callback, check if an account with this email exists under a different
   provider.
   - If yes: do not link. Return error page:
     "An account with this email exists via [existing provider]. Please sign
     in with that method."
3. On first login: create `User` with `name` and `image` from the Google
   profile. Set `emailVerified = now` (Google has verified the email).
4. On subsequent logins: do not update `name` or `image` from the Google
   profile. User's own edits are preserved.
5. If first login: send welcome email.
6. Create session.

---

### GitHub OAuth

**Scopes:** `user:email`

GitHub does not always return the primary email in the profile response.
Use the `user:email` scope to call the GitHub emails API
(`GET /user/emails`) and select the primary, verified email.

**Flow:**
1. NextAuth handles the OAuth redirect and callback.
2. Fetch primary verified email from GitHub emails API.
3. Check for account conflict (same as Google flow above).
4. On first login: create `User` with `name` and `image` from the GitHub
   profile. `emailVerified = now` if the GitHub email is verified.
5. On subsequent logins: do not update `name`, `image`, or `email`.
6. If first login: send welcome email.
7. Create session.

---

## Session Management

**Library:** NextAuth v5. No `adapter` is wired into the live config (see
decision 2) — the Prisma `Session` model exists in the schema but is not
populated by sign-in in v1.

**Session model:** JWT sessions. The session cookie's value is an encrypted
JWT (JWE), not an opaque lookup key. `src/middleware.ts` and
`src/auth-edge.ts` validate it by decrypting it directly — there is no
PostgreSQL or Redis round-trip on the request path.

**Cookie:**
- Name: `authjs.session-token` in development, `__Secure-authjs.session-token`
  in production. `src/auth-edge.ts` branches on `NODE_ENV` to pick the
  matching cookie name (and salt for key derivation).
- `HttpOnly: true`
- `Secure: true` in production (decision 28)
- `SameSite: Lax`
- Expiry: 30-day JWT `maxAge`, with `updateAge: 15 minutes` — the JWT is
  re-issued (refreshing its expiry) after 15 minutes of activity.

**Session lifetime:**
- Rolling, governed entirely by the JWT's own `maxAge`/`updateAge` — there is
  no server-side record to re-validate against.
- No "Remember me" toggle — all sessions behave identically in v1.

**Concurrent sessions:** Unlimited in v1. A user may be signed in on multiple
devices simultaneously (each device holds its own independent JWT).

**Redis session cache:** `src/server/repositories/session.ts` defines
`cacheSession` / `getCachedSession` / `invalidateSessionCache` /
`invalidateAllUserSessionCaches`, implementing the architecture decisions 10
and 35 originally called for. As of this writing, none of these are called
from the live request path — they are unused outside of their own tests.
`auth.changePassword` and `auth.deleteAccount` still call
`invalidateAllUserSessionCaches`, but since no JWT lookup ever consults
Redis, the call has no effect on already-issued sessions (see the note
under decisions 12 & 19, above).

**Sign-out:** NextAuth's standard JWT sign-out — clears the session cookie
client-side. There is no server-side record to delete.

**Account deletion:**
- Inside a single `$transaction`: tombstones all comments (`authorId → null`,
  `body → "[deleted]"`), deletes all `Vote` rows, `Session` rows, `Account`
  rows, `VerificationToken` rows, and `OrganizationMember` rows for the user.
  Then anonymises the `User` row (email obfuscated, PII nulled — row is NOT
  hard-deleted, preserving foreign-key integrity for boards and posts).
- `invalidateAllUserSessionCaches` is also called, but since no JWT lookup
  ever consults Redis, the call has no effect on the user's already-issued JWT
  (see decisions 12 & 19 note). The JWT remains valid until it expires.
- Real, immediate revocation is handled by the admin blocklist — see
  `specs/role-invalidation.md` and admin.md §6 (intentionally out of scope
  for user-initiated deletion).

---

## Email Verification

> **Known bug (auth bug #2):** `verify-email/page.tsx` POSTs to
> `/api/auth/verify-email`, but no route handler exists at that path
> anywhere under `src/app/api/`. The verification flow described below has
> no working server endpoint to call in the current implementation.

**Policy:** Soft-required. Users are not blocked from the application after
registration, but a persistent banner is shown until the email is verified.
The banner is dismissed only when `user.emailVerified` is set.

**Banner copy:** "Please verify your email address. [Resend verification email]"

**Verification email:**
- Sent on: new account creation via email/password or magic link.
- Not sent for OAuth accounts — provider has already verified the email.
- Contains a single-use token with 24-hour expiry (separate from magic link
  tokens — uses the same `VerificationToken` table with a `type`
  discriminator: `EMAIL_VERIFICATION` vs `MAGIC_LINK`).

**Re-send:** User may request a new verification email from the banner. Rate
limit: 5 requests per email per 10 minutes (shared with magic link limit).

**On verification click:**
- Same GET → confirmation page → POST pattern as magic link (decision 31).
- On successful POST: set `user.emailVerified = now`. Dismiss banner.

---

## Protected Routes

**Convention:** All routes under `src/app/(protected)/` require a valid session.

**Enforcement — Next.js Middleware (`middleware.ts`):**
1. Read the session token from the cookie (see "Session Management" for the
   `NODE_ENV`-based cookie-name branching).
2. Pass the raw token to `getSessionFromJWT` (`src/auth-edge.ts`), which
   derives the NextAuth v5 encryption key via HKDF and calls `jwtDecrypt` to
   decrypt and validate the payload in-process, at the edge.
3. Missing, undecryptable, or expired token: redirect to
   `/auth/signin?callbackUrl=<current-url>`.
4. No Redis lookup and no PostgreSQL round-trip occur in this path.

**No per-page auth check.** Pages inside `(protected)/` do not call
`getServerSession` to re-check auth — middleware is the single enforcement
point. `ctx.session` in tRPC context is populated by the NextAuth context
factory and is guaranteed non-null for `protectedProcedure` calls.

**Public routes (explicitly allowed without session):**
- `/` — marketing home
- `/auth/signin`
- `/auth/register`
- `/auth/magic-link` (GET — token validation and confirmation page)
- `/auth/error`
- `/api/auth/[...nextauth]` (NextAuth internals)

---

## Rate Limiting

All rate limits use Redis. Keys are prefixed `rl:` and expire automatically.

| Limit | Scope | Window | Max |
|-------|-------|--------|-----|
| All auth endpoints | Per IP | 1 hour | 10 requests |
| Magic link send | Per email | 10 minutes | 5 requests |
| Account lockout | Per email | Rolling | 10 consecutive failures → 15 min lockout |

**Implementation:** `/lib/rate-limit.ts` (see security.md). Auth endpoints call
`rateLimit(ctx.ip, 'auth:ip', { max: 10, window: '1h' })` before any business
logic.

**Lockout behaviour:**
- Failed logins increment `user.failedLoginCount` in the database.
- On reaching 10: `lockedUntil = now + 15 minutes`.
- On successful login: `failedLoginCount = 0`, `lockedUntil = null`.
- Lockout is per email, not per IP — prevents an attacker from locking an
  account from a rotating IP pool and also prevents IP-based bypass.
- Lockout message: "Too many failed attempts. Account locked until [time]."
  (Reveals lockout time — this is intentional UX; obscuring it does not
  improve security.)

---

## Logging

Auth events are logged via Pino (see ADR-006). The following fields are logged
for each event:

| Event | Fields logged |
|-------|--------------|
| Sign-in success | `ip`, `userId`, `provider` |
| Sign-in failure | `ip`, `provider` (no `userId` — avoid confirming email existence) |
| Account locked | `ip` |
| Magic link requested | `ip` (not `email`) |
| Magic link consumed | `ip`, `userId` |
| Password changed | `ip`, `userId` |
| Session invalidated | `userId`, `reason` |
| Account deleted | `userId` |

**Never log:** `email`, `name`, `passwordHash`, `token`, `sessionToken`.

---

## Email Delivery

**Provider:** Resend.

**Transactional emails in scope:**
| Email | Trigger |
|-------|---------|
| Welcome | First successful login from any auth method |
| Email verification | New account via password or magic link |
| Magic link | `auth.requestMagicLink` called |
| Password changed | Successful `auth.changePassword` |
| Account deletion confirmation | Successful account deletion |

**Unsubscribe:** All auth emails are purely transactional. No unsubscribe
link is required or included in v1. They are exempt from marketing
preference settings.

**Sender address:** Configured via `RESEND_FROM` environment variable.
Validated at startup (see ADR-006 env validation pattern).

---

## Registration Endpoint

Registration is implemented as a plain Next.js Route Handler, not a tRPC
procedure, so it is not listed under "tRPC API" below.

**Route:** `POST /api/auth/register`  
**File:** `src/app/api/auth/register/route.ts`

```ts
input:  { email: string; password: string }
output: { userId: string }   // HTTP 201
access: public (no session required)
```

Creates the `User` record, hashes the password with Argon2id, and calls
`issueEmailVerification` (creates a `VerificationToken` of type
`EMAIL_VERIFICATION` with a 24-hour expiry, sends the verification email via
Resend). It does **not** create a session and does **not** send a welcome
email — welcome email is deferred until the email is verified, which
credentials-registered users currently have no working path to reach (see
the Email Verification known-bug note).

To prevent email-enumeration timing attacks, the handler hashes the
submitted password even when the email already exists, before returning the
`CONFLICT` response, so response time does not reveal whether the account
exists.

---

## tRPC API

All procedures below live in `/server/routers/auth.ts`.

### `auth.requestMagicLink`
```ts
input:  { email: string }
output: { sent: true }  // always — prevents email enumeration
access: publicProcedure
```
Applies rate limits, auto-registers if needed, sends magic link email.

### `auth.changePassword`
```ts
input:  { currentPassword: string; newPassword: string }
output: { success: true }
access: protectedProcedure
```
Verifies current password, updates hash, invalidates all sessions.

### `auth.deleteAccount`
```ts
input:  { confirmation: "delete my account" }
output: { success: true }
access: protectedProcedure
```
Anonymises PII. In a single transaction: tombstones comment bodies, deletes
Vote rows, Session rows, Account rows, VerificationToken rows, and
OrganizationMember rows. Then anonymises the User row (does not hard-delete it).
The `confirmation` field must equal the exact string `"delete my account"` —
prevents accidental deletion via client bugs.

### `auth.resendVerification`
```ts
input:  {}
output: { sent: true }
access: protectedProcedure
```
Rate-limited (5 per email per 10 minutes). Sends a new verification email.

---

## NextAuth Configuration

```ts
// src/auth.ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30, updateAge: 60 * 15 },
  // 30-day rolling JWT; re-issued after 15 minutes of activity.
  // No `adapter` is configured, so the Prisma `Session` table is not
  // populated by sign-in — see decision 2.
  providers: [
    Credentials({ /* email + password */ }),
    Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
             authorization: { params: { scope: 'email profile' } } }),
    GitHub({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET,
             authorization: { params: { scope: 'user:email' } } }),
    // EmailProvider is NOT registered — see "Magic Link" known-bug note.
  ],
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      // Account conflict detection (decision 3)
      // First-login-only profile sync (decision 26)
    },
    session: async ({ session, user }) => {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    signIn: async ({ user, isNewUser }) => {
      if (isNewUser) { /* send welcome email */ }
    },
  },
});
```

---

## Acceptance Criteria

### Registration — email + password
- [ ] Account created with Argon2id-hashed password
- [ ] Verification email sent via Resend
- [ ] Welcome email sent
- [ ] Session created and cookie set with `SameSite=Lax`
- [ ] Attempting to register with an existing email returns a `CONFLICT` error
- [ ] Password shorter than 12 characters rejected with `VALIDATION_ERROR`

### Sign-in — email + password
- [ ] Successful sign-in creates a session and redirects to the callback URL
- [ ] Wrong password returns generic "Invalid email or password" — does not reveal whether the email exists
- [ ] 10th consecutive failure sets `lockedUntil = now + 15 min` and returns lockout message
- [ ] Successful sign-in after previous failures resets `failedLoginCount` to 0
- [ ] Locked account cannot sign in even with the correct password until `lockedUntil` passes
- [ ] `failedLoginCount` increments on each failure, not only on the 10th

### Magic link
- [ ] Magic link email sent for both existing and new accounts
- [ ] New account created on first magic link request (auto-registration)
- [ ] Email contains the cross-browser warning line
- [ ] GET to magic link URL shows confirmation page, not a session
- [ ] POST to confirm URL creates session and marks token as used
- [ ] Token cannot be used a second time — returns expired/used error page
- [ ] Token expired after 1 hour — returns expired error page
- [ ] 6th request within 10 minutes for the same email returns `RATE_LIMITED`
- [ ] 11th request within 1 hour from the same IP returns `RATE_LIMITED`

### OAuth — Google
- [ ] New user created with `name`, `image`, `emailVerified = now` on first login
- [ ] `name` and `image` not updated on subsequent logins
- [ ] Conflict with existing email/password account shows provider mismatch error
- [ ] Conflict with existing GitHub account for same email shows provider mismatch error
- [ ] Only `email` and `profile` scopes requested

### OAuth — GitHub
- [ ] Primary verified email fetched from GitHub emails API
- [ ] Account created with `user:email` scope only
- [ ] Conflict handling identical to Google

### Session
- [ ] Session cookie is `HttpOnly`, `SameSite=Lax`
- [ ] Session expiry extended on each authenticated request (rolling 30 days)
- [ ] Redis cache key set on session creation, deleted on sign-out
- [ ] Middleware allows request on Redis cache hit
- [ ] Middleware re-validates against PostgreSQL on Redis cache miss
- [ ] Unauthenticated request to a `(protected)/` route redirects to `/auth/signin?callbackUrl=...`
- [ ] Password change deletes all sessions for the user including the current one
- [ ] Account deletion deletes all sessions within the same transaction

### Email verification
- [ ] Unverified user sees persistent banner after sign-in
- [ ] Banner dismissed after email verified
- [ ] Clicking verification link shows confirmation page (not auto-verifying on GET)
- [ ] POST on confirmation page sets `emailVerified = now`
- [ ] Verification token single-use and 24-hour expiry
- [ ] OAuth accounts have `emailVerified` set at account creation — no banner shown

### Password change
- [ ] Wrong `currentPassword` returns `VALIDATION_ERROR`
- [ ] New password shorter than 12 characters returns `VALIDATION_ERROR`
- [ ] On success: all sessions invalidated, password-changed email sent
- [ ] User is redirected to sign-in after next request

### Account deletion
- [ ] `confirmation` field must equal `"delete my account"` exactly
- [ ] All PII anonymised per privacy.md anonymisation format
- [ ] All sessions hard-deleted in the same transaction
- [ ] Redis keys deleted synchronously before transaction commits

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Magic link clicked in a different browser than where it was requested | Session created in the clicking browser — warning email line explains this |
| Magic link clicked twice | Second click returns the expired/used error page |
| User registers with email, then tries OAuth with same email | Provider mismatch error — no auto-linking |
| User has both Google and GitHub accounts for same email | Not possible — conflict error prevents second OAuth account |
| Account deleted while session is active | **Implementation note (v1):** No effect — the JWT is never looked up against Redis or PostgreSQL, so the already-issued session remains valid until it expires on its own (see decisions 12 & 19 note). |
| Password changed while signed in on another device | **Implementation note (v1):** No effect — same JWT limitation as above; the other device's session is not actually invalidated in v1. |
| Magic link requested for deleted/anonymised account | Auto-registration creates a new account (anonymised email is unrecognisable) |
| IP rate limit hit on shared network (NAT, university) | Limit is 10/hour per IP — high enough to be non-disruptive for legitimate use; no bypass mechanism in v1 |
| `lockedUntil` in the past | Lock is expired — treat as unlocked; do not reset `failedLoginCount` until next successful login |
| GitHub returns no verified email | Sign-in fails with: "Your GitHub account has no verified email. Please verify an email on GitHub and try again." |
| Welcome email delivery fails | Log the failure; do not block the session. Welcome email is best-effort. |
| Verification email delivery fails | Log the failure; return success to the client. User can request a re-send from the banner. |

---

## Environment Variables

```bash
# NextAuth (NextAuth v5 renamed these from NEXTAUTH_* to AUTH_*)
AUTH_URL=
AUTH_SECRET=

# OAuth providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Email
RESEND_API_KEY=
RESEND_FROM=

# Redis (rate limiting; also backs the unused session-cache helpers — see
# "Session Management")
REDIS_URL=

# Database
DATABASE_URL=
```

All variables validated at startup via Zod in `src/lib/env.ts`. Missing
required variables throw at boot time, not at runtime.

---

## Deployment Requirements

- **HTTPS is required in production** (decision 28). The `Secure` cookie flag
  means session cookies are not sent over plain HTTP. Self-hosted deployments
  that run over HTTP will lose the session cookie silently. This is documented
  as a deployment requirement and is not enforced by the application in v1.
- **Redis is not required for session validation.** Middleware decrypts the
  session JWT directly (decision 35) — there is no Redis or PostgreSQL
  round-trip on the request path. Redis remains required for rate limiting
  (see "Rate Limiting") and for the unused session-cache helpers in
  `src/server/repositories/session.ts`.

---

## Out of Scope — v2

| Feature | Notes |
|---------|-------|
| SAML / enterprise SSO | Integration tests skipped in v1; stub route returns 501 |
| TOTP / hardware key MFA | Admin opt-in when implemented; not in v1 |
| "Remember me" toggle | All sessions are 30-day rolling in v1 |
| Admin session revocation UI | Sessions can be revoked by deleting DB rows directly |
| Per-user concurrent session limits | Unlimited in v1 |
| Password breach check (HaveIBeenPwned API) | Advisory, not blocking |
| Passkeys (WebAuthn) | Requires NextAuth v5 WebAuthn adapter |
