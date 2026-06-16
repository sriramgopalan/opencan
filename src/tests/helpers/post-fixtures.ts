import { PostStatus } from "@prisma/client";

export const BOARD_ID = "cboard1234567890";
export const POST_ID = "cpost12345678901";
export const USER_ID = "cuser12345678901";

export const BASE_POST = {
  id: POST_ID,
  postNumber: 1,
  boardId: BOARD_ID,
  authorId: USER_ID,
  guestName: null,
  title: "My feature request",
  description: "Please add this",
  status: PostStatus.OPEN,
  isPinned: false,
  pinnedAt: null,
  voteCount: 0,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  author: { id: USER_ID, name: "Alice", email: "alice@example.com" },
};

export function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    postNumber: 1,
    boardId: BOARD_ID,
    guestName: null,
    title: "Test",
    description: null,
    status: PostStatus.OPEN,
    isPinned: false,
    voteCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}
