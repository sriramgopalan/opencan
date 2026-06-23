export interface ChangelogEntryListItem {
  id: string;
  slug: string;
  title: string;
  publishedAt: Date;
  authorName: string | null;
  linkedPostCount: number;
}

export interface ChangelogEntryDetail {
  id: string;
  slug: string;
  title: string;
  body: string; // raw Markdown
  publishedAt: Date;
  authorName: string | null;
  linkedPosts: ChangelogLinkedPost[];
}

export interface ChangelogLinkedPost {
  id: string;
  postNumber: number;
  title: string;
  status: string;
  boardSlug: string;
  boardName: string;
}

export interface ChangelogAdminItem {
  id: string;
  slug: string;
  title: string;
  publishedAt: Date | null; // null = draft
  createdAt: Date;
  authorName: string | null;
  linkedPostCount: number;
}
