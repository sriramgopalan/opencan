"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { VisibilityFieldset } from "@/components/boards/VisibilityFieldset";
import { api } from "@/lib/trpc";

export function CreateBoardForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isListed, setIsListed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = api.boards.create.useMutation({
    onSuccess(data) {
      router.push(`/admin/boards/${data.slug}/settings`);
    },
    onError(err) {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      slug: slug.trim() || undefined,
      isPublic,
      isListed,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div>
        <label htmlFor="board-name" className="mb-1 block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="board-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          aria-required="true"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="board-description" className="mb-1 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="board-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="board-slug" className="mb-1 block text-sm font-medium text-gray-700">
          URL (optional — auto-generated from name)
        </label>
        <input
          id="board-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={50}
          pattern="^[a-z0-9-]+$"
          aria-describedby="board-slug-hint"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span id="board-slug-hint" className="mt-1 block text-xs text-gray-400">
          Lowercase letters, numbers, and hyphens only
        </span>
      </div>

      <VisibilityFieldset
        isPublic={isPublic}
        isListed={isListed}
        onPublicChange={setIsPublic}
        onListedChange={setIsListed}
        publicLabel="Public (visible to anyone with the URL)"
        listedLabel="Listed (appear on the public board index)"
      />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={createMutation.isPending || !name.trim()}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {createMutation.isPending ? "Creating…" : "Create board"}
      </button>
    </form>
  );
}
