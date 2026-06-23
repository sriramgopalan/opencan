import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/EmptyState";
import { LoadMoreLink } from "@/components/ui/LoadMoreLink";
import { AppError } from "@/lib/errors";
import { isEnabled } from "@/lib/flags";
import { listAllChangelogEntries } from "@/server/repositories/changelog";

export const metadata: Metadata = { title: "Changelog — Admin" };

interface Props {
  searchParams: Promise<{ cursor?: string }>;
}

const STATUS_PILL = {
  published: "bg-green-50 text-green-700",
  draft: "bg-gray-100 text-gray-600",
};

export default async function AdminChangelogPage({ searchParams }: Props) {
  if (!isEnabled("CHANGELOG")) notFound();

  const { cursor } = await searchParams;
  let items: Awaited<ReturnType<typeof listAllChangelogEntries>>["items"] = [];
  let nextCursor: string | null = null;
  try {
    ({ items, nextCursor } = await listAllChangelogEntries({ cursor, limit: 20 }));
  } catch (e) {
    if (e instanceof AppError && e.code === "VALIDATION_ERROR") redirect("/admin/changelog");
    throw e;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Changelog</h1>
        <p className="text-sm text-gray-500">
          Use the tRPC API (<code className="rounded bg-gray-100 px-1 py-0.5">changelog.create</code>) to add entries.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No changelog entries yet" message="Create your first entry via the API." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Posts</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((entry) => {
                const isPublished = entry.publishedAt !== null;
                return (
                  <tr key={entry.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {isPublished ? (
                        <Link
                          href={`/changelog/${entry.slug}`}
                          className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {entry.title}
                        </Link>
                      ) : (
                        entry.title
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">{entry.slug}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          isPublished ? STATUS_PILL.published : STATUS_PILL.draft
                        }`}
                      >
                        {isPublished ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{entry.linkedPostCount}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {isPublished
                        ? (entry.publishedAt as Date).toLocaleDateString()
                        : entry.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <LoadMoreLink href={`/admin/changelog?cursor=${nextCursor}`} />
      )}
    </main>
  );
}
