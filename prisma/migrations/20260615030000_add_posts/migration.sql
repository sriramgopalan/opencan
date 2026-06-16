-- Enable pg_trgm for similarity() used in posts.getSimilar
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING', 'OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'CLOSED');

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "postNumber" INTEGER NOT NULL,
    "boardId" TEXT NOT NULL,
    "authorId" TEXT,
    "guestName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'OPEN',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_boardId_postNumber_key" ON "Post"("boardId", "postNumber");

-- CreateIndex
CREATE INDEX "Post_boardId_status_idx" ON "Post"("boardId", "status");

-- CreateIndex
CREATE INDEX "Post_boardId_voteCount_idx" ON "Post"("boardId", "voteCount");

-- CreateIndex
CREATE INDEX "Post_boardId_createdAt_idx" ON "Post"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_boardId_isPinned_idx" ON "Post"("boardId", "isPinned");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- GIN trigram index for posts.getSimilar (pg_trgm similarity search)
CREATE INDEX "Post_title_trgm_idx" ON "Post" USING gin (title gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Vote_postId_userId_key" ON "Vote"("postId", "userId");

-- CreateIndex
CREATE INDEX "Vote_postId_idx" ON "Vote"("postId");

-- CreateIndex
CREATE INDEX "Vote_userId_idx" ON "Vote"("userId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
