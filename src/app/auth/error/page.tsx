"use client";

import { AlertCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with a different sign-in method.",
  NoEmail: "Your account does not have an email address.",
  Configuration: "There is a server configuration error.",
  AccessDenied: "Access was denied.",
  Verification: "The verification link is invalid or has expired.",
  LinkExpired: "This sign-in link has expired. Please request a new one.",
  InvalidLink: "This sign-in link is invalid or has already been used.",
  UserNotFound: "No account found for this email address. Please register first.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? "Configuration";
  const provider = searchParams.get("provider");

  const baseMessage = ERROR_MESSAGES[errorCode] ?? "An unexpected error occurred.";
  const message =
    errorCode === "OAuthAccountNotLinked" && provider
      ? `This email is already registered with ${provider}.`
      : baseMessage;

  return (
    <main className="mx-auto flex max-w-sm flex-col px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-md">
        <div className="mb-4 flex justify-center">
          <AlertCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
        </div>
        <h1 className="mb-3 text-center text-xl font-semibold tracking-tight text-gray-900">
          Authentication error
        </h1>
        <p role="alert" className="text-center text-sm text-gray-600">
          {message}
        </p>
        <a
          href="/auth/signin"
          className="mt-6 block w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Back to sign in
        </a>
      </div>
    </main>
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
