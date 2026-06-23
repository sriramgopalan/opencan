import Link from "next/link";

import type { ChangelogEntryListItem } from "@/types/changelog";

interface Props {
  entry: ChangelogEntryListItem;
}

export function ChangelogCard({ entry }: Props) {
  const href = `/changelog/${entry.slug}`;
  return (
    <article className="relative rounded-lg border border-gray-200 bg-white p-6 transition-colors hover:bg-gray-50">
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-label={entry.title}
        tabIndex={-1}
      />
      <div className="relative z-10">
        <time
          dateTime={entry.publishedAt.toISOString()}
          className="text-xs font-medium uppercase tracking-wide text-blue-600"
        >
          {entry.publishedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">{entry.title}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {entry.authorName && `By ${entry.authorName}`}
          {entry.linkedPostCount > 0 && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {entry.linkedPostCount} linked {entry.linkedPostCount === 1 ? "post" : "posts"}
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
