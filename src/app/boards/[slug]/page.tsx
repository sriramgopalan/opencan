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
  if (!board) return { title: "Board not found — Etash" };
  return { title: `${board.name} — Etash` };
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
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{board.name}</h1>
        {board.description && <p className="mt-1 text-gray-600">{board.description}</p>}
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
          <p className="text-center text-gray-500">No posts yet. Be the first!</p>
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
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Load more
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
