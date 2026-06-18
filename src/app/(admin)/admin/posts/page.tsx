import type { Metadata } from "next";

import { PendingPostsTable } from "@/components/admin/PendingPostsTable";
import { listPendingPosts } from "@/server/repositories/admin";

export const metadata: Metadata = { title: "Post Moderation — Admin" };

export default async function AdminPostsPage() {
  const posts = await listPendingPosts();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Post moderation</h1>
        <span className="text-sm text-gray-500">
          {posts.length} pending
        </span>
      </div>

      <PendingPostsTable initialPosts={posts} />
    </main>
  );
}
