import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CreateBoardForm } from "@/components/boards/CreateBoardForm";

export const metadata: Metadata = { title: "New board — Dashboard" };

export default async function NewBoardPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  return (
    <main>
      <h1>Create a board</h1>
      <CreateBoardForm />
    </main>
  );
}
