import type { PostStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { AllPostsTable } from "@/components/admin/AllPostsTable";
import { PendingPostsTable } from "@/components/admin/PendingPostsTable";
import { listAllPosts, listPendingPosts } from "@/server/repositories/admin";

export const metadata: Metadata = { title: "Posts — Admin" };

const ALL_TAB = "ALL";

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: ALL_TAB },
  { label: "Pending", value: "PENDING" },
  { label: "Open", value: "OPEN" },
  { label: "Under Review", value: "UNDER_REVIEW" },
  { label: "Planned", value: "PLANNED" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Closed", value: "CLOSED" },
];

const VALID_STATUS_VALUES = STATUS_TABS.map((t) => t.value);

interface Props {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminPostsPage({ searchParams }: Props) {
  const { status: statusParam, page: pageParam } = await searchParams;

  const activeTab =
    statusParam && VALID_STATUS_VALUES.includes(statusParam) ? statusParam : "PENDING";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const isPendingTab = activeTab === "PENDING";
  const isAllTab = activeTab === ALL_TAB;

  // Fetch data for the active tab
  const [pendingPosts, allPostsResult] = await Promise.all([
    isPendingTab ? listPendingPosts() : Promise.resolve(null),
    !isPendingTab
      ? listAllPosts({
          status: isAllTab ? undefined : (activeTab as PostStatus),
          page,
          limit: 20,
        })
      : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Posts</h1>
        {isPendingTab && pendingPosts && (
          <span className="text-sm text-gray-500">
            {pendingPosts.length} pending
          </span>
        )}
        {!isPendingTab && allPostsResult && (
          <span className="text-sm text-gray-500">
            {allPostsResult.total} post{allPostsResult.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5 border-b border-gray-200 pb-3">
        {STATUS_TABS.map(({ label, value }) => (
          <Link
            key={value}
            href={`/admin/posts?status=${value}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeTab === value
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {isPendingTab && pendingPosts !== null && (
        <PendingPostsTable initialPosts={pendingPosts} />
      )}

      {!isPendingTab && allPostsResult !== null && (
        <AllPostsTable
          initialPosts={allPostsResult.posts}
          page={allPostsResult.page}
          totalPages={allPostsResult.totalPages}
          statusParam={activeTab}
        />
      )}
    </main>
  );
}
