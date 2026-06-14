"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/trpc";

interface Props {
  boardId: string;
  boardSlug: string;
}

export function DeleteBoardDialog({ boardId, boardSlug }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = api.boards.delete.useMutation({
    onSuccess() {
      router.push("/dashboard/boards");
    },
    onError(err) {
      setError(err.message);
    },
  });

  function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    deleteMutation.mutate({ id: boardId, confirmSlug: confirmInput });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Delete board
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
      <h2 id="delete-dialog-title">Delete board</h2>
      <p>
        This action is permanent and cannot be undone. All posts, votes, and comments will
        be deleted.
      </p>
      <p>
        Type <strong>{boardSlug}</strong> to confirm.
      </p>
      <form onSubmit={handleDelete} noValidate>
        <label htmlFor="confirm-slug">Board URL</label>
        <input
          id="confirm-slug"
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          autoComplete="off"
          aria-describedby="confirm-hint"
        />
        <span id="confirm-hint">Enter the board URL exactly as shown above</span>

        {error && <p role="alert">{error}</p>}

        <button
          type="submit"
          disabled={deleteMutation.isPending || confirmInput !== boardSlug}
        >
          {deleteMutation.isPending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmInput("");
            setError(null);
          }}
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
