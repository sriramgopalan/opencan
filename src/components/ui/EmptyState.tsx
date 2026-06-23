import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  message?: string;
  cta?: { href: string; label: string };
}

export function EmptyState({ icon, title, message, cta }: Props) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center">
      {icon && <div className="mb-3">{icon}</div>}
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {message && <p className="mt-1 text-sm text-gray-500">{message}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
