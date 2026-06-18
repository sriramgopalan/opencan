import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { getPendingPostCount } from "@/server/repositories/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const pendingCount = await getPendingPostCount();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 px-4 py-8">
        <p className="mb-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Admin
        </p>
        <AdminNav pendingCount={pendingCount} />
      </aside>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
