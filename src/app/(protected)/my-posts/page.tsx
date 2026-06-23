import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { MyPostCard } from "@/components/posts/MyPostCard";
import { isEnabled } from "@/lib/flags";
import { getPostsByAuthor } from "@/server/repositories/post";

export const metadata: Metadata = {
  title: "My Posts — OpenCan",
  description: "Posts you have submitted across all boards.",
};

interface Props {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function MyPostsPage({ searchParams }: Props) {
  if (!isEnabled("MY_POSTS")) notFound();

  const { cursor } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  const result = await getPostsByAuthor(userId, { cursor, limit: 20 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Posts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Posts you&apos;ve submitted across all boards
        </p>
      </header>

      <section aria-label="My posts">
        {result.items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
            <Inbox className="h-8 w-8 text-gray-300" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-gray-900">No posts yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Share your feedback on a board.
            </p>
            <Link
              href="/boards"
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Browse boards
            </Link>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {result.items.map((post) => (
              <li key={post.id}>
                <MyPostCard post={post} />
              </li>
            ))}
          </ul>
        )}

        {result.nextCursor && (
          <div className="mt-6 text-center">
            <Link
              href={`/my-posts?cursor=${result.nextCursor}`}
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
