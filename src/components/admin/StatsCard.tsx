interface StatsCardProps {
  label: string;
  value: number;
}

export function StatsCard({ label, value }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
