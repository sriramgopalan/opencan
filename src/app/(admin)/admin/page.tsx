import type { Metadata } from "next";

import { ActivityChart } from "@/components/admin/ActivityChart";
import { NeedsAttention } from "@/components/admin/NeedsAttention";
import { RecentSignups } from "@/components/admin/RecentSignups";
import { StatsCard } from "@/components/admin/StatsCard";
import { StatusBreakdownBar } from "@/components/admin/StatusBreakdownBar";
import { TopList, type TopListItem } from "@/components/admin/TopList";
import {
  getActivityTimeseries,
  getPendingPostCount,
  getPostStatusBreakdown,
  getRecentUsers,
  getTopBoards,
  getTopPosts,
  getWorkspaceStats,
} from "@/server/repositories/admin";

export const metadata: Metadata = { title: "Admin Overview" };

const DELTA_LABEL = "vs prior 30d";

export default async function AdminOverviewPage() {
  const [stats, activity, breakdown, topPosts, topBoards, recentUsers, pendingPosts] =
    await Promise.all([
      getWorkspaceStats(),
      getActivityTimeseries(30),
      getPostStatusBreakdown(),
      getTopPosts(5),
      getTopBoards(5),
      getRecentUsers(5),
      getPendingPostCount(),
    ]);

  const postItems: TopListItem[] = topPosts.map((p) => ({
    id: p.id,
    label: p.title,
    sublabel: p.board.name,
    href: `/boards/${p.board.slug}/posts/${p.postNumber}`,
    metric: `${p.voteCount.toLocaleString()} ▲`,
  }));

  const boardItems: TopListItem[] = topBoards.map((b) => ({
    id: b.id,
    label: b.name,
    href: `/admin/boards/${b.slug}/settings`,
    metric: `${b.postCount.toLocaleString()} posts`,
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-gray-900">Overview</h1>

      <NeedsAttention pendingPosts={pendingPosts} />

      <section aria-labelledby="totals-heading" className="mb-10">
        <h2 id="totals-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Totals
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatsCard label="Users" value={stats.totalUsers} delta={stats.newUsersLast30Days - stats.newUsersPrev30Days} deltaLabel={DELTA_LABEL} />
          <StatsCard label="Posts" value={stats.totalPosts} delta={stats.newPostsLast30Days - stats.newPostsPrev30Days} deltaLabel={DELTA_LABEL} />
          <StatsCard label="Votes" value={stats.totalVotes} delta={stats.newVotesLast30Days - stats.newVotesPrev30Days} deltaLabel={DELTA_LABEL} />
          <StatsCard label="Comments" value={stats.totalComments} delta={stats.newCommentsLast30Days - stats.newCommentsPrev30Days} deltaLabel={DELTA_LABEL} />
          <StatsCard label="Boards" value={stats.totalBoards} />
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="mb-10">
        <h2 id="activity-heading" className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Activity — last 30 days
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <ActivityChart data={activity} />
        </div>
      </section>

      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardPanel heading="Posts by status">
          <StatusBreakdownBar items={breakdown} />
        </DashboardPanel>
        <DashboardPanel heading="Top boards">
          <TopList items={boardItems} emptyMessage="No boards yet." />
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardPanel heading="Top posts">
          <TopList items={postItems} emptyMessage="No posts yet." />
        </DashboardPanel>
        <DashboardPanel heading="Recent signups">
          <RecentSignups users={recentUsers} />
        </DashboardPanel>
      </div>
    </main>
  );
}

function DashboardPanel({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">{heading}</h2>
      {children}
    </section>
  );
}
