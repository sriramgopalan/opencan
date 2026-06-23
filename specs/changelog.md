# Spec: Changelog

Status: ACCEPTED

## Decisions

| # | Topic | Resolution |
|---|-------|------------|
| CL-01 | Entry URL | `/changelog/[slug]` — flat hierarchy, slug is human-readable and unique |
| CL-02 | Body format | Markdown stored as `String @db.Text` — consistent with posts.md P-04; rendered via `marked` + `sanitize-html` at display time |
| CL-03 | Linked posts | Optional array of Post IDs on each entry — `ChangelogEntryPost` join table with cascade delete on both sides |
| CL-04 | Notification trigger | On `publish` only — not on save draft; prevents spam during editing |
| CL-05 | Fan-out target | Users who voted on any linked post and have `notifyOnStatusChange = true` — reuses Gap 2 preference field; deduplicated by email |
| CL-06 | Draft/publish state | `publishedAt: DateTime?` — null = draft, set = published; no separate status enum needed |
| CL-07 | Author | Admin only; stored as `authorId` FK to User; displayed on entry page |
| CL-08 | Image attachments | Deferred — MinIO is in the stack but not wired; plain Markdown only in v1 |
| CL-09 | Slug source | Admin-supplied slug validated by `isSlugFormatValid` (3–50 chars, `[a-z][a-z0-9-]*`); uniqueness enforced at DB level |
| CL-10 | Entry list ordering | `publishedAt DESC` — most recent first; drafts excluded from public list |
| CL-11 | Admin draft management | `/admin/changelog` RSC showing all entries (draft + published), sorted by `createdAt DESC` |
| CL-12 | Rich text sanitization | `marked` parses Markdown to HTML server-side; `sanitize-html` with a permissive-but-safe allowlist strips scripts/dangerous attrs |
| CL-13 | Linked post visibility | Linked posts shown on entry page without vote counts; no PENDING filtering needed (admin-authored entries only link SHIPPED/meaningful posts) |
| CL-14 | Entry list pagination | Cursor-based, consistent with existing list patterns; `limit: 10` per page |
| CL-15 | Email BCC vs. individual sends | Individual sends to each voter — avoids exposing voter list in email headers (privacy.md compliance) |
| CL-16 | Feature flag | `CHANGELOG` flag gates both public pages and admin management |

## Glossary

- **ChangelogEntry**: Admin-authored, dated announcement with a title, Markdown body, and optional linked posts
- **ChangelogEntryPost**: Join record connecting one `ChangelogEntry` to one `Post`
- **Draft**: Entry with `publishedAt = null`; visible only in admin UI
- **Published**: Entry with `publishedAt` set to a DateTime; visible on public changelog

## Data Model

```prisma
model ChangelogEntry {
  id          String    @id @default(cuid())
  slug        String    @unique
  title       String    @db.VarChar(200)
  body        String    @db.Text          // Markdown; sanitised on render
  authorId    String
  author      User      @relation(fields: [authorId], references: [id])
  publishedAt DateTime?                   // null = draft
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  linkedPosts ChangelogEntryPost[]

  @@index([publishedAt])
}

model ChangelogEntryPost {
  entryId String
  postId  String
  entry   ChangelogEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  post    Post           @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@id([entryId, postId])
}
```

Back-relations added to `User` and `Post` models.

## Acceptance Criteria

1. A `/changelog` page lists all published entries in reverse-chronological order (draft entries hidden)
2. Each entry links to `/changelog/[slug]`
3. A `/changelog/[slug]` page renders the full Markdown body safely (no XSS)
4. Linked posts are shown on the entry detail page
5. Admins can view all entries (draft + published) at `/admin/changelog`
6. When an entry is published (via the `publish` router procedure), voters of linked posts receive individual notification emails (respecting `notifyOnStatusChange`)
7. Duplicate email addresses in the voter fan-out are deduplicated before sending
8. The CHANGELOG feature flag gates the public pages; admin page is always visible to admins
9. Slug format is validated — must match `[a-z][a-z0-9-]*`, 3–50 characters, no `--` or trailing `-`
10. Entries are paginated with cursor-based pagination (limit 10)
