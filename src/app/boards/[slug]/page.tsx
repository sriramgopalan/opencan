import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PostSearch } from "@/components/boards/PostSearch";
import { PostCard } from "@/components/posts/PostCard";
import { PostForm } from "@/components/posts/PostForm";
import { isEnabled } from "@/lib/flags";
import { getBoardBySlug, getBoardBySlugAdmin } from "@/server/repositories/board";
import { listPosts, searchPosts } from "@/server/repositories/post";
import type { PostListItem, PostStatus } from "@/types/post";

const FILTER_STATUSES = ["OPEN", "PLANNED", "IN_PROGRESS", "SHIPPED"] as const;
type FilterStatus = (typeof FILTER_STATUSES)[number];

const STATUS_LABELS: Record<FilterStatus, string> = {
  OPEN: "Open",
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  SHIPPED: "Shipped",
};

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; orderBy?: string; status?: string; q?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return { title: "Board not found — OpenCan" };
  return { title: `${board.name} — OpenCan` };
}

export default async function PublicBoardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { cursor, orderBy, status, q } = await searchParams;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const callerId = session?.user?.id;

  const board = isAdmin ? await getBoardBySlugAdmin(slug) : await getBoardBySlug(slug);
  if (!board) notFound();

  const searchQuery = isEnabled("POST_SEARCH") && q && q.trim().length >= 2 ? q.trim() : undefined;

  const validOrderBy =
    orderBy === "newest" || orderBy === "oldest" ? orderBy : ("votes" as const);

  const validStatus: FilterStatus | undefined = FILTER_STATUSES.includes(status as FilterStatus)
    ? (status as FilterStatus)
    : undefined;

  let items: PostListItem[];
  let nextCursor: string | null = null;

  if (searchQuery) {
    items = await searchPosts(board.id, searchQuery, { isAdmin, callerId, limit: 20 });
  } else {
    const result = await listPosts({
      boardId: board.id,
      orderBy: validOrderBy,
      cursor,
      limit: 20,
      isAdmin,
      callerId,
      statusFilter: validStatus ? [validStatus as PostStatus] : undefined,
    });
    items = result.items;
    nextCursor = result.nextCursor;
  }

  const canPost =
    board.settings.whoCanPost === "ANYONE" ||
    (board.settings.whoCanPost === "AUTHENTICATED" && !!callerId) ||
    (board.settings.whoCanPost === "ADMINS_ONLY" && isAdmin);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500">
        <Link href="/boards" className="hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Boards
        </Link>
        <span className="px-1.5 text-gray-300" aria-hidden="true">
          /
        </span>
        <span className="text-gray-700">{board.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{board.name}</h1>
        {board.description && <p className="mt-1 text-gray-500">{board.description}</p>}
      </header>

      {isEnabled("POST_SEARCH") && (
        <div className="mb-4">
          <PostSearch boardSlug={slug} defaultValue={q} />
        </div>
      )}

      {!searchQuery && (
        <>
          {/* Sort order */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {(["votes", "newest", "oldest"] as const).map((order) => {
              const params = new URLSearchParams({ orderBy: order });
              if (validStatus) params.set("status", validStatus);
              return (
                <Link
                  key={order}
                  href={`/boards/${slug}?${params.toString()}`}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    validOrderBy === order
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {order === "votes" ? "Top" : order === "newest" ? "New" : "Old"}
                </Link>
              );
            })}
          </div>

          {/* Status filter */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Link
              href={`/boards/${slug}?orderBy=${validOrderBy}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !validStatus
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </Link>
            {FILTER_STATUSES.map((s) => {
              const params = new URLSearchParams({ orderBy: validOrderBy, status: s });
              return (
                <Link
                  key={s}
                  href={`/boards/${slug}?${params.toString()}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    validStatus === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {canPost && !searchQuery && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create a post</h2>
          <PostForm boardId={board.id} boardSlug={slug} isAuthenticated={!!callerId} />
        </section>
      )}

      <section aria-label={searchQuery ? `Search results for ${searchQuery}` : "Posts"}>
        {searchQuery && (
          <p className="mb-4 text-sm text-gray-500">
            {items.length === 0
              ? `No posts found for "${searchQuery}"`
              : `${items.length} result${items.length === 1 ? "" : "s"} for "${searchQuery}"`}
          </p>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
            <Inbox className="h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-900">
              {searchQuery
                ? `No posts match "${searchQuery}"`
                : validStatus
                  ? `No ${STATUS_LABELS[validStatus].toLowerCase()} posts`
                  : "No posts yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? "Try a different search term."
                : validStatus
                  ? "Try a different filter."
                  : "Be the first to share your feedback."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {items.map((post) => (
              <li key={post.id}>
                <PostCard post={post} boardSlug={slug} />
              </li>
            ))}
          </ul>
        )}

        {nextCursor && (
          <div className="mt-6 text-center">
            <Link
              href={`/boards/${slug}?orderBy=${validOrderBy}${validStatus ? `&status=${validStatus}` : ""}&cursor=${nextCursor}`}
              className="inline-flex rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Load more
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
