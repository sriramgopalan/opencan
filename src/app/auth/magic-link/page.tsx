"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MagicLinkContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const callbackUrl = `/api/auth/magic-link?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return (
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-xl font-semibold tracking-tight text-gray-900">
          Sign in with magic link
        </h1>
        <p className="text-sm text-gray-500">
          Click the button below to sign in. This link will open in the browser where you click
          it.
        </p>
        {email && (
          <p className="mt-3 text-sm text-gray-500">
            Signing in as <strong className="font-medium text-gray-900">{email}</strong>
          </p>
        )}
        <a href={callbackUrl} className="mt-6 block">
          <button
            type="button"
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign in
          </button>
        </a>
        <p className="mt-6 text-center text-sm text-gray-500">
          <a href="/auth/signin" className="font-medium text-blue-600 hover:text-blue-700">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense>
      <MagicLinkContent />
    </Suspense>
  );
}
