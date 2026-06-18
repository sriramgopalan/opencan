import { Pin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { CommentList } from "@/components/comments/CommentList";
import { StatusBadge } from "@/components/posts/StatusBadge";
import { VoteButton } from "@/components/posts/VoteButton";
import { getPostByNumber } from "@/server/repositories/post";
import type { AdminPostView } from "@/types/post";

interface Props {
  params: Promise<{ slug: string; postNumber: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postNumber } = await params;
  const num = parseInt(postNumber, 10);
  if (isNaN(num)) return { title: "Post not found — OpenCan" };
  const post = await getPostByNumber(slug, num, { isAdmin: false });
  if (!post) return { title: "Post not found — OpenCan" };
  return { title: `${post.title} — OpenCan` };
}

export default async function PostDetailPage({ params }: Props) {
  const { slug, postNumber } = await params;
  const num = parseInt(postNumber, 10);
  if (isNaN(num)) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const callerId = session?.user?.id;
  const isSignedIn = !!session?.user;

  const post = await getPostByNumber(slug, num, { isAdmin, callerId });
  if (!post) notFound();

  const adminPost = isAdmin ? (post as AdminPostView) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-2 text-sm text-gray-500">
          <li>
            <Link href="/boards" className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
              Boards
            </Link>
          </li>
          <li aria-hidden="true" className="text-gray-300">/</li>
          <li>
            <Link href={`/boards/${slug}`} className="hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {slug}
            </Link>
          </li>
          <li aria-hidden="true" className="text-gray-300">/</li>
          <li aria-current="page" className="text-gray-700">
            #{post.postNumber}
          </li>
        </ol>
      </nav>

      <article className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <VoteButton
            postId={post.id}
            initialVoteCount={post.voteCount}
            initialHasVoted={post.hasVoted}
          />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {post.isPinned && (
                <Pin
                  className="h-4 w-4 fill-blue-500 text-blue-500"
                  aria-label="Pinned"
                />
              )}
              <h1 className="text-xl font-bold text-gray-900">{post.title}</h1>
              <StatusBadge status={post.status} />
            </div>

            <p className="text-sm text-gray-500">
              #{post.postNumber}
              {post.guestName && ` · ${post.guestName}`}
              {adminPost?.author?.name && ` · ${adminPost.author.name}`}
              {adminPost?.author?.email && (
                <span className="ml-1 text-gray-400">({adminPost.author.email})</span>
              )}
              {" · "}
              {new Date(post.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        {post.description && (
          <div className="mt-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{post.description}</p>
          </div>
        )}
      </article>

      <section
        aria-labelledby="comments-heading"
        className="mt-6 rounded-xl border border-gray-200 bg-white p-6"
      >
        <h2
          id="comments-heading"
          className="mb-4 text-base font-semibold text-gray-900"
        >
          Comments
        </h2>
        <CommentList
          postId={post.id}
          callerId={callerId}
          isAdmin={isAdmin}
          isSignedIn={isSignedIn}
        />
      </section>

      {isAdmin && (
        <section
          aria-labelledby="admin-actions-heading"
          className="mt-6 rounded-xl border border-gray-200 bg-white p-6"
        >
          <h2
            id="admin-actions-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500"
          >
            Admin actions
          </h2>
          <p className="text-sm text-gray-400">Status management coming soon</p>
        </section>
      )}

      <footer className="mt-8">
        <Link
          href={`/boards/${slug}`}
          className="text-sm text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ← Back to board
        </Link>
      </footer>
    </main>
  );
}
