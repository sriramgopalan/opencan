-- Backfills schema that reached prisma/schema.prisma without a migration
-- (comments feature #16, admin feature #17). CI and `dev:setup` use `db push`,
-- so the gap only shows up with `prisma migrate deploy` (the Docker entrypoint):
-- fresh installs had no Comment table, no Post.commentCount, no User.suspendedAt,
-- and User.role as TEXT instead of the Role enum.
--
-- Every statement is idempotent so this also applies cleanly to databases whose
-- schema was already brought up to date with `prisma db push`.
--
-- Post_title_trgm_idx (GIN, pg_trgm) is created by 20260615030000_add_posts and is
-- not declarable in schema.prisma, so `db push` databases never got it. It is
-- (re)created idempotently at the end of this file.
--
-- Amended 2026-11-10 (post-merge review of #64): role values are normalised before
-- the enum cast, and the trgm index backfill was added. Safe for databases that
-- already applied the original: `migrate deploy` does not re-run applied migrations.

-- Role enum ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User.role: TEXT -> "Role", preserving existing values (no admin is demoted).
-- The column was free text, so operators may have typed e.g. 'admin' via SQL or
-- Prisma Studio: normalise case/whitespace first, and fail with an actionable
-- message (instead of a bare cast error) if anything else remains.
DO $$
DECLARE
  bad_roles TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'User'
      AND column_name = 'role' AND data_type = 'text'
  ) THEN
    UPDATE "User" SET "role" = UPPER(TRIM("role")) WHERE "role" <> UPPER(TRIM("role"));

    SELECT string_agg(DISTINCT quote_literal("role"), ', ') INTO bad_roles
    FROM "User" WHERE "role" NOT IN ('MEMBER', 'ADMIN');
    IF bad_roles IS NOT NULL THEN
      RAISE EXCEPTION 'User.role contains values outside (MEMBER, ADMIN): %. Update those rows, then run: npx prisma migrate resolve --rolled-back 20261109000000_add_missing_comment_and_admin_schema && npx prisma migrate deploy', bad_roles;
    END IF;

    ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
    ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
    ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
  END IF;
END $$;

-- User.suspendedAt -------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);

-- Post.commentCount ------------------------------------------------------------
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;

-- Comment ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "guestName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");
CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");

DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Post composite indexes ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Post_boardId_status_voteCount_idx" ON "Post"("boardId", "status", "voteCount");
CREATE INDEX IF NOT EXISTS "Post_boardId_isPinned_voteCount_idx" ON "Post"("boardId", "isPinned", "voteCount");

-- Post title trigram index (search + duplicate detection) ------------------------
-- Same definition as 20260615030000_add_posts; no-op where it already exists.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Post_title_trgm_idx" ON "Post" USING gin (title gin_trgm_ops);
