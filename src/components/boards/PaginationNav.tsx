interface Props {
  page: number;
  totalPages: number;
}

export function PaginationNav({ page, totalPages }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination">
      <span>
        Page {page} of {totalPages}
      </span>
    </nav>
  );
}
