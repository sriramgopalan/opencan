import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PostCard } from "@/components/posts/PostCard";
import { PostForm } from "@/components/posts/PostForm";
import { getBoardBySlug, getBoardBySlugAdmin } from "@/server/repositories/board";
import { listPosts } from "@/server/repositories/post";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string; orderBy?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return { title: "Board not found — OpenCan" };
  return { title: `${board.name} — OpenCan` };
}

export default async function PublicBoardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { cursor, orderBy } = await searchParams;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const callerId = session?.user?.id;

  const board = isAdmin ? await getBoardBySlugAdmin(slug) : await getBoardBySlug(slug);
  if (!board) notFound();

  const validOrderBy =
    orderBy === "newest" || orderBy === "oldest" ? orderBy : ("votes" as const);

  const result = await listPosts({
    boardId: board.id,
    orderBy: validOrderBy,
    cursor,
    limit: 20,
    isAdmin,
    callerId,
    // IP-based hasVoted for guests omitted in RSC — VoteButton handles state client-side
  });

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

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {(["votes", "newest", "oldest"] as const).map((order) => (
          <Link
            key={order}
            href={`/boards/${slug}?orderBy=${order}`}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              validOrderBy === order
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {order === "votes" ? "Top" : order === "newest" ? "New" : "Old"}
          </Link>
        ))}
      </div>

      {canPost && (
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Submit feedback</h2>
          <PostForm boardId={board.id} boardSlug={slug} isAuthenticated={!!callerId} />
        </section>
      )}

      <section aria-label="Posts">
        {result.items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
            <Inbox className="h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-900">No posts yet</p>
            <p className="mt-1 text-sm text-gray-500">Be the first to share your feedback.</p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {result.items.map((post) => (
              <li key={post.id}>
                <PostCard post={post} boardSlug={slug} />
              </li>
            ))}
          </ul>
        )}

        {result.nextCursor && (
          <div className="mt-6 text-center">
            <Link
              href={`/boards/${slug}?orderBy=${validOrderBy}&cursor=${result.nextCursor}`}
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
