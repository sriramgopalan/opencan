import { AppError } from "@/lib/errors";

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64");
}

export function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length < 2 || !parts[1]) {
      throw new AppError("VALIDATION_ERROR", "Invalid pagination cursor.");
    }
    return parts[1];
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("VALIDATION_ERROR", "Invalid pagination cursor.");
  }
}

export function sliceAndCursor<T extends { id: string }>(
  rows: T[],
  limit: number,
  getDate: (item: T) => Date,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(getDate(last), last.id) : null };
}
