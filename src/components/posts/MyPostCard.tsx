import Link from "next/link";

import type { MyPost } from "@/types/post";

import { StatusBadge } from "./StatusBadge";

interface Props {
  post: MyPost;
}

export function MyPostCard({ post }: Props) {
  const href = `/boards/${post.boardSlug}/posts/${post.postNumber}`;
  return (
    <article className="relative flex gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50">
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-label={post.title}
        tabIndex={-1}
      />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-gray-900">{post.title}</span>
          <StatusBadge status={post.status} />
        </div>
        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.description}</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          {post.boardName} · #{post.postNumber} ·{" "}
          {new Date(post.createdAt).toLocaleDateString()} · {post.voteCount}{" "}
          {post.voteCount === 1 ? "vote" : "votes"}
        </p>
      </div>
    </article>
  );
}
