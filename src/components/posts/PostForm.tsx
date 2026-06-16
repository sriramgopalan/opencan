"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc";

interface Props {
  boardId: string;
  boardSlug: string;
  isAuthenticated: boolean;
}

export function PostForm({ boardId, boardSlug, isAuthenticated }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createPost = api.posts.create.useMutation({
    onSuccess(data) {
      router.push(`/boards/${boardSlug}/posts/${data.postNumber}`);
    },
    onError(err) {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createPost.mutate({
      boardId,
      title: title.trim(),
      description: description.trim() || undefined,
      guestName: !isAuthenticated ? guestName.trim() || undefined : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Submit feedback">
      {!isAuthenticated && (
        <div className="mb-4">
          <label htmlFor="guestName" className="mb-1 block text-sm font-medium text-gray-700">
            Your name <span aria-hidden="true">*</span>
          </label>
          <input
            id="guestName"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
            minLength={2}
            maxLength={50}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            aria-describedby={error ? "post-form-error" : undefined}
          />
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="postTitle" className="mb-1 block text-sm font-medium text-gray-700">
          Title <span aria-hidden="true">*</span>
        </label>
        <input
          id="postTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={5}
          maxLength={150}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-describedby={error ? "post-form-error" : undefined}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="postDescription" className="mb-1 block text-sm font-medium text-gray-700">
          Description{" "}
          <span className="font-normal text-gray-400">(optional, Markdown supported)</span>
        </label>
        <textarea
          id="postDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p id="post-form-error" role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={createPost.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {createPost.isPending ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
