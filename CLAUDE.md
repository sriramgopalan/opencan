# OpenCan — Claude Code session instructions

## Mandatory post-merge review

After every gap PR merges to main, run a **Security Review** and a **DRY Review**
(Templates 2 and 3 in `skills/reviewer.md`) against all new/modified code from
that gap — before starting the next gap. Implement all findings on a dedicated
fix branch, open a PR, and merge it before proceeding.

Do not skip this step, even if the gap seemed straightforward. It is part of the
definition of done for every gap.

## Architecture

All architectural decisions are recorded in `docs/adr/`. Read them before
modifying any cross-cutting concern (auth, error handling, logging, DB access).

Key constraints enforced by CI (break any of these and CI will fail):
- tRPC is the only data path from client code (ADR-001)
- `AppError` is the only throwable — no `new Error()` in src/ (ADR-002)
- Prisma is only touched inside `server/repositories/` (ADR-003)
- Auth is structural: `publicProcedure / protectedProcedure / adminProcedure` (ADR-004)
- New features go behind a flag in `lib/flags.ts` until shipped (ADR-005)
- Pino is the only logger — no `console.*` (ADR-006)
- Webhook delivery is synchronous best-effort in v1 (ADR-007)

## Development workflow

Full canonical sequence is in the plan file. Short version:

1. Write/update spec in `specs/<feature>.md` → mark ACCEPTED
2. Add ADR if a new architectural pattern is introduced
3. Add feature flag to `lib/flags.ts`
4. Prisma migration if schema changes
5. Repository → router → page/component, each with co-located tests
6. All 10 CI gates green before opening PR
7. **After merge: run security + DRY review (see above)**

## CI gates (all 10 must pass)

tsc · ESLint (0 warnings) · Vitest ≥90% branch coverage · Playwright ·
Semgrep · npm audit · jscpd · dependency-cruiser · Lighthouse CI · Gitleaks

## Skills

Read the relevant skill files in `skills/` at the start of each implementation
session. `skills/reviewer.md` contains the mandatory review templates.
