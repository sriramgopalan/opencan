import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MyPostCard } from "@/components/posts/MyPostCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadMoreLink } from "@/components/ui/LoadMoreLink";
import { AppError } from "@/lib/errors";
import { getPostsByAuthor } from "@/server/repositories/post";

export const metadata: Metadata = {
  title: "My Posts — OpenCan",
  description: "Posts you have submitted across all boards.",
};

interface Props {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function MyPostsPage({ searchParams }: Props) {
  const { cursor } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  let result: Awaited<ReturnType<typeof getPostsByAuthor>>;
  try {
    result = await getPostsByAuthor(userId, { cursor, limit: 20 });
  } catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION_ERROR") redirect("/my-posts");
    throw e;
  }

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
          <EmptyState
            icon={<Inbox className="h-8 w-8 text-gray-300" aria-hidden="true" />}
            title="No posts yet"
            message="Share your feedback on a board."
            cta={{ href: "/boards", label: "Browse boards" }}
          />
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
          <LoadMoreLink href={`/my-posts?cursor=${result.nextCursor}`} />
        )}
      </section>
    </main>
  );
}
