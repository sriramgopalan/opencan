"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/posts/StatusBadge";
import { api } from "@/lib/trpc";
import type { AdminPost } from "@/types/admin";

interface Props {
  initialPosts: AdminPost[];
  page: number;
  totalPages: number;
  /** Current status filter value for pagination links */
  statusParam: string;
}

function authorLabel(post: AdminPost): string {
  if (post.author?.name) return post.author.name;
  if (post.guestName) return post.guestName;
  return "Guest";
}

function pageHref(p: number, statusParam: string) {
  const params = new URLSearchParams({ status: statusParam, page: String(p) });
  return `/admin/posts?${params.toString()}`;
}

export function AllPostsTable({ initialPosts, page, totalPages, statusParam }: Props) {
  const [posts, setPosts] = useState(initialPosts);

  const setStatus = api.posts.setStatus.useMutation({
    onSuccess: (data, variables) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === variables.id ? { ...p, status: data.status } : p,
        ),
      );
    },
  });

  if (posts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">No posts found.</p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Board</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Title</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Author</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/boards/${post.board.slug}`}
                    className="text-blue-600 hover:underline"
                  >
                    {post.board.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/boards/${post.board.slug}/posts/${post.postNumber}`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    {post.title}
                  </Link>
                  {post.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                      {post.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{authorLabel(post)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(post.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={post.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {post.status === "PENDING" ? (
                      <>
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
                      </>
                    ) : (
                      <Link
                        href={`/boards/${post.board.slug}/posts/${post.postNumber}`}
                        className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      >
                        Manage →
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={pageHref(page - 1, statusParam)} className="rounded px-3 py-1 hover:bg-gray-100">
                Previous
              </a>
            )}
            {page < totalPages && (
              <a href={pageHref(page + 1, statusParam)} className="rounded px-3 py-1 hover:bg-gray-100">
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
