-- Backfills schema that reached prisma/schema.prisma without a migration
-- (comments feature #16, admin feature #17). CI and `dev:setup` use `db push`,
-- so the gap only shows up with `prisma migrate deploy` (the Docker entrypoint):
-- fresh installs had no Comment table, no Post.commentCount, no User.suspendedAt,
-- and User.role as TEXT instead of the Role enum.
--
-- Every statement is idempotent so this also applies cleanly to databases whose
-- schema was already brought up to date with `prisma db push`.
--
-- Post_title_trgm_idx (GIN, pg_trgm) is intentionally untouched: it is managed by
-- 20260615030000_add_posts and is not declarable in schema.prisma.

-- Role enum ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User.role: TEXT -> "Role", preserving existing values (no admin is demoted).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'User'
      AND column_name = 'role' AND data_type = 'text'
  ) THEN
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
