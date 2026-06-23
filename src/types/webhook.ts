export type WebhookEvent = "post.created" | "post.status_changed" | "comment.created";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "post.created",
  "post.status_changed",
  "comment.created",
];

export interface WebhookListItem {
  id: string;
  url: string;
  secretPreview: string; // last 4 chars of the secret
  events: WebhookEvent[];
  isActive: boolean;
  createdAt: Date;
}

export interface WebhookCreated extends WebhookListItem {
  secret: string; // full secret — returned only at creation time
}

export interface WebhookPayload<T = unknown> {
  event: WebhookEvent;
  occurredAt: string; // ISO-8601
  data: T;
}

export interface PostCreatedData {
  id: string;
  postNumber: number;
  boardId: string;
  title: string;
  status: string;
  authorId: string | null;
  createdAt: Date;
}

export interface PostStatusChangedData {
  id: string;
  postNumber: number;
  boardId: string;
  title: string;
  previousStatus: string;
  status: string;
}

export interface CommentCreatedData {
  id: string;
  postId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}
