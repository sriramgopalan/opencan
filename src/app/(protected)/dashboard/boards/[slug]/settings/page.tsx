import type { Metadata } from "next";
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
  if (!board) return { title: "Board not found — Dashboard" };
  return { title: `${board.name} settings — Dashboard` };
}

export default async function BoardSettingsPage({ params }: Props) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  const { slug } = await params;
  const board = await getBoardBySlugAdmin(slug);
  if (!board) notFound();

  return (
    <main>
      <h1>{board.name} — Settings</h1>

      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading">Board settings</h2>
        <BoardSettingsForm board={board} />
      </section>

      <section aria-labelledby="danger-heading">
        <h2 id="danger-heading">Danger zone</h2>
        <DeleteBoardDialog boardId={board.id} boardSlug={board.slug} />
      </section>
    </main>
  );
}
