import { Rss } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ChangelogCard } from "@/components/changelog/ChangelogCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadMoreLink } from "@/components/ui/LoadMoreLink";
import { AppError } from "@/lib/errors";
import { isEnabled } from "@/lib/flags";
import { listChangelogEntries } from "@/server/repositories/changelog";

export const metadata: Metadata = { title: "Changelog — OpenCan" };

interface Props {
  searchParams: Promise<{ cursor?: string }>;
}

export default async function ChangelogIndexPage({ searchParams }: Props) {
  if (!isEnabled("CHANGELOG")) notFound();

  const { cursor } = await searchParams;
  let items: Awaited<ReturnType<typeof listChangelogEntries>>["items"] = [];
  let nextCursor: string | null = null;
  try {
    ({ items, nextCursor } = await listChangelogEntries({ cursor, limit: 10 }));
  } catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION_ERROR") redirect("/changelog");
    throw e;
  }

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
        <EmptyState title="No entries yet" message="Check back soon for updates." />
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
        <LoadMoreLink href={`/changelog?cursor=${nextCursor}`} className="mt-8 text-center" />
      )}
    </main>
  );
}
