import type { BoardSettings } from "@/lib/board-settings";

export interface SafeBoard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isListed: boolean;
  settings: BoardSettings;
  createdAt: Date;
}

export interface AdminBoard extends SafeBoard {
  ownerId: string;
  position: number;
  updatedAt: Date;
  _count: { posts: number; votes: number };
}

export interface BoardListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isListed: boolean;
  position: number;
  createdAt: Date;
}

export interface BoardListResult {
  boards: BoardListItem[];
  total: number;
  page: number;
  totalPages: number;
}
