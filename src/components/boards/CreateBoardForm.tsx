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
      router.push(`/dashboard/boards/${data.slug}/settings`);
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
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="board-name">Name</label>
        <input
          id="board-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          aria-required="true"
        />
      </div>

      <div>
        <label htmlFor="board-description">Description</label>
        <textarea
          id="board-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
      </div>

      <div>
        <label htmlFor="board-slug">URL (optional — auto-generated from name)</label>
        <input
          id="board-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={50}
          pattern="^[a-z0-9-]+$"
          aria-describedby="board-slug-hint"
        />
        <span id="board-slug-hint">Lowercase letters, numbers, and hyphens only</span>
      </div>

      <VisibilityFieldset
        isPublic={isPublic}
        isListed={isListed}
        onPublicChange={setIsPublic}
        onListedChange={setIsListed}
        publicLabel="Public (visible to anyone with the URL)"
        listedLabel="Listed (appear on the public board index)"
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={createMutation.isPending || !name.trim()}>
        {createMutation.isPending ? "Creating…" : "Create board"}
      </button>
    </form>
  );
}
