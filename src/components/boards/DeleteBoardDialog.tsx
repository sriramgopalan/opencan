"use client";

import { AlertTriangle } from "lucide-react";
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
      router.push("/admin/boards");
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Delete board
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="rounded-xl border border-red-200 bg-red-50 p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" aria-hidden="true" />
        <h2 id="delete-dialog-title" className="text-base font-semibold text-gray-900">
          Delete board
        </h2>
      </div>

      <p className="text-sm text-gray-600">
        This action is permanent and cannot be undone. All posts, votes, and comments will be
        deleted.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Type{" "}
        <code className="rounded bg-gray-100 px-1 font-mono text-sm">{boardSlug}</code> to
        confirm.
      </p>

      <form onSubmit={handleDelete} noValidate className="mt-4 space-y-4">
        <div>
          <label htmlFor="confirm-slug" className="mb-1 block text-sm font-medium text-gray-700">
            Board URL
          </label>
          <input
            id="confirm-slug"
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            autoComplete="off"
            aria-describedby="confirm-hint"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span id="confirm-hint" className="mt-1 block text-xs text-gray-400">
            Enter the board URL exactly as shown above
          </span>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={deleteMutation.isPending || confirmInput !== boardSlug}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
