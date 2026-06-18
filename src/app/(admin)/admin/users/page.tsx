import type { Metadata } from "next";

import { UserTable } from "@/components/admin/UserTable";
import { listAdminUsers } from "@/server/repositories/admin";

export const metadata: Metadata = { title: "Users — Admin" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim();

  const result = await listAdminUsers({ page, limit: 20, search });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
      </div>

      <form method="get" className="mb-6">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search by name or email…"
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </form>

      <UserTable
        initialUsers={result.users}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        search={search}
      />
    </main>
  );
}
