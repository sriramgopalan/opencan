import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { BoardListItem } from "@/types/board";

interface Props {
  board: BoardListItem;
  adminView?: boolean;
}

export function BoardCard({ board, adminView = false }: Props) {
  const href = adminView
    ? `/admin/boards/${board.slug}/settings`
    : `/boards/${board.slug}`;

  return (
    <Link
      href={href}
      className="group block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900">{board.name}</h2>
          {board.description && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{board.description}</p>
          )}
        </div>
        <ArrowRight
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
          aria-hidden="true"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {adminView && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {board.postCount} {board.postCount === 1 ? "post" : "posts"}
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            board.isPublic ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {board.isPublic ? "Public" : "Private"}
        </span>
        {adminView && board.isListed && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            Listed
          </span>
        )}
      </div>
    </Link>
  );
}
