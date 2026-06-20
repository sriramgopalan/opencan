import { Pin } from "lucide-react";
import Link from "next/link";

import type { PostListItem } from "@/types/post";

import { StatusBadge } from "./StatusBadge";
import { VoteButton } from "./VoteButton";

interface Props {
  post: PostListItem;
  boardSlug: string;
}

export function PostCard({ post, boardSlug }: Props) {
  return (
    <article
      className={`relative flex gap-4 rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50 ${
        post.isPinned ? "border-blue-200" : "border-gray-200"
      }`}
    >
      <Link
        href={`/boards/${boardSlug}/posts/${post.postNumber}`}
        className="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-label={post.title}
        tabIndex={-1}
      />

      <div className="relative z-10">
        <VoteButton
          postId={post.id}
          initialVoteCount={post.voteCount}
          initialHasVoted={post.hasVoted}
        />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {post.isPinned && (
            <Pin
              className="h-4 w-4 fill-blue-500 text-blue-500"
              aria-label="Pinned"
            />
          )}
          <span className="truncate font-semibold text-gray-900">
            {post.title}
          </span>
          <StatusBadge status={post.status} />
        </div>

        {post.description && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.description}</p>
        )}

        <p className="mt-2 text-xs text-gray-400">
          #{post.postNumber} · {new Date(post.createdAt).toLocaleDateString()} ·{" "}
          {post.author?.name ?? post.guestName ?? "Anonymous"}
        </p>
      </div>
    </article>
  );
}
