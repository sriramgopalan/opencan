import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";

export const metadata: Metadata = { title: "New board — Admin" };

export default async function NewBoardPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">Create a board</h1>
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <CreateBoardForm />
      </div>
    </main>
  );
}
