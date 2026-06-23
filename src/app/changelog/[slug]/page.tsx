import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CardLink } from "@/components/ui/CardLink";
import { isEnabled } from "@/lib/flags";
import { renderMarkdown } from "@/lib/markdown";
import { getChangelogEntryBySlug } from "@/server/repositories/changelog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isEnabled("CHANGELOG")) return { title: "Not found — OpenCan" };
  const { slug } = await params;
  const entry = await getChangelogEntryBySlug(slug);
  if (!entry) return { title: "Not found — OpenCan" };
  return { title: `${entry.title} — Changelog — OpenCan` };
}

export default async function ChangelogEntryPage({ params }: Props) {
  if (!isEnabled("CHANGELOG")) notFound();

  const { slug } = await params;
  const entry = await getChangelogEntryBySlug(slug);
  if (!entry) notFound();

  const bodyHtml = renderMarkdown(entry.body);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
        <Link
          href="/changelog"
          className="inline-flex items-center gap-1 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Changelog
        </Link>
      </nav>

      <article>
        <header className="mb-8">
          <time
            dateTime={entry.publishedAt.toISOString()}
            className="text-sm font-medium uppercase tracking-wide text-blue-600"
          >
            {entry.publishedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{entry.title}</h1>
          {entry.authorName && (
            <p className="mt-2 text-sm text-gray-500">By {entry.authorName}</p>
          )}
        </header>

        {/* nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
            bodyHtml is the output of renderMarkdown(), which pipes marked through sanitize-html with an
            explicit allowedTags + allowedAttributes allowlist — script injection is not possible. */}
        <div
          className="prose prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: bodyHtml }} // nosemgrep
        />

        {entry.linkedPosts.length > 0 && (
          <section className="mt-10 border-t border-gray-100 pt-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Related posts
            </h2>
            <ul className="space-y-2" role="list">
              {entry.linkedPosts.map((post) => (
                <li key={post.id}>
                  <CardLink
                    href={`/boards/${post.boardSlug}/posts/${post.postNumber}`}
                    label={post.title}
                    sublabel={`${post.boardName} #${post.postNumber}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
