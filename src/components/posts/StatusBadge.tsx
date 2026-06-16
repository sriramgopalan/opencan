import type { PostStatus } from "@/types/post";

const STATUS_LABELS: Record<PostStatus, string> = {
  PENDING: "Pending",
  OPEN: "Open",
  UNDER_REVIEW: "Under Review",
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  SHIPPED: "Shipped",
  CLOSED: "Closed",
};

const STATUS_CLASSES: Record<PostStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  OPEN: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-purple-100 text-purple-800",
  PLANNED: "bg-indigo-100 text-indigo-800",
  IN_PROGRESS: "bg-orange-100 text-orange-800",
  SHIPPED: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-600",
};

interface Props {
  status: PostStatus;
}

export function StatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
