import type { Metadata } from "next";

import { BoardList } from "@/components/boards/BoardList";
import { BoardSearch } from "@/components/boards/BoardSearch";
import { PaginationNav } from "@/components/boards/PaginationNav";
import { listBoards } from "@/server/repositories/board";

export const metadata: Metadata = { title: "Boards — OpenCan" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function BoardsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim();

  const result = await listBoards({ adminView: false, page, limit: 20, search });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Boards</h1>
        <p className="mt-1 text-sm text-gray-500">Browse and vote on feedback</p>
      </header>

      <div className="mb-6">
        <BoardSearch action="/boards" defaultValue={search} />
      </div>

      <BoardList boards={result.boards} ariaLabel="Public boards" emptyMessage="No boards found." />
      <PaginationNav page={result.page} totalPages={result.totalPages} />
    </main>
  );
}
