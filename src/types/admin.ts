import type { PostStatus } from "@prisma/client";

export interface WorkspaceStats {
  totalBoards: number;
  totalPosts: number;
  totalVotes: number;
  totalComments: number;
  totalUsers: number;
  newPostsLast30Days: number;
  newUsersLast30Days: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  suspendedAt: Date | null;
  emailVerified: Date | null;
  createdAt: Date;
  _count: { posts: number; comments: number };
}

export interface AdminUsersResult {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PendingPost {
  id: string;
  postNumber: number;
  title: string;
  description: string | null;
  guestName: string | null;
  createdAt: Date;
  board: { id: string; slug: string; name: string };
  author: { id: string; name: string | null } | null;
}

export interface AdminPost {
  id: string;
  postNumber: number;
  title: string;
  description: string | null;
  status: PostStatus;
  isPinned: boolean;
  voteCount: number;
  guestName: string | null;
  authorId: string | null;
  createdAt: Date;
  board: { id: string; slug: string; name: string };
  author: { id: string; name: string | null; email: string } | null;
}

export interface AdminPostsResult {
  posts: AdminPost[];
  total: number;
  page: number;
  totalPages: number;
}
