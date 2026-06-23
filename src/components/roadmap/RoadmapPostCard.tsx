import Link from "next/link";

import type { RoadmapPost } from "@/types/post";

interface Props {
  post: RoadmapPost;
}

export function RoadmapPostCard({ post }: Props) {
  return (
    <article className="relative rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50">
      <Link
        href={`/boards/${post.boardSlug}/posts/${post.postNumber}`}
        className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-label={post.title}
        tabIndex={-1}
      />

      <p className="truncate font-medium text-gray-900">{post.title}</p>

      {post.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.description}</p>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        <span>{post.voteCount} vote{post.voteCount !== 1 ? "s" : ""}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{post.boardName}</span>
      </div>
    </article>
  );
}
