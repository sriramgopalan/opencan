import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
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
  if (isNaN(num)) return { title: "Post not found — Etash" };
  const post = await getPostByNumber(slug, num, { isAdmin: false });
  if (!post) return { title: "Post not found — Etash" };
  return { title: `${post.title} — Etash` };
}

export default async function PostDetailPage({ params }: Props) {
  const { slug, postNumber } = await params;
  const num = parseInt(postNumber, 10);
  if (isNaN(num)) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const callerId = session?.user?.id;

  const post = await getPostByNumber(slug, num, {
    isAdmin,
    callerId,
  });
  if (!post) notFound();

  const adminPost = isAdmin ? (post as AdminPostView) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-2 text-sm text-gray-500">
          <li>
            <Link href="/boards" className="hover:text-blue-600">
              Boards
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/boards/${slug}`} className="hover:text-blue-600">
              {slug}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-700">
            #{post.postNumber}
          </li>
        </ol>
      </nav>

      <article>
        <div className="flex items-start gap-4">
          <VoteButton
            postId={post.id}
            initialVoteCount={post.voteCount}
            initialHasVoted={post.hasVoted}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {post.isPinned && (
                <span aria-label="Pinned" title="Pinned" className="text-blue-500">
                  📌
                </span>
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
          <div className="mt-6 rounded-md border border-gray-100 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-700">{post.description}</p>
          </div>
        )}
      </article>

      <footer className="mt-8">
        <Link
          href={`/boards/${slug}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to board
        </Link>
      </footer>
    </main>
  );
}
