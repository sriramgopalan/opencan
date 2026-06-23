import Link from "next/link";

import { auth } from "@/auth";

import { SignOutButton } from "./SignOutButton";

export async function SiteNav() {
  const session = await auth();
  const email = session?.user?.email;
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <header className="h-14 border-b border-gray-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/opencan-logo.png" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
            <span className="text-xl font-bold text-blue-600">OpenCan</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/boards"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Boards
            </Link>
            <Link
              href="/roadmap"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Roadmap
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Admin
              </Link>
            )}
          </div>
        </div>

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
