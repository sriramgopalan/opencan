import { Search, X } from "lucide-react";
import Link from "next/link";

interface Props {
  boardSlug: string;
  defaultValue?: string;
}

export function PostSearch({ boardSlug, defaultValue }: Props) {
  return (
    <form action={`/boards/${boardSlug}`} method="get" role="search" className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search posts…"
        minLength={2}
        aria-label="Search posts"
        className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {defaultValue && (
        <Link
          href={`/boards/${boardSlug}`}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </form>
  );
}
