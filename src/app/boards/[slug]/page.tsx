import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBoardBySlug } from "@/server/repositories/board";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) return { title: "Board not found — Etash" };
  return { title: `${board.name} — Etash` };
}

export default async function PublicBoardPage({ params }: Props) {
  const { slug } = await params;
  const board = await getBoardBySlug(slug);
  if (!board) notFound();

  return (
    <main>
      <h1>{board.name}</h1>
      {board.description && <p>{board.description}</p>}
      <section aria-label="Posts">
        <p>No posts yet.</p>
      </section>
    </main>
  );
}
