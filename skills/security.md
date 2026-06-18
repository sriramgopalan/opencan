# Security skill — OpenCan project

These rules apply to **every file generated**. Do not wait to be asked.

---

## Input validation

Every tRPC procedure must declare a Zod input schema. No exceptions.

```ts
// correct
export const createPost = protectedProcedure
  .input(z.object({ title: z.string().min(1).max(200), body: z.string() }).strict())
  .mutation(async ({ input, ctx }) => { … });
```

- Use `.strict()` on every `z.object()` — rejects unknown fields instead of silently
  ignoring them.
- Validate on the server even when the client sends pre-validated data.
- Never read `req.body`, `req.query`, or `req.params` directly — go through the
  typed `input` from the Zod schema.

---

## Authentication and authorisation

**Never** check the session inside a procedure body. Auth is middleware's job.

```ts
// correct — middleware already threw if unauthenticated
export const protectedProcedure = t.procedure.use(authMiddleware);
```

**Ownership** must be checked explicitly inside any procedure that touches
user-owned data:

```ts
const post = await postRepo.findById(input.id);
if (post.userId !== ctx.session.user.id) {
  throw new AppError('FORBIDDEN', 'Access denied');
}
```

**Admin** gates:

```ts
if (ctx.session.user.role !== 'ADMIN') {
  throw new AppError('FORBIDDEN', 'Admin only');
}
```

Failing to check ownership is a broken access control bug (OWASP A01). Always
verify, even when the route "feels" safe.

---

## Secrets and environment

- No secrets, tokens, API keys, or passwords in source code — ever.
- All secrets come from environment variables validated at startup with Zod
  (see `src/lib/env.ts`).
- Never log fields named `password`, `token`, `secret`, `apiKey`, or
  `creditCard`. Redact at the logger level if a full object must be logged:

```ts
const { password: _pw, ...safeUser } = user;
logger.info({ user: safeUser }, 'user loaded');
```

---

## Injection prevention

Use Prisma parameterised methods exclusively. Never construct query strings.

```ts
// correct
await prisma.user.findMany({ where: { email: input.email } });

// forbidden — SQL injection risk
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${input.email}'`);
```

Additional bans:
- No `eval()`, `new Function()`, or `vm.runInContext()`.
- No `require(variable)` or dynamic `import(variable)` with user-controlled
  values.
- Template literals in shell commands are forbidden — use a parameterised
  subprocess library if a shell call is unavoidable.

---

## Output safety

Never return a raw Prisma model to the client. Select only the fields the
caller needs.

```ts
// correct
return await prisma.user.findUniqueOrThrow({
  where: { id },
  select: { id: true, email: true, createdAt: true },
});

// forbidden
return await prisma.user.findUniqueOrThrow({ where: { id } });
```

Strip internal fields (`passwordHash`, `internalNotes`, `stripeCustomerId`)
before returning any object. If the field must not leave the server, it must
not appear in the return type.

Error messages returned to the client must be generic. Log the real error
server-side with `logger.error`; send a coded `AppError` message that contains
no stack traces, file paths, or SQL.

---

## Rate limiting

Auth endpoints — login, register, magic link, password reset — **must** apply
rate limiting before any business logic runs.

```ts
import { rateLimit } from '@/lib/rate-limit';

export const login = publicProcedure
  .input(loginSchema)
  .mutation(async ({ input, ctx }) => {
    await rateLimit(ctx.ip, 'auth', { max: 10, window: '15m' });
    // … proceed
  });
```

The rate limiter lives in `/lib/rate-limit.ts`. Do not implement ad-hoc
counting elsewhere.

---

## File uploads

1. **MIME type**: validate server-side using magic-byte inspection (e.g.
   `file-type` package). Never trust the `Content-Type` header or the file
   extension alone.
2. **Size**: enforce a per-upload byte limit before writing anything to disk or
   object storage.
3. **Storage**: write to S3/MinIO (object storage), never to a path inside
   `public/` or any directory served by Next.js.
4. **Serving**: generate short-lived signed URLs for retrieval. Never expose
   a direct filesystem path.

```ts
const detected = await fileTypeFromBuffer(buffer);
if (!ALLOWED_MIME_TYPES.includes(detected?.mime ?? '')) {
  throw new AppError('INVALID_FILE_TYPE', 'Unsupported file type');
}
if (buffer.byteLength > MAX_UPLOAD_BYTES) {
  throw new AppError('FILE_TOO_LARGE', 'File exceeds size limit');
}
```
