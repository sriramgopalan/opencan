import { BoardCard } from "@/components/boards/BoardCard";
import type { BoardListItem } from "@/types/board";

interface Props {
  boards: BoardListItem[];
  adminView?: boolean;
  emptyMessage?: string;
  ariaLabel?: string;
}

export function BoardList({
  boards,
  adminView = false,
  emptyMessage = "No boards found.",
  ariaLabel,
}: Props) {
  if (boards.length === 0) {
    return <p>{emptyMessage}</p>;
  }
  return (
    <ul aria-label={ariaLabel}>
      {boards.map((board) => (
        <li key={board.id}>
          <BoardCard board={board} adminView={adminView} />
        </li>
      ))}
    </ul>
  );
}
