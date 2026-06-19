import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";

const primaryCta =
  "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";
const secondaryCta =
  "inline-flex items-center rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";

export default async function Home() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const isSignedIn = !!session?.user;

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:py-32">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
        Collect feedback. Ship what matters.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-gray-500">
        OpenCan is open-source customer feedback management. Self-host for free.
      </p>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Link href="/boards" className={primaryCta}>
          Browse boards
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {!isSignedIn && (
          <Link href="/auth/signin" className={secondaryCta}>
            Sign in
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin/boards" className={secondaryCta}>
            Admin Dashboard
          </Link>
        )}
      </div>
    </main>
  );
}
