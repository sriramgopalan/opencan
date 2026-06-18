# DRY / code quality skill — OpenCan project

These rules apply to **every file generated**. Do not wait to be asked.

---

## Before writing any new code

Search these locations for existing functions that serve the same purpose:
- `/server/repositories/` — database access
- `/lib/` — shared utilities, constants, helpers
- `/types/` — shared TypeScript types

State explicitly which existing functions you are **reusing** before writing
anything new. If a similar function exists, extend or compose it — never
duplicate it.

```
// required preamble when generating new code:
// Reusing: getUserById (server/repositories/user.ts)
// Extending: createFeedback (server/repositories/feedback.ts) — adding projectId filter
// New: summariseFeedback — no existing function covers this
```

If no existing function covers the need, say so before writing the new one.

---

## Functions and modules

**Single responsibility**: each function does one thing. Its name must describe
that one thing completely. If the name needs "and" or "or", split the function.

**Length**: functions over 40 lines are a signal to decompose. If you exceed
40 lines, add a one-line comment explaining why the length is justified (e.g.
a sequential protocol that cannot be split without losing clarity).

**Parameter count**: no function with more than 3 parameters. Use an options
object for 4 or more:

```ts
// forbidden
function createUser(name: string, email: string, role: Role, projectId: string) { … }

// correct
interface CreateUserOptions {
  name: string;
  email: string;
  role: Role;
  projectId: string;
}
function createUser(options: CreateUserOptions) { … }
```

**Purity**: prefer pure functions. When a function has side effects (writes,
network calls, mutations), name it to make the side effect explicit:

```ts
// pure — name describes transformation
function formatDisplayName(user: Pick<User, 'name' | 'email'>): string { … }

// impure — name signals the write
async function persistFeedbackAndNotifyOwner(input: CreateFeedbackInput): Promise<void> { … }
```

---

## Exports and surface area

Never export a symbol that has no consumer at time of generation. Unused
exports are dead surface area — they will be imported somewhere eventually,
creating coupling to code that was never designed to be shared.

- **Types** → `/types/`. Never redefine the same shape inline in two files.
- **Constants** → `/lib/constants.ts`. Never hardcode the same value in two
  places. If a string or number appears twice, it belongs in constants.

```ts
// forbidden — magic string duplicated at call sites
if (user.role === 'ADMIN') { … }

// correct
import { ROLES } from '@/lib/constants';
if (user.role === ROLES.ADMIN) { … }
```

---

## Repository pattern

All database access goes through repository functions in `/server/repositories/`.
No raw Prisma calls anywhere else — dependency-cruiser enforces this at CI.

Name repository functions by **intent**, not by Prisma method:

```ts
// forbidden — leaks implementation detail
prisma.user.findUnique({ where: { email } })   // called directly outside repo
userRepo.prismaFindUniqueByEmail(email)         // names the ORM, not the intent

// correct
userRepo.getUserByEmail(email)
feedbackRepo.listByProject({ projectId, cursor, limit })
feedbackRepo.markAsResolved(id)
```

Each repository file owns one model. Cross-model joins are composed at the
router or service layer by calling multiple repository functions — not by
writing a repository function that spans models.

---

## Complexity

**Cyclomatic complexity ≤ 10** per function. Each `if`, `else if`, `case`,
`catch`, `&&`, `||`, `??`, ternary, and loop increments complexity by 1.
If you approach the limit, decompose into named sub-functions.

**Deeply nested conditionals** (3+ levels) must be refactored to early returns:

```ts
// forbidden — 3 levels of nesting
function process(input: Input) {
  if (input.valid) {
    if (input.user) {
      if (input.user.active) {
        return doWork(input);
      }
    }
  }
}

// correct — early returns flatten the structure
function process(input: Input) {
  if (!input.valid) return;
  if (!input.user) return;
  if (!input.user.active) return;
  return doWork(input);
}
```

**Switch with more than 5 cases** must use a lookup map:

```ts
// forbidden at 6+ cases
switch (event.type) {
  case 'created': return handleCreated(event);
  case 'updated': return handleUpdated(event);
  // … 4 more cases
}

// correct
const EVENT_HANDLERS: Record<EventType, (e: FeedbackEvent) => void> = {
  created:   handleCreated,
  updated:   handleUpdated,
  resolved:  handleResolved,
  deleted:   handleDeleted,
  exported:  handleExported,
  commented: handleCommented,
};

const handler = EVENT_HANDLERS[event.type];
if (!handler) throw new AppError('UNKNOWN_EVENT', `Unhandled event: ${event.type}`);
handler(event);
```

The lookup map approach also makes the exhaustiveness visible at a glance and
allows adding new cases without touching control flow.
