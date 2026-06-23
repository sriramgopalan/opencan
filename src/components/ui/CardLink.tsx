import Link from "next/link";

interface Props {
  href: string;
  label: string;
  sublabel?: string;
}

export function CardLink({ href, label, sublabel }: Props) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span className="flex-1 font-medium text-gray-900">{label}</span>
      {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
    </Link>
  );
}
