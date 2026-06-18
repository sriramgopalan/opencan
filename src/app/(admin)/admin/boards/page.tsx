import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BoardList } from "@/components/boards/BoardList";
import { BoardSearch } from "@/components/boards/BoardSearch";
import { PaginationNav } from "@/components/boards/PaginationNav";
import { listBoards } from "@/server/repositories/board";

export const metadata: Metadata = { title: "Boards — Admin" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function AdminBoardsPage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim();

  const result = await listBoards({ adminView: true, page, limit: 20, search });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Boards</h1>
        <Link
          href="/admin/boards/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New board
        </Link>
      </div>

      <div className="mb-6">
        <BoardSearch action="/admin/boards" defaultValue={search} />
      </div>

      <BoardList
        boards={result.boards}
        adminView
        ariaLabel="All boards"
        emptyMessage="No boards yet. Create your first one."
      />
      <PaginationNav page={result.page} totalPages={result.totalPages} />
    </main>
  );
}
