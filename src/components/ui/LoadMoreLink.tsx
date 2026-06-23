import Link from "next/link";

interface Props {
  href: string;
  label?: string;
  className?: string;
}

export function LoadMoreLink({ href, label = "Load more", className }: Props) {
  return (
    <div className={className ?? "mt-6 text-center"}>
      <Link
        href={href}
        className="inline-flex rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {label}
      </Link>
    </div>
  );
}
