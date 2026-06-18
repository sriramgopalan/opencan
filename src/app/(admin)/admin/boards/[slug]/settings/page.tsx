import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { BoardSettingsForm } from "@/components/boards/BoardSettingsForm";
import { DeleteBoardDialog } from "@/components/boards/DeleteBoardDialog";
import { getBoardBySlugAdmin } from "@/server/repositories/board";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoardBySlugAdmin(slug);
  if (!board) return { title: "Board not found — Admin" };
  return { title: `${board.name} settings — Admin` };
}

export default async function BoardSettingsPage({ params }: Props) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const { slug } = await params;
  const board = await getBoardBySlugAdmin(slug);
  if (!board) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-gray-500">
        <Link href="/admin" className="hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Admin
        </Link>
        <span className="px-1.5 text-gray-300" aria-hidden="true">/</span>
        <Link href="/admin/boards" className="hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Boards
        </Link>
        <span className="px-1.5 text-gray-300" aria-hidden="true">/</span>
        <span className="text-gray-700">{board.name}</span>
        <span className="px-1.5 text-gray-300" aria-hidden="true">/</span>
        <span className="text-gray-700">Settings</span>
      </nav>

      <div className="mb-6 mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {board.name} — Settings
        </h1>
        <Link
          href="/admin/boards"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back to boards
        </Link>
      </div>

      <div className="space-y-6">
        <section
          aria-labelledby="settings-heading"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 id="settings-heading" className="mb-5 text-base font-semibold text-gray-900">
            Board settings
          </h2>
          <BoardSettingsForm board={board} />
        </section>

        <section
          aria-labelledby="danger-heading"
          className="rounded-xl border border-red-200 bg-red-50 p-6"
        >
          <h2 id="danger-heading" className="mb-5 text-base font-semibold text-gray-900">
            Danger zone
          </h2>
          <DeleteBoardDialog boardId={board.id} boardSlug={board.slug} />
        </section>
      </div>
    </main>
  );
}
