import type { PostStatus, RoadmapPost } from "@/types/post";

import { RoadmapPostCard } from "./RoadmapPostCard";

interface Props {
  label: string;
  status: PostStatus;
  posts: RoadmapPost[];
}

export function RoadmapColumn({ label, status, posts }: Props) {
  return (
    <section aria-labelledby={`col-${status}`} className="flex min-w-0 flex-col gap-3">
      <h2
        id={`col-${status}`}
        className="text-sm font-semibold uppercase tracking-wide text-gray-500"
      >
        {label}
        <span className="ml-2 font-normal text-gray-400">({posts.length})</span>
      </h2>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
          Nothing here yet
        </p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {posts.map((post) => (
            <li key={post.id}>
              <RoadmapPostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
