import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BoardList } from "@/components/boards/BoardList";
import { PaginationNav } from "@/components/boards/PaginationNav";
import { listBoards } from "@/server/repositories/board";

export const metadata: Metadata = { title: "Boards — Dashboard" };

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function DashboardBoardsPage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const search = params.search?.trim();

  const result = await listBoards({ adminView: true, page, limit: 20, search });

  return (
    <main>
      <div>
        <h1>Boards</h1>
        <Link href="/dashboard/boards/new">New board</Link>
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
