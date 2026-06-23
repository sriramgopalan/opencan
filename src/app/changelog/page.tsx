import { Rss } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangelogCard } from "@/components/changelog/ChangelogCard";
import { isEnabled } from "@/lib/flags";
import { listChangelogEntries } from "@/server/repositories/changelog";

export const metadata: Metadata = { title: "Changelog — OpenCan" };

interface Props {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function ChangelogIndexPage({ searchParams }: Props) {
  if (!isEnabled("CHANGELOG")) notFound();

  const { cursor } = await searchParams;
  const { items, nextCursor } = await listChangelogEntries({ cursor, limit: 10 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Changelog</h1>
          <p className="mt-1 text-gray-500">Updates and improvements to OpenCan</p>
        </div>
        <Rss className="h-5 w-5 text-gray-300" aria-hidden="true" />
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-gray-900">No entries yet</p>
          <p className="mt-1 text-sm text-gray-500">Check back soon for updates.</p>
        </div>
      ) : (
        <ul className="space-y-4" role="list">
          {items.map((entry) => (
            <li key={entry.id}>
              <ChangelogCard entry={entry} />
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-8 text-center">
          <Link
            href={`/changelog?cursor=${nextCursor}`}
            className="inline-flex rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
