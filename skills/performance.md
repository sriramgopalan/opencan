# Performance skill — OpenCan project

Target metrics: **LCP < 2.5 s · INP < 200 ms · CLS < 0.1**
API targets: **p95 reads < 200 ms · p95 writes < 500 ms**

These rules apply to **every file generated**. Do not wait to be asked.

---

## Database queries

**No N+1 queries.** Every list query that returns related data must use a
single `include` or nested `select` — never fetch relations in a loop.

```ts
// forbidden — N+1
const posts = await prisma.post.findMany();
for (const post of posts) {
  post.author = await prisma.user.findUnique({ where: { id: post.userId } });
}

// correct — single query
const posts = await prisma.post.findMany({
  select: {
    id: true,
    title: true,
    createdAt: true,
    author: { select: { id: true, name: true } },
  },
});
```

**All list endpoints must be paginated.** No unbounded `findMany()` without a
`take` limit. Prefer cursor-based pagination for large or frequently updated
datasets; offset pagination is acceptable only for small, stable lists.

```ts
// cursor-based (preferred)
const items = await prisma.feedbackResponse.findMany({
  take: input.limit,
  cursor: input.cursor ? { id: input.cursor } : undefined,
  skip: input.cursor ? 1 : 0,
  orderBy: { createdAt: 'desc' },
  select: { id: true, content: true, createdAt: true },
});
const nextCursor = items.length === input.limit ? items.at(-1)?.id : undefined;
```

**Select only needed fields.** Never use the Prisma equivalent of `SELECT *`.
Name every column in `select`. If a new field is added to the model it must be
explicitly opted into at each call site.

**Indexes.** Every foreign key and every field that appears in a `where`,
`orderBy`, or `cursor` clause must have a `@@index` or `@unique` defined in
`schema.prisma`:

```prisma
model FeedbackResponse {
  id        String   @id @default(cuid())
  userId    String
  projectId String
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([projectId, createdAt(sort: Desc)])
}
```

Adding an index-less foreign key or a filtered field without an index is a
schema review failure.

---

## React and Next.js

**Server Components by default.** Only add `'use client'` when the component
requires browser APIs, event handlers, or React state/effects. Colocate the
`'use client'` boundary as deep in the tree as possible to keep the client
bundle small.

```tsx
// correct — data fetching stays on the server
async function FeedbackList({ projectId }: { projectId: string }) {
  const items = await feedbackRepo.listByProject(projectId);
  return <ul>{items.map(i => <FeedbackItem key={i.id} item={i} />)}</ul>;
}
```

**Never import a heavy library on the client** when a server-side alternative
exists. Date formatting, markdown rendering, syntax highlighting — run these on
the server or in an RSC.

**Images** — always `next/image`, never a raw `<img>` tag. Set explicit
`width` and `height` (or `fill` with a sized container) to prevent CLS:

```tsx
import Image from 'next/image';
<Image src={url} alt={alt} width={800} height={600} />
```

**Fonts** — always `next/font`. Never a `<link>` to `fonts.googleapis.com` (a
runtime round-trip that also violates privacy rules — see `privacy.md`):

```ts
import { Inter } from 'next/font/google'; // downloaded at build time, zero runtime call
const inter = Inter({ subsets: ['latin'], display: 'swap' });
```

**Lazy load below-the-fold components** with `next/dynamic` and a visible
loading state so layout does not shift when the component resolves:

```tsx
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <div className="h-64 animate-pulse bg-gray-100 rounded" />,
  ssr: false,
});
```

---

## Bundle size

No library over **50 kB gzipped** may be added to the client bundle without a
written justification comment in the PR description and the import site.

Named imports only from large libraries — never import the whole package:

```ts
// forbidden — pulls entire lodash into the bundle
import _ from 'lodash';

// correct — tree-shakeable
import { groupBy } from 'lodash-es';
// or use a native alternative and skip the dependency entirely
```

Verify bundle impact before merging any new client-side dependency:

```bash
ANALYZE=true npm run build
```

The bundle analyzer must show the new dependency in the expected chunk at an
acceptable size. Screenshot or note the output in the PR.

---

## Caching

Cache expensive read queries with an explicit revalidation strategy. Document
the strategy alongside the cache call — not in a separate file.

```ts
import { cache } from 'react';

// request-level deduplication — safe to call from multiple RSCs in one render
export const getProject = cache(async (id: string) => {
  return projectRepo.findById(id);
});
```

For Next.js `fetch`-based caching, set `revalidate` deliberately:

```ts
// revalidates every 60 s — appropriate for project metadata
const data = await fetch(url, { next: { revalidate: 60 } });

// opt out of caching for user-specific data
const data = await fetch(url, { cache: 'no-store' });
```

Every cached query must answer three questions in a comment:
1. **What** is cached.
2. **How long** / under what condition it is valid.
3. **How** it is invalidated (e.g. `revalidatePath`, `revalidateTag`, TTL).

```ts
// Cached: project metadata (name, slug, settings)
// TTL: 60 s — stale data is acceptable; metadata changes infrequently
// Invalidation: revalidateTag(`project:${id}`) called in updateProject mutation
```

---

## API responses

Next.js compresses responses automatically for the built-in server. For any
custom route handler that bypasses this (e.g. streaming, edge functions),
verify compression is applied or add it explicitly.

Return only the fields the client needs. Enforce this at the type level using
tRPC output schemas so over-fetched fields are a type error, not just a
convention:

```ts
export const getPost = protectedProcedure
  .input(z.object({ id: z.string() }))
  .output(z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.date(),
    author: z.object({ id: z.string(), name: z.string() }),
    // intentionally omitted: internalNotes, userId, passwordHash
  }))
  .query(async ({ input, ctx }) => {
    return postRepo.findById(input.id, ctx.session.user.id);
  });
```

Defining an `.output()` schema also strips any extra fields the repository
accidentally returns, providing a second line of defence against data leakage
(see `security.md`).
