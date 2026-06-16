"use client";

import { useState } from "react";

import { api } from "@/lib/trpc";

interface Props {
  postId: string;
  initialVoteCount: number;
  initialHasVoted: boolean;
}

export function VoteButton({ postId, initialVoteCount, initialHasVoted }: Props) {
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [hasVoted, setHasVoted] = useState(initialHasVoted);

  const toggleVote = api.posts.toggleVote.useMutation({
    onSuccess(data) {
      setVoteCount(data.voteCount);
      setHasVoted(data.userHasVoted);
    },
  });

  function handleClick() {
    toggleVote.mutate({ postId });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggleVote.isPending}
      aria-label={hasVoted ? "Remove vote" : "Vote for this post"}
      aria-pressed={hasVoted}
      className={`flex flex-col items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        hasVoted
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span aria-hidden="true">{hasVoted ? "▲" : "△"}</span>
      <span>{voteCount}</span>
    </button>
  );
}
