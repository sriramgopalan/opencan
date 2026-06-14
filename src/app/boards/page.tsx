import type { Metadata } from "next";

import { BoardList } from "@/components/boards/BoardList";
import { PaginationNav } from "@/components/boards/PaginationNav";
import { listBoards } from "@/server/repositories/board";

export const metadata: Metadata = { title: "Boards — Etash" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function BoardsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim();

  const result = await listBoards({ adminView: false, page, limit: 20, search });

  return (
    <main>
      <h1>Boards</h1>
      <BoardList boards={result.boards} ariaLabel="Public boards" emptyMessage="No boards found." />
      <PaginationNav page={result.page} totalPages={result.totalPages} />
    </main>
  );
}
