import Link from "next/link";

import { auth } from "@/auth";

import { SignOutButton } from "./SignOutButton";

export async function SiteNav() {
  const session = await auth();
  const email = session?.user?.email;

  return (
    <header className="h-14 border-b border-gray-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-gray-900 transition-colors hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          OpenCan
        </Link>

        {email ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-500 sm:inline">{email}</span>
            <SignOutButton />
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
