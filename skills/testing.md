# Testing skill — Etash project

Test stack: **Vitest** (unit + integration) · **Playwright** (E2E) · **MSW** (external HTTP mocking)

Tests are **not optional**. Every implementation ships with its test file in the
same response. Do not generate untested code.

---

## What to test

| Source | Test type | Tool | Database |
|--------|-----------|------|----------|
| `/server/repositories/` | Unit | Vitest + mocked Prisma | No |
| `/server/routers/` | Integration | Vitest + tRPC caller | Real Postgres (test DB) |
| UI components with interaction | Component | Vitest + Testing Library | No |
| User-facing flows | E2E | Playwright | Real Postgres (test DB) |
| `/lib/` utilities | Unit | Vitest | No |

---

## Test structure

One test file per source file. Co-locate by default; use a `__tests__/` mirror
only when co-location is blocked by framework conventions.

```
server/repositories/user.ts
server/repositories/user.test.ts   ← co-located

src/components/FeedbackForm.tsx
src/components/FeedbackForm.test.tsx
```

**Describe blocks** named after the unit under test:

```ts
describe('getUserByEmail', () => { … });
describe('FeedbackForm', () => { … });
```

**Test names** describe observable behaviour, not implementation:

```ts
// forbidden
it('test getPost error', …)
it('handles null', …)

// correct
it('returns null when no user exists with that email', …)
it('shows inline error when email field is left empty', …)
it('throws FORBIDDEN when user does not own the post', …)
```

**Arrange / Act / Assert** — blank line between each section:

```ts
it('returns paginated results ordered by createdAt desc', async () => {
  const project = await createTestProject();
  await createTestFeedback(project.id, { count: 5 });

  const result = await feedbackRepo.listByProject({ projectId: project.id, limit: 3 });

  expect(result.items).toHaveLength(3);
  expect(result.nextCursor).toBeDefined();
  expect(result.items[0].createdAt >= result.items[1].createdAt).toBe(true);
});
```

---

## Coverage

Minimum thresholds on all new code — enforced by `vitest.config.ts`:

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Branches | 90% |
| Functions | 90% |
| Statements | 90% |

No `/* v8 ignore */` or `/* istanbul ignore */` exemptions without a comment
on the same line explaining why:

```ts
/* v8 ignore next 3 — unreachable: exhaustiveness guard, TS prevents this at compile time */
default:
  throw new AppError('UNREACHABLE', 'Unknown variant');
```

---

## Repository unit tests

Mock the Prisma client at the module boundary. Never let a repository unit test
touch a real database.

```ts
import { prismaMock } from '@/tests/prismaMock';
import { getUserByEmail } from './user';

describe('getUserByEmail', () => {
  it('returns the user when found', async () => {
    const fixture = { id: 'usr_1', email: 'a@example.com', createdAt: new Date(), updatedAt: new Date() };
    prismaMock.user.findUnique.mockResolvedValue(fixture);

    const result = await getUserByEmail('a@example.com');

    expect(result).toEqual(fixture);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@example.com' },
    });
  });

  it('returns null when no user exists with that email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await getUserByEmail('missing@example.com');

    expect(result).toBeNull();
  });
});
```

---

## tRPC integration tests

Use a real Postgres test database. Never mock the database in integration tests.

```ts
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '@/server/routers/_app';
import { createTestContext } from '@/tests/context';
import { db } from '@/tests/db';

const createCaller = createCallerFactory(appRouter);

describe('feedback.create', () => {
  beforeEach(async () => {
    await db.truncateAll(); // or wrap each test in a transaction and roll back
  });

  it('persists feedback and returns the created record', async () => {
    const user = await db.seed.user();
    const project = await db.seed.project({ ownerId: user.id });
    const caller = createCaller(createTestContext({ user }));

    const result = await caller.feedback.create({ projectId: project.id, content: 'Great tool' });

    expect(result.id).toBeDefined();
    expect(result.content).toBe('Great tool');
    const stored = await db.prisma.feedbackResponse.findUnique({ where: { id: result.id } });
    expect(stored).not.toBeNull();
  });

  it('throws FORBIDDEN when user does not own the project', async () => {
    const owner = await db.seed.user();
    const other = await db.seed.user();
    const project = await db.seed.project({ ownerId: owner.id });
    const caller = createCaller(createTestContext({ user: other }));

    await expect(
      caller.feedback.create({ projectId: project.id, content: 'test' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
```

Test the full stack: input validation → middleware → procedure → repository →
database → response. Do not skip layers.

---

## Component tests

Use Vitest + Testing Library. Test user-visible behaviour — not implementation
details like state variables or internal methods.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackForm } from './FeedbackForm';

describe('FeedbackForm', () => {
  it('shows inline error when content is submitted empty', async () => {
    render(<FeedbackForm onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Content is required');
  });

  it('calls onSubmit with trimmed content on valid submission', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/feedback/i), '  Great tool  ');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledWith({ content: 'Great tool' });
  });
});
```

Query by role, label, and accessible name — never by `data-testid` unless no
semantic query applies.

---

## MSW — mocking external HTTP

Use MSW to intercept calls to third-party services (email, Slack, payment
providers, webhooks). Never mock internal functions of the unit under test.

```ts
import { http, HttpResponse } from 'msw';
import { server } from '@/tests/msw/server';

describe('notifyProjectOwner', () => {
  it('sends an email via the configured provider', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('https://api.resend.com/emails', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 'email_123' });
      })
    );

    await notifyProjectOwner({ projectId: 'proj_1', event: 'feedback.received' });

    expect(capturedBody).toMatchObject({ to: expect.stringContaining('@') });
  });
});
```

MSW handlers for common services live in `/src/tests/msw/handlers.ts` and are
active by default in all Vitest runs. Override per-test with `server.use(…)`.

---

## Playwright E2E

Every test starts from a known, seeded database state. Do not rely on state
left by previous tests.

```ts
// e2e/feedback.spec.ts
import { test, expect } from '@playwright/test';
import { seedDatabase, cleanDatabase } from './helpers/db';

test.beforeEach(async () => {
  await cleanDatabase();
  await seedDatabase('feedback-flow');
});

test('submits feedback and shows confirmation', async ({ page }) => {
  await page.goto('/projects/proj_test/submit');

  await page.getByLabel('Your feedback').fill('Really useful product');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('status')).toContainText('Thank you');
});
```

**Page object model** for any flow touched by more than one test:

```ts
// e2e/pages/FeedbackPage.ts
export class FeedbackPage {
  constructor(private page: Page) {}

  async goto(projectId: string) {
    await this.page.goto(`/projects/${projectId}/submit`);
  }

  async submit(content: string) {
    await this.page.getByLabel('Your feedback').fill(content);
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }

  get confirmation() {
    return this.page.getByRole('status');
  }
}
```

**Browser matrix**: Chromium is the primary test target — all tests run there.
Firefox and WebKit run smoke tests only (happy path, no error states).

Playwright config already defines the three browser projects; tag smoke tests
with `@smoke` in the test title to target them selectively:

```ts
test('homepage loads @smoke', async ({ page }) => { … });
```

---

## What not to mock

| Do mock | Do not mock |
|---------|-------------|
| External HTTP (MSW) | The database in integration tests |
| Prisma client in unit tests | Internal functions of the unit under test |
| `Date.now()` / timers when testing time-sensitive logic | tRPC router internals |
| Third-party SDKs (email, Stripe) | Repository functions when testing a router |

If you find yourself mocking an internal function to make a test pass, the unit
is doing too much — decompose it first, then test the parts.
