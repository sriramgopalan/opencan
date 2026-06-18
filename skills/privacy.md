# Privacy skill — OpenCan project

This product handles customer feedback data and operates a managed hosting tier
subject to GDPR. These rules apply to **every file generated**. Do not wait to
be asked.

---

## Data minimisation

Before adding any database field, ask: *is this strictly necessary for a stated
feature?* If the answer is not an immediate yes, do not add it.

Every PII field in `prisma/schema.prisma` must carry an inline comment:

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique // PII: account identity and transactional email
  name      String?           // PII: display name, user-provided
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

IP addresses:
- Never store IP addresses in the database.
- Use them transiently for rate limiting (in Redis, keyed by hash, TTL ≤ 15 min)
  and discard immediately after.
- Never write an IP address to a log line.

---

## User deletion

Every feature that persists user data must ship with a deletion path in the
same PR. There is no "we'll add deletion later."

Hard-delete or anonymise all PII in a **single Prisma transaction**:

```ts
await prisma.$transaction([
  // anonymise retained records that must not be hard-deleted (e.g. audit rows)
  prisma.feedbackResponse.updateMany({
    where: { userId },
    data: { userId: ANONYMISED_SENTINEL },
  }),
  // hard-delete everything else
  prisma.session.deleteMany({ where: { userId } }),
  prisma.user.delete({ where: { id: userId } }),
]);
```

Anonymisation format for any field that previously held the user's email:

```
deleted-{cuid}@deleted.opencan.dev
```

Use `cuid()` (from the `@paralleldrive/cuid2` package) so anonymised rows
remain unique without revealing the original identity.

After deletion, invalidate all active sessions for that user before the
transaction commits.

---

## Logging

Log user activity by `userId` only. Never log PII.

Banned log fields (will trip the gitleaks/Semgrep rules — fix the root cause,
not the rule):

| Field name | Why banned |
|------------|-----------|
| `email` | direct identifier |
| `name` | direct identifier |
| `ip` / `ipAddress` | indirect identifier |
| `userAgent` | fingerprinting vector |
| `feedbackContent` | may contain PII typed by the user |
| `password` / `token` / `secret` | already covered in `security.md` |

```ts
// correct
logger.info({ userId: ctx.session.user.id, action: 'feedback.submit' }, 'feedback submitted');

// forbidden
logger.info({ email: user.email, body: input.content }, 'feedback submitted');
```

---

## Third-party services

**Self-hosted build**: no third-party analytics scripts (GA, Segment, Mixpanel,
Hotjar, etc.) may be included — not even behind a feature flag that defaults
off. Offer a documented integration point instead.

**CDN resources**: all fonts, icon sets, and static assets must be
self-hosted. Google Fonts calls `fonts.gstatic.com` on page load and constitute
a data transfer to Google under GDPR.

```ts
// forbidden in layout.tsx
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// correct — font files committed to /public/fonts/ or loaded via next/font
import { Inter } from 'next/font/google'; // next/font downloads at build time, no runtime call
```

**Documentation**: every third-party service that receives user data (payment
processor, error tracker, transactional email provider, object storage) must
have an entry in `/docs/privacy/third-parties.md` covering: service name,
data sent, legal basis, DPA link, data residency region.

---

## Cookies

Strictly necessary cookies (session, CSRF token) may be set without consent.
All others require explicit opt-in before being written.

```ts
// correct — session cookie, no consent needed
cookies().set('session', token, { httpOnly: true, sameSite: 'lax', secure: true });

// forbidden without prior consent
cookies().set('_ga', gaClientId); // analytics
```

Every cookie the application sets must have a corresponding entry in
`/docs/privacy/cookies.md` with: name, purpose category, expiry, whether
consent is required.

Do not set preference or analytics cookies during SSR before the consent state
is known. Read consent from the consent cookie (strictly necessary) before
deciding whether to initialise any optional service.

---

## Consent

- Never pre-tick a consent checkbox.
- Consent must be **granular**: one checkbox per distinct purpose. A single
  "I agree to everything" checkbox is not valid GDPR consent.
- Consent choices must be stored server-side (attached to the user record or
  anonymous consent token) — do not rely solely on a client-side cookie.
- Withdrawing consent must be as easy as giving it. Every consent UI must
  include a revocation path.

```tsx
// correct — separate, unchecked by default
<ConsentCheckbox name="analytics" defaultChecked={false} label="Usage analytics" />
<ConsentCheckbox name="email_marketing" defaultChecked={false} label="Marketing emails" />

// forbidden
<input type="checkbox" name="all_consent" defaultChecked /> I agree to all data processing
```

Record the timestamp and consent version alongside each consent choice so you
can demonstrate valid consent was obtained if challenged.
