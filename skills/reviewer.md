# Reviewer skill — OpenCan project

This file is not a generation skill. It contains **Stage 3 review prompt
templates** for use in a Claude Chat session after implementation is complete.

**Usage**: copy the template block, replace the `{{PLACEHOLDER}}` sections
with the actual content, and paste into a new Claude Chat session.

---

## Template 1 — Spec Adherence Review

**When to use**: after implementation, before opening a PR. Paste the spec and
the diff or relevant source files.

```
You are performing a spec adherence review. Your job is to check the
implementation against the spec with precision — not to suggest improvements
or refactor ideas. Report only deviations.

## Spec

{{PASTE SPEC DOCUMENT OR ACCEPTANCE CRITERIA HERE}}

## Implementation

{{PASTE DIFF, OR LIST FILES AND PASTE THEIR CONTENTS HERE}}

## Instructions

Check every acceptance criterion in the spec against the implementation.
For each criterion, determine:

- IMPLEMENTED — the criterion is fully satisfied by the code
- PARTIAL — the criterion is satisfied in some paths but not all
- MISSING — the criterion is not addressed in the implementation

Also check:
1. Error states — every error case named in the spec must be explicitly handled.
   An unhandled error state is MISSING, not PARTIAL.
2. API contract — route paths, HTTP methods, request/response field names,
   types, and status codes must match the spec exactly. Any divergence is a gap.
3. Silent assumptions — flag any place where the implementation makes a
   behavioural choice the spec does not address. Label these ASSUMPTION with a
   description of what was assumed.

## Output format

Produce a markdown table with these columns:

| Criterion | Status | Gap / Note |
|-----------|--------|------------|
| <criterion text from spec> | IMPLEMENTED / PARTIAL / MISSING / ASSUMPTION | <what is missing or assumed, empty if IMPLEMENTED> |

After the table, list any PARTIAL or MISSING items as numbered action items
the implementer must resolve before the PR is mergeable.

Do not suggest features beyond the spec. Do not comment on code style.
```

---

## Template 2 — Security Review

**When to use**: on any PR that adds a new endpoint, mutation, file upload,
auth flow, or handles user-supplied input. Paste the relevant source files.

```
You are performing a security review focused on the OWASP Top 10 and the
security rules defined for this project. Your job is to find vulnerabilities —
not to suggest architectural improvements.

## Implementation

{{PASTE DIFF, OR LIST FILES AND PASTE THEIR CONTENTS HERE}}

## Checklist to apply line by line

Work through each item. For every item where a problem is found, record a
finding. If an item is clean, do not mention it.

OWASP Top 10 (2021):
- A01 Broken Access Control: every resource access checks ownership or role.
  No procedure relies solely on authenticated = authorised.
- A02 Cryptographic Failures: no secrets, tokens, or passwords in source.
  No sensitive fields logged. No weak hashing (MD5, SHA1) for passwords.
- A03 Injection: all database queries use Prisma parameterised methods.
  No string concatenation in query construction. No eval(), no Function(),
  no dynamic require() with user-controlled values.
- A04 Insecure Design: auth checked in middleware, not ad-hoc inside procedures.
  Rate limiting applied to auth endpoints.
- A05 Security Misconfiguration: no debug endpoints or stack traces exposed
  to clients. No default credentials.
- A06 Vulnerable Components: flag any direct use of a dependency with a known
  CVE if visible in the diff.
- A07 Auth and Session Failures: session tokens not logged. Session invalidated
  on logout and account deletion.
- A08 Software and Data Integrity: no unsigned or unvalidated data trusted from
  external sources.
- A09 Logging and Monitoring Failures: sensitive fields (password, token,
  secret, apiKey, email, creditCard) must not appear in log statements.
- A10 SSRF: any URL constructed from user input must be validated against an
  allowlist before a server-side fetch.

Additional project-specific checks:
- Every tRPC input validated with a Zod schema using .strict().
- No raw database objects returned to the client — select only needed fields.
- Error messages returned to clients contain no stack traces, file paths, or
  SQL fragments.
- File uploads: MIME type validated by magic bytes, size limit enforced, stored
  outside webroot.

## Output format

For each finding produce:

**[SEVERITY]** `file:line`
Description: <what the vulnerability is>
Fix: <specific change required — be precise, not generic>

Severity levels:
- CRITICAL — exploitable without authentication, data exfiltration, RCE
- HIGH — exploitable with a valid account, privilege escalation, auth bypass
- MEDIUM — requires specific conditions, indirect data exposure
- LOW — defence-in-depth improvement, information disclosure with low impact

List findings in severity order, highest first. If no findings, say
"No findings" — do not invent issues.
```

---

## Template 3 — DRY and Surface Area Review

**When to use**: on any PR that adds new functions, types, or exports. Paste
both the new code and the existing files from `/server/repositories/`, `/lib/`,
and `/types/` that are most likely to overlap.

```
You are performing a DRY and surface area review. Your job is to find
duplication, unnecessary exports, excessive complexity, and misplaced types.
Do not suggest features. Do not comment on naming style beyond what the rules
below require.

## New code (the PR)

{{PASTE DIFF OR NEW FILES HERE}}

## Existing code (relevant context)

{{PASTE CONTENTS OF /server/repositories/, /lib/, AND /types/ FILES MOST
LIKELY TO OVERLAP WITH THE NEW CODE}}

## Checklist

1. Duplication — does any logic in the new code already exist in the existing
   code? Look for: same query shape, same transformation, same validation rule,
   same error message construction. Identical or near-identical code that should
   be extracted or reused.

2. Unused exports — is every exported function, type, and constant consumed
   somewhere in the provided code? Flag any export with no visible consumer as
   UNUSED EXPORT. (Note: if the consumer is in a file not provided, say
   CONSUMER NOT IN CONTEXT rather than flagging as unused.)

3. Complexity — does any function exceed cyclomatic complexity of 10? Count
   each if, else if, case, catch, &&, ||, ??, ternary, and loop as +1.
   Flag functions that exceed the limit.
   Does any function exceed 40 lines? Flag it.
   Does any function have more than 3 parameters (not counting an options
   object)? Flag it.
   Are there 3+ levels of nested conditionals that should be early returns?
   Flag them.

4. Misplaced types — is any TypeScript type or interface defined inline in a
   non-/types/ file and used (or likely to be used) in more than one place?
   Flag it as a candidate for /types/.

5. Misplaced constants — is any string or numeric literal used more than once
   across the new code? Flag it as a candidate for /lib/constants.ts.

## Output format

For each finding:

**[ISSUE TYPE]** `file:line`
Issue: <description of the problem>
Resolution: <specific action — which existing function to reuse, which file
to move the type to, how to decompose the function, etc.>

Issue types: DUPLICATION | UNUSED EXPORT | EXCESS COMPLEXITY | EXCESS LENGTH |
EXCESS PARAMS | DEEP NESTING | MISPLACED TYPE | MISPLACED CONSTANT

List findings grouped by issue type. If no findings in a category, omit that
category. If no findings at all, say "No findings."
```
