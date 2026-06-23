import type { PostStatus } from "@prisma/client";

export type { PostStatus };

export interface PublicPostView {
  id: string;
  postNumber: number;
  boardId: string;
  guestName: string | null;
  title: string;
  description: string | null;
  status: PostStatus;
  isPinned: boolean;
  voteCount: number;
  hasVoted: boolean;
  createdAt: Date;
}

export interface AdminPostView extends PublicPostView {
  authorId: string | null;
  author: { id: string; name: string | null; email: string } | null;
  pinnedAt: Date | null;
  updatedAt: Date;
}

export interface PostListItem {
  id: string;
  postNumber: number;
  title: string;
  description: string | null;
  status: PostStatus;
  isPinned: boolean;
  voteCount: number;
  hasVoted: boolean;
  createdAt: Date;
  guestName?: string | null;
  authorId?: string | null;
  author?: { name: string | null } | null;
}

export interface PostListResult {
  items: PostListItem[];
  nextCursor: string | null;
}

export interface CreatedPost {
  id: string;
  postNumber: number;
  boardId: string;
  authorId: string | null;
  guestName: string | null;
  title: string;
  description: string | null;
  status: PostStatus;
  isPinned: boolean;
  voteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimilarPost {
  postNumber: number;
  title: string;
  voteCount: number;
  status: PostStatus;
}

export type PostViewer = {
  isAdmin: boolean;
  callerId?: string;
  hashedIp?: string;
};

export interface RoadmapPost {
  id: string;
  postNumber: number;
  boardId: string;
  boardSlug: string;
  boardName: string;
  title: string;
  description: string | null;
  status: PostStatus;
  voteCount: number;
  createdAt: Date;
}
