import Link from "next/link";

import type { BoardListItem } from "@/types/board";

interface Props {
  board: BoardListItem;
  adminView?: boolean;
}

export function BoardCard({ board, adminView = false }: Props) {
  const href = adminView
    ? `/dashboard/boards/${board.slug}/settings`
    : `/boards/${board.slug}`;

  return (
    <article>
      <Link href={href}>
        <h2>{board.name}</h2>
      </Link>
      {board.description && <p>{board.description}</p>}
      {adminView && (
        <div aria-label="Board visibility">
          <span>{board.isPublic ? "Public" : "Private"}</span>
          {board.isListed && <span>Listed</span>}
        </div>
      )}
    </article>
  );
}
