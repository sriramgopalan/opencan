"use client";

import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/trpc";
import type { PendingPost } from "@/types/admin";

interface PendingPostsTableProps {
  initialPosts: PendingPost[];
}

export function PendingPostsTable({ initialPosts }: PendingPostsTableProps) {
  const [posts, setPosts] = useState(initialPosts);

  const setStatus = api.posts.setStatus.useMutation({
    onSuccess: (data, variables) => {
      setPosts((prev) => prev.filter((p) => p.id !== variables.id));
    },
  });

  if (posts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">No posts pending approval.</p>
    );
  }

  function authorLabel(post: PendingPost): string {
    if (post.author?.name) return post.author.name;
    if (post.guestName) return post.guestName;
    return "Guest";
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Post</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Board</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Author</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Submitted</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {posts.map((post) => (
            <tr key={post.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{post.title}</div>
                {post.description && (
                  <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                    {post.description}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/boards/${post.board.slug}`}
                  className="text-blue-600 hover:underline"
                >
                  {post.board.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">{authorLabel(post)}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(post.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus.mutate({ id: post.id, status: "OPEN" })}
                    disabled={setStatus.isPending}
                    className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus.mutate({ id: post.id, status: "CLOSED" })}
                    disabled={setStatus.isPending}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
