# Base skill — OpenCan project

## Project
Next.js 16 App Router · TypeScript strict · Prisma + PostgreSQL · tRPC · Pino logging.

## Before writing any code
1. Read `docs/adr/ADR-001` through `ADR-006` if they exist. Those decisions are
   binding — do not propose alternatives already settled there.
2. List every ambiguity or missing spec detail as a numbered question.
   Wait for answers before generating implementation. Do not fill gaps with
   assumptions silently.

## Architecture boundaries (hard rules)
| Concern | Allowed location | Forbidden everywhere else |
|---------|-----------------|--------------------------|
| Database queries | `server/repositories/` only | app/, components/, routers/ |
| tRPC procedure definitions | `server/routers/` only | anywhere else |
| Shared TypeScript types | `types/` | inline in components |
| Route handlers / pages | `src/app/` | — |

Repositories own all Prisma client calls. Routers call repositories; they never
call `prisma` directly. App code calls tRPC; it never imports from
`server/repositories`.

## Logging
Use `pino` exclusively. Never write `console.log`, `console.error`, or
`console.warn` in any file that ships to production (`src/`, `server/`).

```ts
import { logger } from '@/lib/logger'; // re-exports a pino instance
logger.info({ userId }, 'user created');
logger.error({ err }, 'payment failed');
```

Pass structured context objects as the first argument, message string second.

## Error handling
Throw `AppError` (from `@/lib/errors`) for all application-level errors.
Never throw plain `new Error()` in business logic.

```ts
throw new AppError('USER_NOT_FOUND', 'No user with that id', { userId });
```

`AppError` carries a typed `code` (string union), a human message, and an
optional metadata payload. Catch at tRPC middleware; log with `logger.error`.

## Code generation rule
Generate **implementation file + TypeScript types + test file** in a single
response. Never deliver untested code. Test file goes in the same directory as
the implementation, named `*.test.ts` or `*.test.tsx`.

## Style
- No `any`. Use `unknown` + type guards at boundaries.
- No `// eslint-disable` comments — fix the root cause instead.
- Imports ordered: builtin → external → `@/` internal → relative. Blank line
  between groups (enforced by ESLint; match it to avoid lint failures on save).
