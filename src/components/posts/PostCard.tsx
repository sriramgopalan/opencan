import Link from "next/link";

import type { PostListItem } from "@/types/post";

import { StatusBadge } from "./StatusBadge";

interface Props {
  post: PostListItem;
  boardSlug: string;
}

export function PostCard({ post, boardSlug }: Props) {
  return (
    <article
      className={`flex gap-4 rounded-lg border bg-white p-4 shadow-sm ${
        post.isPinned ? "border-blue-200 bg-blue-50" : "border-gray-200"
      }`}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span
          className="text-2xl font-semibold leading-none text-gray-600"
          aria-label={`${post.voteCount} votes`}
        >
          {post.voteCount}
        </span>
        <span className="text-xs text-gray-400">votes</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {post.isPinned && (
            <span aria-label="Pinned" className="text-blue-500" title="Pinned">
              📌
            </span>
          )}
          <Link
            href={`/boards/${boardSlug}/posts/${post.postNumber}`}
            className="truncate text-base font-semibold text-gray-900 hover:text-blue-600 hover:underline"
          >
            {post.title}
          </Link>
          <StatusBadge status={post.status} />
        </div>

        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-600">{post.description}</p>
        )}

        <p className="mt-1 text-xs text-gray-400">
          #{post.postNumber} · {new Date(post.createdAt).toLocaleDateString()}
          {post.author?.name && ` · ${post.author.name}`}
          {!post.author && post.guestName && ` · ${post.guestName}`}
        </p>
      </div>
    </article>
  );
}
