import type { Metadata } from "next";

import { RoadmapColumn } from "@/components/roadmap/RoadmapColumn";
import { getRoadmapPosts } from "@/server/repositories/post";
import type { PostStatus, RoadmapPost } from "@/types/post";

export const metadata: Metadata = {
  title: "Roadmap — OpenCan",
  description: "See what's under review, planned, in progress, and shipped.",
};

const ROADMAP_COLUMNS: { status: PostStatus; label: string }[] = [
  { status: "UNDER_REVIEW", label: "Under Review" },
  { status: "PLANNED", label: "Planned" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "SHIPPED", label: "Shipped" },
];

const PER_COLUMN_LIMIT = 20;

export default async function RoadmapPage() {
  const posts = await getRoadmapPosts();

  const byStatus = new Map<PostStatus, RoadmapPost[]>(
    ROADMAP_COLUMNS.map(({ status }) => [
      status,
      posts.filter((p) => p.status === status).slice(0, PER_COLUMN_LIMIT),
    ]),
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Roadmap</h1>
        <p className="mt-1 text-gray-500">
          Track what{"'"}s in progress, planned, and shipped across all our boards.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {ROADMAP_COLUMNS.map(({ status, label }) => (
          <RoadmapColumn
            key={status}
            label={label}
            status={status}
            posts={byStatus.get(status) ?? []}
          />
        ))}
      </div>
    </main>
  );
}
