import { Inbox } from "lucide-react";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PostCard } from "@/components/posts/PostCard";
import { PostForm } from "@/components/posts/PostForm";
import { getBoardBySlug } from "@/server/repositories/board";
import { listPosts } from "@/server/repositories/post";

interface Props {
  params: Promise<{ boardSlug: string }>;
}

export default async function EmbedBoardPage({ params }: Props) {
  const { boardSlug } = await params;
  const session = await auth();
  const callerId = session?.user?.id;

  const board = await getBoardBySlug(boardSlug);
  if (!board) notFound();

  const { items } = await listPosts({
    boardId: board.id,
    isAdmin: false,
    callerId,
    limit: 20,
  });

  const { whoCanPost } = board.settings;
  const canPost = whoCanPost === "ANYONE" || (whoCanPost === "AUTHENTICATED" && !!callerId);

  return (
    <main className="flex h-full flex-col overflow-auto p-4">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">{board.name}</h1>

      {canPost && (
        <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <PostForm boardId={board.id} boardSlug={boardSlug} isAuthenticated={!!callerId} />
        </section>
      )}

      <section aria-label="Posts">
        {items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-12 text-center">
            <Inbox className="h-7 w-7 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-900">No posts yet</p>
            <p className="mt-1 text-sm text-gray-500">Be the first to share your feedback.</p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {items.map((post) => (
              <li key={post.id}>
                <PostCard post={post} boardSlug={boardSlug} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
