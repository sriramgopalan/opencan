"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { VisibilityFieldset } from "@/components/boards/VisibilityFieldset";
import type { BoardSettings } from "@/lib/board-settings";
import { api } from "@/lib/trpc";
import type { AdminBoard } from "@/types/board";

interface Props {
  board: AdminBoard;
}

export function BoardSettingsForm({ board }: Props) {
  const router = useRouter();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [slug, setSlug] = useState(board.slug);
  const [isPublic, setIsPublic] = useState(board.isPublic);
  const [isListed, setIsListed] = useState(board.isListed);
  const [whoCanPost, setWhoCanPost] = useState<BoardSettings["whoCanPost"]>(
    board.settings.whoCanPost,
  );
  const [guestVoting, setGuestVoting] = useState(board.settings.guestVotingEnabled);
  const [moderation, setModeration] = useState(board.settings.postModerationEnabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateMutation = api.boards.update.useMutation({
    onSuccess() {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    },
    onError(err) {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    updateMutation.mutate({
      id: board.id,
      name: name.trim(),
      description: description.trim() || null,
      slug: slug.trim(),
      isPublic,
      isListed,
      settings: { whoCanPost, guestVotingEnabled: guestVoting, postModerationEnabled: moderation },
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="settings-name">Name</label>
        <input
          id="settings-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
      </div>

      <div>
        <label htmlFor="settings-description">Description</label>
        <textarea
          id="settings-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
      </div>

      <div>
        <label htmlFor="settings-slug">URL slug</label>
        <input
          id="settings-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={50}
          required
        />
      </div>

      <VisibilityFieldset
        isPublic={isPublic}
        isListed={isListed}
        onPublicChange={setIsPublic}
        onListedChange={setIsListed}
      />

      <fieldset>
        <legend>Post settings</legend>
        <div>
          <label htmlFor="who-can-post">Who can post</label>
          <select
            id="who-can-post"
            value={whoCanPost}
            onChange={(e) => setWhoCanPost(e.target.value as BoardSettings["whoCanPost"])}
          >
            <option value="ANYONE">Anyone</option>
            <option value="AUTHENTICATED">Signed-in users</option>
            <option value="ADMINS_ONLY">Admins only</option>
          </select>
        </div>
        <label>
          <input
            type="checkbox"
            checked={guestVoting}
            onChange={(e) => setGuestVoting(e.target.checked)}
          />
          Allow guest voting
        </label>
        <label>
          <input
            type="checkbox"
            checked={moderation}
            onChange={(e) => setModeration(e.target.checked)}
          />
          Require post approval before publishing
        </label>
      </fieldset>

      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Settings saved.</p>}

      <button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
