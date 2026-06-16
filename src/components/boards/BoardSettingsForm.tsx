"use client";

import { AlertCircle, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { VisibilityFieldset } from "@/components/boards/VisibilityFieldset";
import { Switch } from "@/components/ui/Switch";
import type { BoardSettings } from "@/lib/board-settings";
import { api } from "@/lib/trpc";
import type { AdminBoard } from "@/types/board";

interface Props {
  board: AdminBoard;
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "mb-1 block text-sm font-medium text-gray-700";

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
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="settings-name" className={labelClass}>
          Name
        </label>
        <input
          id="settings-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="settings-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="settings-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="settings-slug" className={labelClass}>
          URL slug
        </label>
        <input
          id="settings-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={50}
          required
          className={inputClass}
        />
      </div>

      <VisibilityFieldset
        isPublic={isPublic}
        isListed={isListed}
        onPublicChange={setIsPublic}
        onListedChange={setIsListed}
      />

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-medium text-gray-700">Post settings</legend>

        <div>
          <label htmlFor="who-can-post" className={labelClass}>
            Who can post
          </label>
          <select
            id="who-can-post"
            value={whoCanPost}
            onChange={(e) => setWhoCanPost(e.target.value as BoardSettings["whoCanPost"])}
            className={inputClass}
          >
            <option value="ANYONE">Anyone</option>
            <option value="AUTHENTICATED">Signed-in users</option>
            <option value="ADMINS_ONLY">Admins only</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span id="guest-voting-label" className="text-sm text-gray-700">
            Allow guest voting
          </span>
          <Switch
            checked={guestVoting}
            aria-labelledby="guest-voting-label"
            onCheckedChange={setGuestVoting}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <span id="moderation-label" className="text-sm text-gray-700">
            Require post approval before publishing
          </span>
          <Switch
            checked={moderation}
            aria-labelledby="moderation-label"
            onCheckedChange={setModeration}
          />
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-green-600">
          <CheckCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Settings saved.
        </p>
      )}

      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {updateMutation.isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
