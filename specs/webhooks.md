# Spec: Outbound Webhooks

Status: ACCEPTED

## Decisions table

| # | Topic | Resolution |
|---|-------|------------|
| W-01 | Event types in v1 | `post.created`, `post.status_changed`, `comment.created` |
| W-02 | Payload envelope | `{ event, occurredAt: ISO-8601, data: { ... } }` |
| W-03 | Signing | HMAC-SHA256 of the raw JSON body with the per-webhook secret; sent as `X-OpenCan-Signature: sha256=<hex>` |
| W-04 | Delivery model | Synchronous best-effort: 5 s timeout, 1 retry on timeout/network error; fire-and-forget from the router (non-blocking) |
| W-05 | Failure handling | Log failure with `logger.warn`; do NOT block the originating mutation |
| W-06 | Secret lifecycle | Generated server-side (32 random hex bytes); returned **once** at creation; stored plaintext (needed for signing); subsequent `list` returns last 4 chars only |
| W-07 | Max webhooks | 10 per instance; configurable via `WEBHOOK_MAX` env var |
| W-08 | Admin management | `adminProcedure` procedures: `create`, `list`, `delete`, `test`; read-only page at `/admin/settings/webhooks` |
| W-09 | Event filtering | Each webhook stores an array of subscribed event types; deliver only if the event matches |
| W-10 | Feature flag | Behind `WEBHOOKS` flag (ADR-005); dispatch is no-op when disabled |
| W-11 | Privacy | Webhook URL may contain auth tokens — log only the domain, never the full URL |

## Glossary

- **Webhook** — a registered HTTP endpoint that receives signed POST payloads on events
- **Secret** — a 32-byte random hex string used to compute the HMAC signature
- **Event** — one of `post.created | post.status_changed | comment.created`
- **Dispatch** — the act of signing and delivering a payload to all active webhooks subscribed to an event

## Data Model

```prisma
model Webhook {
  id        String   @id @default(cuid())
  url       String   @db.VarChar(500)  // PII: may contain auth tokens; never logged in full
  secret    String                      // PII: HMAC signing key; returned only at creation
  events    String[]                    // subset of ["post.created","post.status_changed","comment.created"]
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@index([isActive])
}
```

## Acceptance Criteria

1. Given an admin creates a webhook with a URL and event list, the response includes the full secret (shown once only).
2. Given an admin lists webhooks, the response includes `secretPreview` (last 4 chars) but not the full secret.
3. Given an admin deletes a webhook, subsequent events are not delivered to it.
4. Given a post is created and a webhook subscribes to `post.created`, a signed POST is delivered within the request lifecycle.
5. Given an admin changes a post status and a webhook subscribes to `post.status_changed`, a signed POST is delivered.
6. Given a comment is created and a webhook subscribes to `comment.created`, a signed POST is delivered.
7. Given the `WEBHOOKS` flag is disabled, no dispatch occurs.
8. Given a webhook endpoint times out, the mutation still succeeds and the failure is logged.
9. Given the instance has 10 active webhooks, creating an 11th returns CONFLICT.
10. Given the `test` procedure is called, a test payload is POSTed and success/failure is returned synchronously (not fire-and-forget).
