import type { Metadata } from "next";

import { StatsCard } from "@/components/admin/StatsCard";
import { getWorkspaceStats } from "@/server/repositories/admin";

export const metadata: Metadata = { title: "Admin Overview" };

export default async function AdminOverviewPage() {
  const stats = await getWorkspaceStats();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-gray-900">Overview</h1>

      <section aria-labelledby="totals-heading" className="mb-10">
        <h2 id="totals-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Totals
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatsCard label="Users" value={stats.totalUsers} />
          <StatsCard label="Boards" value={stats.totalBoards} />
          <StatsCard label="Posts" value={stats.totalPosts} />
          <StatsCard label="Votes" value={stats.totalVotes} />
          <StatsCard label="Comments" value={stats.totalComments} />
        </div>
      </section>

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Last 30 days
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatsCard label="New posts" value={stats.newPostsLast30Days} />
          <StatsCard label="New users" value={stats.newUsersLast30Days} />
        </div>
      </section>
    </main>
  );
}
